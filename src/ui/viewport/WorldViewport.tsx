import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'
import { useSimulationStore } from '../../store/simulationStore'
import { getTileAtRaw } from '../../simulation/world'
import { agentsOnTile } from '../../simulation/agents/AgentSystem'
import { OVERLAY_MODES } from './tileColors'
import { createRenderLayers, type RenderLayers } from './renderLayers'
import { renderWorld } from './organismRenderer'
import {
  cameraFocusOnTile,
  computeVisibleTileBounds,
  type ViewBounds,
} from './viewportCulling'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
const BASE_TILE_SIZE = 6
const DRAG_THRESHOLD = 4
const INSPECT_ZOOM = 3.5

interface ViewportState {
  panX: number
  panY: number
  zoom: number
}

export function WorldViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const layersRef = useRef<RenderLayers | null>(null)
  const viewportRef = useRef<ViewportState>({ panX: 0, panY: 0, zoom: 1 })
  const viewSizeRef = useRef({ width: 800, height: 600 })
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0, moved: false })
  const lastSnapshotVersionRef = useRef(-1)

  const overlayMode = useSimulationStore((s) => s.overlayMode)
  const visualMode = useSimulationStore((s) => s.visualMode)
  const setOverlayMode = useSimulationStore((s) => s.setOverlayMode)
  const setVisualMode = useSimulationStore((s) => s.setVisualMode)
  const selectTile = useSimulationStore((s) => s.selectTile)
  const selectSpecies = useSimulationStore((s) => s.selectSpecies)
  const selectedTile = useSimulationStore((s) => s.selectedTile)
  const snapshot = useSimulationStore((s) => s.snapshot)
  const renderSnapshotVersion = useSimulationStore((s) => s.snapshot.renderSnapshotVersion)
  const recentActivityTiles = useSimulationStore((s) => s.recentActivityTiles)
  const selectedSpeciesId = useSimulationStore((s) => s.selectedSpeciesId)
  const agentVisualStates = useSimulationStore((s) => s.agentVisualStates)
  const animTimeMs = useSimulationStore((s) => s.animTimeMs)
  const advanceAnimation = useSimulationStore((s) => s.advanceAnimation)
  const runtime = useSimulationStore((s) => s.runtime)
  const cameraFocusRequest = useSimulationStore((s) => s.cameraFocusRequest)
  const clearCameraFocusRequest = useSimulationStore((s) => s.clearCameraFocusRequest)
  const updatePerformanceStats = useSimulationStore((s) => s.updatePerformanceStats)
  const focusTile = useSimulationStore((s) => s.focusTile)

  const world = snapshot.world
  const speciesTileIndices = selectedSpeciesId
    ? (snapshot.life.speciesOccupancy[selectedSpeciesId]?.tileIndices ?? null)
    : null

  const redrawRef = useRef<() => void>(() => {})

  const redraw = (force = false) => {
    const layers = layersRef.current
    const host = containerRef.current
    if (!layers || !host) return

    const state = useSimulationStore.getState()
    const versionChanged = state.snapshot.renderSnapshotVersion !== lastSnapshotVersionRef.current
    if (!force && !versionChanged && state.animTimeMs === animTimeMs) {
      return
    }
    lastSnapshotVersionRef.current = state.snapshot.renderSnapshotVersion

    const vp = viewportRef.current
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
    )

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
      agentVisualStates: state.agentVisualStates,
      animTimeMs: state.animTimeMs,
      simTick: state.snapshot.tick,
      activityTiles: state.recentActivityTiles,
      speciesTileIndices: state.selectedSpeciesId
        ? (state.snapshot.life.speciesOccupancy[state.selectedSpeciesId]?.tileIndices ?? null)
        : null,
      selectedSpeciesId: state.selectedSpeciesId,
      selectedTile: state.selectedTile,
      viewBounds,
    })

    updatePerformanceStats(stats)
  }

  redrawRef.current = () => redraw(true)

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    let destroyed = false
    let app: Application | null = null
    let cleanupListeners: (() => void) | undefined
    let animFrameId = 0
    let lastAnimMs = performance.now()

    const run = async () => {
      app = new Application()
      await app.init({
        background: 0x0a0e14,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      if (destroyed) {
        app.destroy(true)
        return
      }

      host.innerHTML = ''
      host.appendChild(app.canvas)

      const layers = createRenderLayers()
      app.stage.addChild(layers.root)
      appRef.current = app
      layersRef.current = layers

      const resize = () => {
        if (!app || destroyed) return
        app.renderer.resize(host.clientWidth, host.clientHeight)
        viewSizeRef.current = { width: host.clientWidth, height: host.clientHeight }
      }
      resize()
      const observer = new ResizeObserver(resize)
      observer.observe(host)

      const animLoop = (now: number) => {
        if (destroyed) return
        const delta = now - lastAnimMs
        lastAnimMs = now
        const state = useSimulationStore.getState()
        if (!state.deepTimeRunning) {
          state.advanceAnimation(delta)
        }
        redrawRef.current()
        animFrameId = requestAnimationFrame(animLoop)
      }
      animFrameId = requestAnimationFrame(animLoop)

      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const vp = viewportRef.current
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        vp.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * delta))
        layers.root.scale.set(vp.zoom)
      }

      const onPointerDown = (e: PointerEvent) => {
        dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: false }
      }

      const onPointerMove = (e: PointerEvent) => {
        const drag = dragRef.current
        if (!drag.active) return
        const dx = e.clientX - drag.lastX
        const dy = e.clientY - drag.lastY
        if (Math.abs(dx) + Math.abs(dy) > DRAG_THRESHOLD) drag.moved = true
        drag.lastX = e.clientX
        drag.lastY = e.clientY
        const vp = viewportRef.current
        vp.panX += dx
        vp.panY += dy
        layers.root.position.set(vp.panX, vp.panY)
      }

      const onPointerUp = () => {
        dragRef.current.active = false
      }

      const onClick = (e: MouseEvent) => {
        if (dragRef.current.moved || !app) return
        const state = useSimulationStore.getState()
        const currentWorld = state.snapshot.world
        const rect = app.canvas.getBoundingClientRect()
        const vp = viewportRef.current
        const localX = (e.clientX - rect.left - vp.panX) / vp.zoom
        const localY = (e.clientY - rect.top - vp.panY) / vp.zoom
        const tx = Math.floor(localX / BASE_TILE_SIZE)
        const ty = Math.floor(localY / BASE_TILE_SIZE)

        const tileAgents = agentsOnTile(state.snapshot.agents.agents, tx, ty)
        if (tileAgents.length > 0) {
          selectSpecies(tileAgents[0].speciesId)
        }

        const rawTile = getTileAtRaw(currentWorld, tx, ty)
        selectTile(rawTile ?? null)
      }

      app.canvas.addEventListener('wheel', onWheel, { passive: false })
      app.canvas.addEventListener('pointerdown', onPointerDown)
      app.canvas.addEventListener('pointermove', onPointerMove)
      app.canvas.addEventListener('pointerup', onPointerUp)
      app.canvas.addEventListener('pointerleave', onPointerUp)
      app.canvas.addEventListener('click', onClick)

      redrawRef.current()
      centerWorld(layers.root, useSimulationStore.getState().snapshot.world, host, viewportRef.current)

      cleanupListeners = () => {
        cancelAnimationFrame(animFrameId)
        observer.disconnect()
        app?.canvas.removeEventListener('wheel', onWheel)
        app?.canvas.removeEventListener('pointerdown', onPointerDown)
        app?.canvas.removeEventListener('pointermove', onPointerMove)
        app?.canvas.removeEventListener('pointerup', onPointerUp)
        app?.canvas.removeEventListener('pointerleave', onPointerUp)
        app?.canvas.removeEventListener('click', onClick)
      }
    }

    run()

    return () => {
      destroyed = true
      cleanupListeners?.()
      if (appRef.current) {
        appRef.current.destroy(true, { children: true })
        appRef.current = null
        layersRef.current = null
      }
      host.innerHTML = ''
    }
  }, [world.id, selectTile, selectSpecies, advanceAnimation, updatePerformanceStats])

  useEffect(() => {
    if (!cameraFocusRequest || !layersRef.current || !containerRef.current) return
    const vp = viewportRef.current
    const host = containerRef.current
    const zoom = cameraFocusRequest.zoom ?? INSPECT_ZOOM
    vp.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom))
    const focus = cameraFocusOnTile(
      cameraFocusRequest.tileX,
      cameraFocusRequest.tileY,
      BASE_TILE_SIZE,
      host.clientWidth,
      host.clientHeight,
      vp.zoom,
    )
    vp.panX = focus.panX
    vp.panY = focus.panY
    layersRef.current.root.position.set(vp.panX, vp.panY)
    layersRef.current.root.scale.set(vp.zoom)
    clearCameraFocusRequest()
    redrawRef.current()
  }, [cameraFocusRequest, clearCameraFocusRequest])

  useEffect(() => {
    redrawRef.current()
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
  ])

  return (
    <div className="flex min-h-[320px] flex-1 flex-col rounded-lg border border-command-border bg-command-surface/60">
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
                ? 'bg-command-accent/15 text-command-accent'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
        <span className="mx-2 text-slate-600">|</span>
        <span className="mr-1 font-mono text-xs text-slate-500">VISUAL</span>
        <button
          type="button"
          onClick={() => setVisualMode('organic')}
          aria-pressed={visualMode === 'organic'}
          className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
            visualMode === 'organic'
              ? 'bg-emerald-500/15 text-emerald-400'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          Organic
        </button>
        <button
          type="button"
          onClick={() => setVisualMode('debug')}
          aria-pressed={visualMode === 'debug'}
          className={`rounded px-2 py-1 font-mono text-xs transition-colors ${
            visualMode === 'debug'
              ? 'bg-amber-500/15 text-amber-400'
              : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
          }`}
        >
          Debug
        </button>
        {selectedTile && (
          <button
            type="button"
            onClick={() => focusTile(selectedTile.x, selectedTile.y, INSPECT_ZOOM)}
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
        {runtime.throttleStatus !== 'ok' && (
          <span className="rounded bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] text-amber-300">
            {runtime.throttleMessage ?? runtime.throttleStatus}
          </span>
        )}
      </div>
      <div
        ref={containerRef}
        className="relative min-h-[280px] flex-1 overflow-hidden"
        aria-label="World viewport"
      />
      <p className="border-t border-command-border px-3 py-2 font-mono text-xs text-slate-500">
        Circular planet — scroll to zoom · drag to pan · click tile or agent to inspect · Play to watch evolution
      </p>
    </div>
  )
}

function centerWorld(
  container: import('pixi.js').Container,
  world: import('../../types/simulation').World,
  host: HTMLDivElement,
  vp: ViewportState,
): void {
  const cx = world.planetCenterX * BASE_TILE_SIZE + BASE_TILE_SIZE / 2
  const cy = world.planetCenterY * BASE_TILE_SIZE + BASE_TILE_SIZE / 2
  vp.panX = host.clientWidth / 2 - cx * vp.zoom
  vp.panY = host.clientHeight / 2 - cy * vp.zoom
  container.position.set(vp.panX, vp.panY)
  container.scale.set(vp.zoom)
}
