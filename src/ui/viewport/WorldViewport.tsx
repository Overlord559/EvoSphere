import { useEffect, useRef } from "react";

import { Application } from "pixi.js";

import { useSimulationStore } from "../../store/simulationStore";

import { globalProfiler } from "../../simulation/engine/performanceProfiler";

import { globalSoakTelemetry } from "../../simulation/engine/soakTelemetry";

import { readHeapEstimateMb } from "../../simulation/engine/simHealth";

import { getTileAtRaw } from "../../simulation/world";

import { agentsOnTile } from "../../simulation/agents/AgentSystem";

import { OVERLAY_MODES } from "./tileColors";

import {
  createRenderLayers,
  countPixiGraphics,
  countPixiContainers,
  type RenderLayers,
} from "./renderLayers";

import { renderWorld, type RedrawMode } from "./organismRenderer";

import {
  cameraFocusOnTile,
  computeVisibleTileBounds,
  type ViewBounds,
} from "./viewportCulling";

import {
  CAMERA_INSPECT_ZOOM,
  clampPanToPlanet,
  clampZoom,
  centerPlanet,
  fitPlanetToViewport,
  zoomOutOneLevel,
  zoomAtScreenPoint,
  cameraModeLabel,
} from "./cameraController";

import {
  getGlyphCacheSize,
  getRenderTextureCount,
  getTerrainCacheSize,
  noteTerrainRedraw,
} from "./renderCache";

import { registerViewportRaf, unregisterViewportRaf, countActiveRafLoops } from "./lifecycleGuards";
import { autoAdjustQualityTier } from "./renderQualityTier";
import {
  processSimulationFrame,
  setViewportDrivesSimulation,
} from "../../store/simulationStore";

import { SoakDebugHUD } from "../panels/SoakDebugHUD";
import { resolveCameraPreset2D } from "../showcase/cameraPresets";
const BASE_TILE_SIZE = 6;

const DRAG_THRESHOLD = 4;
interface ViewportState {
  panX: number;

  panY: number;

  zoom: number;
}
export function WorldViewport({ pipelineMode = '2.5d' }: { pipelineMode?: 'classic2d' | '2.5d' | '3d' }) {
  const heightShading = pipelineMode === '2.5d'
  const containerRef = useRef<HTMLDivElement>(null);

  const appRef = useRef<Application | null>(null);

  const layersRef = useRef<RenderLayers | null>(null);

  const viewportRef = useRef<ViewportState>({ panX: 0, panY: 0, zoom: 1 });

  const viewSizeRef = useRef({ width: 800, height: 600 });

  const dragRef = useRef({ active: false, lastX: 0, lastY: 0, moved: false });

  const lastSnapshotVersionRef = useRef(-1);

  const lastTerrainWorldIdRef = useRef<string | null>(null);

  const terrainRedrawCountRef = useRef(0);
  const qualityBadFramesRef = useRef(0);
  const qualityGoodFramesRef = useRef(0);
  const lastQualityAdjustMsRef = useRef(0);
  const overlayMode = useSimulationStore((s) => s.overlayMode);

  const visualMode = useSimulationStore((s) => s.visualMode);

  const setOverlayMode = useSimulationStore((s) => s.setOverlayMode);

  const setVisualMode = useSimulationStore((s) => s.setVisualMode);

  const selectTile = useSimulationStore((s) => s.selectTile);

  const selectSpecies = useSimulationStore((s) => s.selectSpecies);

  const selectedTile = useSimulationStore((s) => s.selectedTile);

  const snapshot = useSimulationStore((s) => s.snapshot);

  const renderSnapshotVersion = useSimulationStore(
    (s) => s.snapshot.renderSnapshotVersion,
  );

  const recentActivityTiles = useSimulationStore((s) => s.recentActivityTiles);

  const selectedSpeciesId = useSimulationStore((s) => s.selectedSpeciesId);

  const agentVisualStates = useSimulationStore((s) => s.agentVisualStates);

  const animTimeMs = useSimulationStore((s) => s.animTimeMs);

  const advanceAnimation = useSimulationStore((s) => s.advanceAnimation);

  const runtime = useSimulationStore((s) => s.runtime);

  const cameraFocusRequest = useSimulationStore((s) => s.cameraFocusRequest);

  const clearCameraFocusRequest = useSimulationStore(
    (s) => s.clearCameraFocusRequest,
  );

  const updatePerformanceStats = useSimulationStore(
    (s) => s.updatePerformanceStats,
  );

  const focusTile = useSimulationStore((s) => s.focusTile);

  const setUserCameraOverride = useSimulationStore(
    (s) => s.setUserCameraOverride,
  );

  const exitFocus = useSimulationStore((s) => s.exitFocus);

  const stopFollowing = useSimulationStore((s) => s.stopFollowing);

  const resetCameraView = useSimulationStore((s) => s.resetCameraView);

  const zoomOutCamera = useSimulationStore((s) => s.zoomOutCamera);

  const fitPlanetCamera = useSimulationStore((s) => s.fitPlanetCamera);

  const cameraResetSeq = useSimulationStore((s) => s.cameraResetSeq);

  const cameraZoomOutSeq = useSimulationStore((s) => s.cameraZoomOutSeq);

  const cameraFitPlanetSeq = useSimulationStore((s) => s.cameraFitPlanetSeq);
  const screenshotMode = useSimulationStore((s) => s.screenshotMode);
  const uiHidden = useSimulationStore((s) => s.uiHidden);
  const soakHudExpanded = useSimulationStore((s) => s.soakHudExpanded);
  const renderPipeline = useSimulationStore((s) => s.renderPipeline);
  const setRenderQualityTier = useSimulationStore((s) => s.setRenderQualityTier);
  const world = snapshot.world;

  const speciesTileIndices = selectedSpeciesId
    ? (snapshot.life.speciesOccupancy[selectedSpeciesId]?.tileIndices ?? null)
    : null;
  const applyCamera = (next: ViewportState) => {
    const clamped = clampPanToPlanet(
      world,

      BASE_TILE_SIZE,

      viewSizeRef.current.width,

      viewSizeRef.current.height,

      { panX: next.panX, panY: next.panY, zoom: clampZoom(next.zoom) },
    );

    viewportRef.current = clamped;

    layersRef.current?.root.position.set(clamped.panX, clamped.panY);

    layersRef.current?.root.scale.set(clamped.zoom);

    globalSoakTelemetry.recordCameraUpdate();
  };
  const redrawRef = useRef<() => void>(() => {});
  const redraw = (mode: RedrawMode = "snapshot") => {
    const layers = layersRef.current;

    const host = containerRef.current;

    if (!layers || !host) return;
    const state = useSimulationStore.getState();

    const versionChanged =
      state.snapshot.renderSnapshotVersion !== lastSnapshotVersionRef.current;

    if (
      mode === "animated" &&
      !state.runtime.isRunning &&
      !state.deepTimeRunning
    ) {
      return;
    }

    if (
      mode === "snapshot" &&
      !versionChanged &&
      state.animTimeMs === animTimeMs
    ) {
      return;
    }
    if (mode === "snapshot" || versionChanged) {
      lastSnapshotVersionRef.current = state.snapshot.renderSnapshotVersion;
    }
    const terrainWorldChanged =
      state.snapshot.worldId !== lastTerrainWorldIdRef.current;

    lastTerrainWorldIdRef.current = state.snapshot.worldId;

    const skipTerrain =
      mode === "animated" || (!terrainWorldChanged && mode !== "full");
    const vp = viewportRef.current;

    const viewBounds: ViewBounds = computeVisibleTileBounds(
      state.snapshot.world,

      {
        panX: vp.panX,

        panY: vp.panY,

        zoom: vp.zoom,

        viewWidth: viewSizeRef.current.width,

        viewHeight: viewSizeRef.current.height,
      },

      BASE_TILE_SIZE,

      3,
    );
    const renderStart = performance.now();

    const stats = renderWorld(layers, {
      world: state.snapshot.world,

      overlay: state.overlayMode,

      tileSize: BASE_TILE_SIZE,

      zoom: vp.zoom,

      visualMode: state.visualMode,

      tileCounts: state.snapshot.life.tileCounts,

      tileBiomass: state.snapshot.life.tileBiomass,

      organisms: state.snapshot.life.organisms,

      agents: state.snapshot.agents.agents,

      populationUnits: state.snapshot.life.populationUnits,

      agentVisualStates: state.agentVisualStates,

      animTimeMs: state.animTimeMs,

      simTick: state.snapshot.tick,

      activityTiles: state.recentActivityTiles,

      stressTileIds: state.snapshot.disasters?.stressTileIds,

      speciesTileIndices: state.selectedSpeciesId
        ? (state.snapshot.life.speciesOccupancy[state.selectedSpeciesId]
            ?.tileIndices ?? null)
        : null,

      selectedSpeciesId: state.selectedSpeciesId,

      selectedTile: state.selectedTile,

      viewBounds,

      skipTerrainRedraw: skipTerrain,

      redrawMode: mode,

      renderOverload:
        state.runtime.performance.crashRiskLevel === 'high' ||
        state.runtime.speed === 'ultrafast',

      debugRenderOverride: state.visualMode === 'debug',
      heightShading,
      species: state.snapshot.life.species,
      recentlyReseededSpeciesIds: state.recentlyReseededSpeciesIds,
      recentlyReseededTileIndices: state.recentlyReseededTileIndices,
      reseedVisualEffects: state.reseedVisualEffects,
      reseedVisualNowMs: state.animTimeMs,
      qualityTier: state.renderQualityTier,
      showcaseAggregateMode: state.showcaseMode || state.arcadeEvolutionMode || state.screenshotMode,
      showcaseSnapshot: state.snapshot,
      showcaseEraLabel: state.snapshot.briefing.era ?? state.snapshot.eraDirector?.focusLayer ?? undefined,
    });
    if (stats.terrainRedrawn) {
      terrainRedrawCountRef.current += 1;

      noteTerrainRedraw(state.snapshot.worldId, state.overlayMode);
    }
    const renderMs = performance.now() - renderStart;

    globalProfiler.recordRenderMs(renderMs);

    const nowMs = performance.now();
    if (nowMs - lastQualityAdjustMsRef.current >= 500) {
      lastQualityAdjustMsRef.current = nowMs;
      const adjusted = autoAdjustQualityTier(
        renderMs,
        state.renderQualityTier,
        16.67,
        qualityBadFramesRef.current,
        qualityGoodFramesRef.current,
      );
      qualityBadFramesRef.current = adjusted.badFrames;
      qualityGoodFramesRef.current = adjusted.goodFrames;
      if (adjusted.tier !== state.renderQualityTier) {
        setRenderQualityTier(adjusted.tier);
      }
    }

    const pixiCount = countPixiGraphics(layers.root);

    const containerCount = countPixiContainers(layers.root);

    globalProfiler.setPixiObjectEstimate(pixiCount);

    updatePerformanceStats({
      ...stats,
      renderMsLastFrame: renderMs,
      renderQualityTier: stats.renderBudget.qualityTier ?? state.renderQualityTier,

      renderedMovingGlyphs: stats.renderBudget.renderedMovingGlyphs,
      renderedProducerGlyphs: stats.renderBudget.renderedProducerGlyphs,
      visibleCohortCount: stats.renderBudget.visibleCohortCount,
      skippedGlyphs: stats.renderBudget.skippedGlyphs,
      skippedMovingGlyphs: stats.renderBudget.skippedMovingGlyphs,
      skippedProducerGlyphs: stats.renderBudget.skippedProducerGlyphs,
      skippedStaticMarkers: stats.renderBudget.skippedStaticMarkers,
      candidateMovingGlyphs: stats.renderBudget.candidateMovingGlyphs,
      candidateProducerGlyphs: stats.renderBudget.candidateProducerGlyphs,
      candidateStaticGlyphs: stats.renderBudget.candidateStaticGlyphs,
      densityOnlyMode: stats.renderBudget.densityOnlyMode,
      maxMovingGlyphCap: stats.renderBudget.maxMovingCap,
      maxProducerGlyphCap: stats.renderBudget.maxProducerCap,
      renderedStaticMarkers: stats.renderBudget.renderedStaticMarkers,
      livingSpeciesMarked: stats.renderBudget.livingSpeciesMarked,
      showcaseAggregateTiles: stats.renderBudget.showcaseAggregateTiles,
      showcaseAggregateMarkers: stats.renderBudget.showcaseAggregateMarkers,
      estimatedPopVsRenderedReps: `${state.snapshot.life.totalBiologicalPopulation + state.snapshot.agents.totalMobilePopulation} est / ${stats.renderBudget.renderedMovingGlyphs} moving + ${stats.renderBudget.renderedStaticMarkers} static`,

      pixiGraphicsCount: pixiCount,

      pixiContainerCount: containerCount,

      renderTextureCount: getRenderTextureCount(),

      terrainCacheSize: getTerrainCacheSize(),

      glyphCacheSize: getGlyphCacheSize(),

      terrainRedrawCount: terrainRedrawCountRef.current,
      renderPipelineDisplay: renderPipeline,
      rafLoopCount: countActiveRafLoops(),

      heapEstimateMb: readHeapEstimateMb(),

      cameraMode: state.runtime.cameraMode,
    });
  };
  redrawRef.current = () => redraw("full");
  useEffect(() => {
    const host = containerRef.current;

    if (!host) return;
    let destroyed = false;

    let app: Application | null = null;

    let cleanupListeners: (() => void) | undefined;

    let animFrameId = 0;

    let lastAnimMs = performance.now();

    unregisterViewportRaf()
    const rafOk = registerViewportRaf();
    if (!rafOk) {
      console.warn("[WorldViewport] duplicate viewport RAF blocked — stale loop may exist");
    }
    setViewportDrivesSimulation(true);
    const run = async () => {
      app = new Application();

      await app.init({
        background: 0x0a0e14,

        antialias: true,

        resolution: window.devicePixelRatio || 1,

        autoDensity: true,
      });
      if (destroyed) {
        app.destroy(true);

        return;
      }
      host.innerHTML = "";

      host.appendChild(app.canvas);
      const layers = createRenderLayers();

      app.stage.addChild(layers.root);

      appRef.current = app;

      layersRef.current = layers;
      const resize = () => {
        if (!app || destroyed) return;

        app.renderer.resize(host.clientWidth, host.clientHeight);

        viewSizeRef.current = {
          width: host.clientWidth,
          height: host.clientHeight,
        };
      };

      resize();

      const observer = new ResizeObserver(resize);

      observer.observe(host);
      const animLoop = (now: number) => {
        if (destroyed) return;

        processSimulationFrame();

        const delta = now - lastAnimMs;

        lastAnimMs = now;

        const state = useSimulationStore.getState();

        if (!state.deepTimeRunning) {
          state.advanceAnimation(delta);
        }
        const target = state.runtime.followPanTarget;

        if (
          target &&
          state.runtime.followSelectedSpecies &&
          !state.runtime.userCameraOverride &&
          layersRef.current &&
          host
        ) {
          const focus = cameraFocusOnTile(
            target.tileX,

            target.tileY,

            BASE_TILE_SIZE,

            host.clientWidth,

            host.clientHeight,

            viewportRef.current.zoom,
          );

          applyCamera({
            ...viewportRef.current,
            panX: focus.panX,
            panY: focus.panY,
          });
        }
        redraw("animated");

        animFrameId = requestAnimationFrame(animLoop);
      };

      animFrameId = requestAnimationFrame(animLoop);
      const onUserCameraInput = () => {
        const state = useSimulationStore.getState();

        if (!state.runtime.lockedFollow) {
          setUserCameraOverride(true);
        }
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();

        onUserCameraInput();

        const rect = app!.canvas.getBoundingClientRect();
        const screenX = e.clientX - rect.left;
        const screenY = e.clientY - rect.top;
        const vp = viewportRef.current;
        const delta = e.deltaY > 0 ? 0.9 : 1.1;

        applyCamera(
          zoomAtScreenPoint(vp, screenX, screenY, vp.zoom * delta),
        );
      };
      const onPointerDown = (e: PointerEvent) => {
        dragRef.current = {
          active: true,
          lastX: e.clientX,
          lastY: e.clientY,
          moved: false,
        };
      };
      const onPointerMove = (e: PointerEvent) => {
        const drag = dragRef.current;

        if (!drag.active) return;

        const dx = e.clientX - drag.lastX;

        const dy = e.clientY - drag.lastY;

        if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) {
          drag.moved = true;

          onUserCameraInput();
        }

        drag.lastX = e.clientX;

        drag.lastY = e.clientY;

        const vp = viewportRef.current;

        applyCamera({ ...vp, panX: vp.panX + dx, panY: vp.panY + dy });
      };
      const onPointerUp = () => {
        dragRef.current.active = false;
      };
      const onClick = (e: MouseEvent) => {
        if (dragRef.current.moved || !app) return;

        const state = useSimulationStore.getState();

        const currentWorld = state.snapshot.world;

        const rect = app.canvas.getBoundingClientRect();

        const vp = viewportRef.current;

        const localX = (e.clientX - rect.left - vp.panX) / vp.zoom;

        const localY = (e.clientY - rect.top - vp.panY) / vp.zoom;

        const tx = Math.floor(localX / BASE_TILE_SIZE);

        const ty = Math.floor(localY / BASE_TILE_SIZE);
        const tileAgents = agentsOnTile(state.snapshot.agents.agents, tx, ty);

        if (tileAgents.length > 0) {
          selectSpecies(tileAgents[0].speciesId);
        }
        const rawTile = getTileAtRaw(currentWorld, tx, ty);

        selectTile(rawTile ?? null);
      };
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Escape") {
          exitFocus();

          applyCamera(
            centerPlanet(
              world,
              BASE_TILE_SIZE,
              host.clientWidth,
              host.clientHeight,
              viewportRef.current.zoom,
            ),
          );
        }
      };
      app.canvas.addEventListener("wheel", onWheel, { passive: false });

      app.canvas.addEventListener("pointerdown", onPointerDown);

      app.canvas.addEventListener("pointermove", onPointerMove);

      app.canvas.addEventListener("pointerup", onPointerUp);

      app.canvas.addEventListener("pointerleave", onPointerUp);

      app.canvas.addEventListener("click", onClick);

      window.addEventListener("keydown", onKeyDown);
      redrawRef.current();

      const bootState = useSimulationStore.getState();
      if (bootState.cameraFocusRequest) {
        const req = bootState.cameraFocusRequest;
        const zoom = req.zoom ?? CAMERA_INSPECT_ZOOM;
        const focus = cameraFocusOnTile(
          req.tileX,
          req.tileY,
          BASE_TILE_SIZE,
          host.clientWidth,
          host.clientHeight,
          clampZoom(zoom),
        );
        applyCamera({ panX: focus.panX, panY: focus.panY, zoom: clampZoom(zoom) });
        bootState.clearCameraFocusRequest();
      } else if (bootState.showcaseMode || bootState.arcadeEvolutionMode || bootState.screenshotMode) {
        const resolved = resolveCameraPreset2D(
          bootState.snapshot,
          bootState.showcaseCameraPreset,
        );
        if (resolved.fitPlanet) {
          applyCamera(
            fitPlanetToViewport(
              world,
              BASE_TILE_SIZE,
              host.clientWidth,
              host.clientHeight,
            ),
          );
        } else if (resolved.tileX != null && resolved.tileY != null) {
          const zoom = resolved.zoom ?? CAMERA_INSPECT_ZOOM;
          const focus = cameraFocusOnTile(
            resolved.tileX,
            resolved.tileY,
            BASE_TILE_SIZE,
            host.clientWidth,
            host.clientHeight,
            clampZoom(zoom),
          );
          applyCamera({ panX: focus.panX, panY: focus.panY, zoom: clampZoom(zoom) });
        }
      } else {
        applyCamera(
          fitPlanetToViewport(
            world,
            BASE_TILE_SIZE,
            host.clientWidth,
            host.clientHeight,
          ),
        );
      }
      cleanupListeners = () => {
        cancelAnimationFrame(animFrameId);

        observer.disconnect();

        window.removeEventListener("keydown", onKeyDown);

        app?.canvas.removeEventListener("wheel", onWheel);

        app?.canvas.removeEventListener("pointerdown", onPointerDown);

        app?.canvas.removeEventListener("pointermove", onPointerMove);

        app?.canvas.removeEventListener("pointerup", onPointerUp);

        app?.canvas.removeEventListener("pointerleave", onPointerUp);

        app?.canvas.removeEventListener("click", onClick);
      };
    };
    run();
    return () => {
      destroyed = true;

      setViewportDrivesSimulation(false);
      unregisterViewportRaf();

      cleanupListeners?.();

      if (appRef.current) {
        appRef.current.destroy(true, { children: true });

        appRef.current = null;

        layersRef.current = null;
      }

      host.innerHTML = "";
    };
  }, [
    world.id,
    selectTile,
    selectSpecies,
    advanceAnimation,
    updatePerformanceStats,
    setUserCameraOverride,
    exitFocus,
  ]);
  useEffect(() => {
    if (!cameraFocusRequest || !layersRef.current || !containerRef.current)
      return;

    const host = containerRef.current;

    const zoom = cameraFocusRequest.zoom ?? CAMERA_INSPECT_ZOOM;

    const focus = cameraFocusOnTile(
      cameraFocusRequest.tileX,

      cameraFocusRequest.tileY,

      BASE_TILE_SIZE,

      host.clientWidth,

      host.clientHeight,

      clampZoom(zoom),
    );

    applyCamera({ panX: focus.panX, panY: focus.panY, zoom: clampZoom(zoom) });

    clearCameraFocusRequest();

    redrawRef.current();
  }, [cameraFocusRequest, clearCameraFocusRequest]);
  useEffect(() => {
    const host = containerRef.current;

    if (!host || !layersRef.current) return;

    applyCamera(
      centerPlanet(
        world,
        BASE_TILE_SIZE,
        host.clientWidth,
        host.clientHeight,
        1,
      ),
    );

    redrawRef.current();
  }, [cameraResetSeq, world.id]);
  useEffect(() => {
    applyCamera({
      ...viewportRef.current,
      zoom: zoomOutOneLevel(viewportRef.current.zoom),
    });

    redrawRef.current();
  }, [cameraZoomOutSeq]);
  useEffect(() => {
    const host = containerRef.current;

    if (!host || !layersRef.current) return;

    applyCamera(
      fitPlanetToViewport(
        world,
        BASE_TILE_SIZE,
        host.clientWidth,
        host.clientHeight,
      ),
    );

    redrawRef.current();
  }, [cameraFitPlanetSeq, world.id]);
  useEffect(() => {
    redraw("snapshot");
  }, [
    renderSnapshotVersion,

    overlayMode,

    visualMode,

    selectedTile,

    recentActivityTiles,

    speciesTileIndices,

    selectedSpeciesId,

    agentVisualStates,

    animTimeMs,

    runtime.isRunning,
  ]);
  const showCameraControls =
    runtime.cameraMode !== "free" ||
    runtime.followSelectedSpecies ||
    selectedTile !== null;
  const hideViewportChrome = screenshotMode || uiHidden;
  return (
    <div className={`flex min-h-[320px] flex-1 flex-col ${hideViewportChrome ? '' : 'rounded-lg border border-command-border bg-command-surface/60'}`}>
      {!hideViewportChrome && (
      <div className="flex flex-wrap items-center gap-1 border-b border-command-border p-2">
        <span className="mr-2 font-mono text-xs text-slate-500">OVERLAY</span>

        {OVERLAY_MODES.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            onClick={() => setOverlayMode(id)}
            aria-pressed={overlayMode === id}
            className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
              overlayMode === id
                ? "bg-command-accent/15 text-command-accent"
                : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}

        <span className="mx-2 text-slate-600">|</span>

        <span className="mr-1 font-mono text-xs text-slate-500">VISUAL</span>

        <button
          type="button"
          onClick={() => setVisualMode("organic")}
          aria-pressed={visualMode === "organic"}
          className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
            visualMode === "organic"
              ? "bg-emerald-500/15 text-emerald-400"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          Organic
        </button>

        <button
          type="button"
          onClick={() => setVisualMode("debug")}
          aria-pressed={visualMode === "debug"}
          className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
            visualMode === "debug"
              ? "bg-amber-500/15 text-amber-400"
              : "text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          Debug
        </button>

        <span className="mx-2 text-slate-600">|</span>

        <span className="font-mono text-[10px] text-cyan-400/80">
          CAM {cameraModeLabel(runtime.cameraMode)}
        </span>

        {showCameraControls && (
          <>
            <button type="button" onClick={exitFocus} className="cam-btn">
              Exit Focus
            </button>

            <button type="button" onClick={zoomOutCamera} className="cam-btn">
              Zoom Out
            </button>

            <button type="button" onClick={resetCameraView} className="cam-btn">
              Reset Camera
            </button>

            {runtime.followSelectedSpecies && (
              <button type="button" onClick={stopFollowing} className="cam-btn">
                Stop Following
              </button>
            )}

            <button type="button" onClick={fitPlanetCamera} className="cam-btn">
              Fit Planet
            </button>
          </>
        )}

        {selectedTile && (
          <button
            type="button"
            onClick={() =>
              focusTile(selectedTile.x, selectedTile.y, CAMERA_INSPECT_ZOOM)
            }
            className="rounded border border-cyan-500/30 px-2 py-0.5 font-mono text-[10px] text-cyan-300 hover:bg-cyan-500/10"
          >
            Zoom to tile
          </button>
        )}

        {runtime.isRunning && (
          <span className="ml-auto rounded bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] text-emerald-400">
            LIVE
          </span>
        )}

        {runtime.throttleStatus !== "ok" && (
          <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-300">
            {runtime.throttleMessage ?? runtime.throttleStatus}
          </span>
        )}
      </div>
      )}

      <div
        ref={containerRef}
        className={`relative min-h-[280px] flex-1 overflow-hidden ${heightShading ? 'evosphere-atmosphere' : ''}`}
        aria-label="World viewport"
      />

      {!hideViewportChrome && (
      <div className="border-t border-command-border p-2">
        <SoakDebugHUD />
      </div>
      )}

      {hideViewportChrome && soakHudExpanded && (
        <div className="absolute bottom-2 left-2 right-2 z-10 max-h-40 overflow-auto rounded border border-slate-700/60 bg-slate-950/90 p-2">
          <SoakDebugHUD />
        </div>
      )}

      {!hideViewportChrome && (
      <p className="border-t border-command-border px-3 py-2 font-mono text-xs text-slate-500">
        Circular planet — scroll to zoom · drag to pan · ESC exits focus · click
        tile or agent to inspect
      </p>
      )}

      <style>{`.cam-btn { border-radius: 0.25rem; border: 1px solid rgb(34 211 238 / 0.25); padding: 0.125rem 0.5rem; font-family: ui-monospace, monospace; font-size: 10px; color: rgb(103 232 249); } .cam-btn:hover { background: rgb(34 211 238 / 0.08); } .evosphere-atmosphere { box-shadow: inset 0 0 120px rgba(8, 20, 40, 0.45); }`}</style>
    </div>
  );
}
