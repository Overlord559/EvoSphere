import { useEffect, useRef } from 'react'
import { Application } from 'pixi.js'
import { useSimulationStore } from '../../store/simulationStore'
import { getTileAt } from '../../simulation/world'
import { OVERLAY_MODES } from './tileColors'
import { createRenderLayers, type RenderLayers } from './renderLayers'
import { renderWorld } from './organismRenderer'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
const BASE_TILE_SIZE = 6
const DRAG_THRESHOLD = 4

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
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0, moved: false })

  const overlayMode = useSimulationStore((s) => s.overlayMode)
  const visualMode = useSimulationStore((s) => s.visualMode)
  const setOverlayMode = useSimulationStore((s) => s.setOverlayMode)
  const setVisualMode = useSimulationStore((s) => s.setVisualMode)
  const selectTile = useSimulationStore((s) => s.selectTile)
  const selectedTile = useSimulationStore((s) => s.selectedTile)
  const snapshot = useSimulationStore((s) => s.snapshot)
  const recentActivityTiles = useSimulationStore((s) => s.recentActivityTiles)
  const selectedSpeciesId = useSimulationStore((s) => s.selectedSpeciesId)

  const world = snapshot.world
  const { tileCounts, tileBiomass, speciesOccupancy, organisms } = snapshot.life
  const agents = snapshot.agents.agents
  const speciesTileIndices = selectedSpeciesId
    ? (speciesOccupancy[selectedSpeciesId]?.tileIndices ?? null)
    : null

  const redrawRef = useRef<() => void>(() => {})

  const redraw = () => {
    const layers = layersRef.current
    if (!layers) return
    renderWorld(layers, {
      world,
      overlay: overlayMode,
      tileSize: BASE_TILE_SIZE,
      zoom: viewportRef.current.zoom,
      visualMode,
      tileCounts,
      tileBiomass,
      organisms,
      agents,
      activityTiles: recentActivityTiles,
      speciesTileIndices,
      selectedSpeciesId,
      selectedTile,
    })
  }

  redrawRef.current = redraw

  useEffect(() => {
    const host = containerRef.current
    if (!host) return

    let destroyed = false
    let app: Application | null = null
    let cleanupListeners: (() => void) | undefined

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
      }
      resize()
      const observer = new ResizeObserver(resize)
      observer.observe(host)

      const onWheel = (e: WheelEvent) => {
        e.preventDefault()
        const vp = viewportRef.current
        const delta = e.deltaY > 0 ? 0.9 : 1.1
        vp.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, vp.zoom * delta))
        layers.root.scale.set(vp.zoom)
        redrawRef.current()
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
        const tile = getTileAt(currentWorld, tx, ty)
        selectTile(tile ?? null)
      }

      app.canvas.addEventListener('wheel', onWheel, { passive: false })
      app.canvas.addEventListener('pointerdown', onPointerDown)
      app.canvas.addEventListener('pointermove', onPointerMove)
      app.canvas.addEventListener('pointerup', onPointerUp)
      app.canvas.addEventListener('pointerleave', onPointerUp)
      app.canvas.addEventListener('click', onClick)

      const current = useSimulationStore.getState()
      renderWorld(layers, {
        world: current.snapshot.world,
        overlay: current.overlayMode,
        tileSize: BASE_TILE_SIZE,
        zoom: viewportRef.current.zoom,
        visualMode: current.visualMode,
        tileCounts: current.snapshot.life.tileCounts,
        tileBiomass: current.snapshot.life.tileBiomass,
        organisms: current.snapshot.life.organisms,
        agents: current.snapshot.agents.agents,
        activityTiles: current.recentActivityTiles,
        speciesTileIndices: current.selectedSpeciesId
          ? (current.snapshot.life.speciesOccupancy[current.selectedSpeciesId]?.tileIndices ?? null)
          : null,
        selectedSpeciesId: current.selectedSpeciesId,
        selectedTile: current.selectedTile,
      })
      centerWorld(layers.root, current.snapshot.world, host, viewportRef.current)

      cleanupListeners = () => {
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
  }, [world.id, selectTile])

  useEffect(() => {
    redrawRef.current()
  }, [world, overlayMode, visualMode, selectedTile, tileCounts, tileBiomass, snapshot.tick, recentActivityTiles, speciesTileIndices, agents, organisms, selectedSpeciesId])

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
      </div>
      <div
        ref={containerRef}
        className="relative min-h-[280px] flex-1 overflow-hidden"
        aria-label="World viewport"
      />
      <p className="border-t border-command-border px-3 py-2 font-mono text-xs text-slate-500">
        Scroll to zoom · drag to pan · click tile to inspect · Organic mode shows procedural creatures and biomes
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
  const mapW = world.width * BASE_TILE_SIZE
  const mapH = world.height * BASE_TILE_SIZE
  vp.panX = (host.clientWidth - mapW * vp.zoom) / 2
  vp.panY = (host.clientHeight - mapH * vp.zoom) / 2
  container.position.set(vp.panX, vp.panY)
  container.scale.set(vp.zoom)
}
