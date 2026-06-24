import { useEffect, useRef } from 'react'
import { Application, Container, Graphics } from 'pixi.js'
import { useSimulationStore } from '../../store/simulationStore'
import type { OverlayMode, Tile, World } from '../../types/simulation'
import { getTileAt } from '../../simulation/world'
import { maxTileDensity } from '../../simulation/life/LifeSystem'
import { colorForTile, OVERLAY_MODES, type TileColorContext } from './tileColors'

const MIN_ZOOM = 0.25
const MAX_ZOOM = 8
const BASE_TILE_SIZE = 6
const DRAG_THRESHOLD = 4

interface ViewportState {
  panX: number
  panY: number
  zoom: number
}

function buildColorContext(
  overlay: OverlayMode,
  tileCounts: number[],
  tileBiomass: number[],
): TileColorContext | undefined {
  if (overlay !== 'life' && overlay !== 'biomass') return undefined
  return {
    tileIndex: 0,
    tileCounts,
    tileBiomass,
    maxTileCount: maxTileDensity(tileCounts),
    maxTileBiomass: Math.max(0.01, ...tileBiomass),
  }
}

function drawWorld(
  container: Container,
  world: World,
  overlay: OverlayMode,
  tileSize: number,
  selectedTile: Tile | null,
  tileCounts: number[],
  tileBiomass: number[],
): void {
  container.removeChildren()

  const baseContext = buildColorContext(overlay, tileCounts, tileBiomass)

  for (const tile of world.tiles) {
    const idx = tile.y * world.width + tile.x
    const context: TileColorContext | undefined = baseContext
      ? { ...baseContext, tileIndex: idx }
      : undefined

    const g = new Graphics()
    g.rect(tile.x * tileSize, tile.y * tileSize, tileSize, tileSize)
    g.fill(colorForTile(tile, overlay, context))
    container.addChild(g)
  }

  if (selectedTile) {
    const outline = new Graphics()
    outline.rect(
      selectedTile.x * tileSize,
      selectedTile.y * tileSize,
      tileSize,
      tileSize,
    )
    outline.stroke({ width: 1, color: 0x22d3ee, alpha: 0.95 })
    container.addChild(outline)
  }
}

export function WorldViewport() {
  const containerRef = useRef<HTMLDivElement>(null)
  const appRef = useRef<Application | null>(null)
  const worldContainerRef = useRef<Container | null>(null)
  const viewportRef = useRef<ViewportState>({ panX: 0, panY: 0, zoom: 1 })
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0, moved: false })

  const overlayMode = useSimulationStore((s) => s.overlayMode)
  const setOverlayMode = useSimulationStore((s) => s.setOverlayMode)
  const selectTile = useSimulationStore((s) => s.selectTile)
  const selectedTile = useSimulationStore((s) => s.selectedTile)
  const snapshot = useSimulationStore((s) => s.snapshot)

  const world = snapshot.world
  const { tileCounts, tileBiomass } = snapshot.life

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
        antialias: false,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
      })

      if (destroyed) {
        app.destroy(true)
        return
      }

      host.innerHTML = ''
      host.appendChild(app.canvas)

      const worldContainer = new Container()
      app.stage.addChild(worldContainer)
      appRef.current = app
      worldContainerRef.current = worldContainer

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
        worldContainer.scale.set(vp.zoom)
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
        worldContainer.position.set(vp.panX, vp.panY)
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
      drawWorld(
        worldContainer,
        current.snapshot.world,
        current.overlayMode,
        BASE_TILE_SIZE,
        current.selectedTile,
        current.snapshot.life.tileCounts,
        current.snapshot.life.tileBiomass,
      )
      centerWorld(worldContainer, current.snapshot.world, host, viewportRef.current)

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
        worldContainerRef.current = null
      }
      host.innerHTML = ''
    }
  }, [world.id, selectTile])

  useEffect(() => {
    const worldContainer = worldContainerRef.current
    if (!worldContainer) return
    drawWorld(
      worldContainer,
      world,
      overlayMode,
      BASE_TILE_SIZE,
      selectedTile,
      tileCounts,
      tileBiomass,
    )
  }, [world, overlayMode, selectedTile, tileCounts, tileBiomass, snapshot.tick])

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
      </div>
      <div
        ref={containerRef}
        className="relative min-h-[280px] flex-1 overflow-hidden"
        aria-label="World viewport"
      />
      <p className="border-t border-command-border px-3 py-2 font-mono text-xs text-slate-500">
        Scroll to zoom · drag to pan · click a tile to inspect · Life/Biomass overlays show population density
      </p>
    </div>
  )
}

function centerWorld(
  container: Container,
  world: World,
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
