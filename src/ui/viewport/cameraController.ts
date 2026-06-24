import type { World } from '../../types/simulation'
import type { CameraMode } from '../../types/runtime'

export const CAMERA_MIN_ZOOM = 0.25
export const CAMERA_MAX_ZOOM = 8
export const CAMERA_DEFAULT_ZOOM = 1
export const CAMERA_INSPECT_ZOOM = 3.5
export const CAMERA_ZOOM_OUT_FACTOR = 0.72

export interface ViewportCamera {
  panX: number
  panY: number
  zoom: number
}

export function screenToWorld(
  screenX: number,
  screenY: number,
  camera: ViewportCamera,
): { worldX: number; worldY: number } {
  return {
    worldX: (screenX - camera.panX) / camera.zoom,
    worldY: (screenY - camera.panY) / camera.zoom,
  }
}

/** Zoom while keeping the world point under the cursor fixed on screen. */
export function zoomAtScreenPoint(
  camera: ViewportCamera,
  screenX: number,
  screenY: number,
  newZoom: number,
): ViewportCamera {
  const clampedZoom = clampZoom(newZoom)
  const world = screenToWorld(screenX, screenY, camera)
  return {
    zoom: clampedZoom,
    panX: screenX - world.worldX * clampedZoom,
    panY: screenY - world.worldY * clampedZoom,
  }
}

export function clampZoom(zoom: number): number {
  return Math.max(CAMERA_MIN_ZOOM, Math.min(CAMERA_MAX_ZOOM, zoom))
}

export function zoomOutOneLevel(zoom: number): number {
  return clampZoom(zoom * CAMERA_ZOOM_OUT_FACTOR)
}

export function centerPlanet(
  world: World,
  tileSize: number,
  viewWidth: number,
  viewHeight: number,
  zoom: number,
): ViewportCamera {
  const cx = world.planetCenterX * tileSize + tileSize / 2
  const cy = world.planetCenterY * tileSize + tileSize / 2
  return {
    panX: viewWidth / 2 - cx * zoom,
    panY: viewHeight / 2 - cy * zoom,
    zoom: clampZoom(zoom),
  }
}

export function fitPlanetToViewport(
  world: World,
  tileSize: number,
  viewWidth: number,
  viewHeight: number,
): ViewportCamera {
  const diameter = world.planetRadius * 2 * tileSize
  const margin = tileSize * 4
  const fitW = (viewWidth - margin) / diameter
  const fitH = (viewHeight - margin) / diameter
  const zoom = clampZoom(Math.min(fitW, fitH, CAMERA_DEFAULT_ZOOM))
  return centerPlanet(world, tileSize, viewWidth, viewHeight, zoom)
}

export function clampPanToPlanet(
  world: World,
  tileSize: number,
  viewWidth: number,
  viewHeight: number,
  camera: ViewportCamera,
): ViewportCamera {
  const cx = world.planetCenterX * tileSize + tileSize / 2
  const cy = world.planetCenterY * tileSize + tileSize / 2
  const radius = world.planetRadius * tileSize
  const minPanX = viewWidth / 2 - (cx + radius) * camera.zoom
  const maxPanX = viewWidth / 2 - (cx - radius) * camera.zoom
  const minPanY = viewHeight / 2 - (cy + radius) * camera.zoom
  const maxPanY = viewHeight / 2 - (cy - radius) * camera.zoom
  return {
    zoom: camera.zoom,
    panX: Math.max(minPanX, Math.min(maxPanX, camera.panX)),
    panY: Math.max(minPanY, Math.min(maxPanY, camera.panY)),
  }
}

export function cameraModeLabel(mode: CameraMode): string {
  switch (mode) {
    case 'free':
      return 'Free'
    case 'focused_tile':
      return 'Focused tile'
    case 'focused_species':
      return 'Focused species'
    case 'following_species':
      return 'Following species'
    case 'inspecting_agent':
      return 'Inspecting agent'
    default:
      return mode
  }
}
