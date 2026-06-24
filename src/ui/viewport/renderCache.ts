import { MAX_GLYPH_CACHE_ENTRIES, MAX_TERRAIN_CACHE_ENTRIES } from '../../simulation/engine/stabilityGuards'

/** Bounded terrain redraw key cache — tracks world+overlay keys, not Pixi textures. */
const terrainKeys = new Map<string, number>()

/** Glyph draw signature cache for telemetry (hash keys only). */
const glyphKeys = new Map<string, number>()

let renderTextureCount = 0

export function noteTerrainRedraw(worldId: string, overlay: string): void {
  const key = `${worldId}:${overlay}`
  terrainKeys.set(key, (terrainKeys.get(key) ?? 0) + 1)
  while (terrainKeys.size > MAX_TERRAIN_CACHE_ENTRIES) {
    const first = terrainKeys.keys().next().value
    if (first) terrainKeys.delete(first)
    else break
  }
}

export function noteGlyphDraw(signature: string): void {
  glyphKeys.set(signature, (glyphKeys.get(signature) ?? 0) + 1)
  while (glyphKeys.size > MAX_GLYPH_CACHE_ENTRIES) {
    const first = glyphKeys.keys().next().value
    if (first) glyphKeys.delete(first)
    else break
  }
}

export function setRenderTextureCount(count: number): void {
  renderTextureCount = count
}

export function getRenderTextureCount(): number {
  return renderTextureCount
}

export function getTerrainCacheSize(): number {
  return terrainKeys.size
}

export function getGlyphCacheSize(): number {
  return glyphKeys.size
}

export function destroyAllRenderCaches(): void {
  terrainKeys.clear()
  glyphKeys.clear()
  renderTextureCount = 0
}
