import type { World } from '../../types/simulation'

export interface ViewBounds {
  minTileX: number
  minTileY: number
  maxTileX: number
  maxTileY: number
}

export interface CameraState {
  panX: number
  panY: number
  zoom: number
  viewWidth: number
  viewHeight: number
}

export function computeVisibleTileBounds(
  world: World,
  camera: CameraState,
  tileSize: number,
  marginTiles = 2,
): ViewBounds {
  const { panX, panY, zoom, viewWidth, viewHeight } = camera
  const invZoom = 1 / Math.max(0.01, zoom)
  const left = (-panX) * invZoom
  const top = (-panY) * invZoom
  const right = (viewWidth - panX) * invZoom
  const bottom = (viewHeight - panY) * invZoom

  const minTileX = Math.max(0, Math.floor(left / tileSize) - marginTiles)
  const minTileY = Math.max(0, Math.floor(top / tileSize) - marginTiles)
  const maxTileX = Math.min(world.width - 1, Math.ceil(right / tileSize) + marginTiles)
  const maxTileY = Math.min(world.height - 1, Math.ceil(bottom / tileSize) + marginTiles)

  return { minTileX, minTileY, maxTileX, maxTileY }
}

export function isTileInBounds(x: number, y: number, bounds: ViewBounds): boolean {
  return x >= bounds.minTileX && x <= bounds.maxTileX && y >= bounds.minTileY && y <= bounds.maxTileY
}

export function tileIndexInBounds(idx: number, worldWidth: number, bounds: ViewBounds): boolean {
  const x = idx % worldWidth
  const y = Math.floor(idx / worldWidth)
  return isTileInBounds(x, y, bounds)
}

/** Compute pan/zoom to center a tile in the viewport. */
export function cameraFocusOnTile(
  tileX: number,
  tileY: number,
  tileSize: number,
  viewWidth: number,
  viewHeight: number,
  zoom: number,
): { panX: number; panY: number } {
  const cx = tileX * tileSize + tileSize / 2
  const cy = tileY * tileSize + tileSize / 2
  return {
    panX: viewWidth / 2 - cx * zoom,
    panY: viewHeight / 2 - cy * zoom,
  }
}

/** Compute pan/zoom to frame a region centroid. */
export function cameraFocusOnPoint(
  worldX: number,
  worldY: number,
  viewWidth: number,
  viewHeight: number,
  zoom: number,
): { panX: number; panY: number } {
  return {
    panX: viewWidth / 2 - worldX * zoom,
    panY: viewHeight / 2 - worldY * zoom,
  }
}
