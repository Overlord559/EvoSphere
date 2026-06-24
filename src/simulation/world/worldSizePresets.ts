import type { SimulationSettings } from '../../types/simulation'

export type WorldSizePreset = 'small' | 'standard' | 'large' | 'experimental'

export const WORLD_SIZE_PRESETS: Record<WorldSizePreset, { width: number; height: number; label: string }> = {
  small: { width: 96, height: 96, label: 'Small (96×96)' },
  standard: { width: 192, height: 192, label: 'Standard (192×192)' },
  large: { width: 256, height: 256, label: 'Large (256×256)' },
  experimental: { width: 384, height: 384, label: 'Experimental (384×384)' },
}

export const DEFAULT_WORLD_SIZE_PRESET: WorldSizePreset = 'standard'

export function dimensionsForPreset(preset: WorldSizePreset): { width: number; height: number } {
  const entry = WORLD_SIZE_PRESETS[preset]
  return { width: entry.width, height: entry.height }
}

export function settingsWithPreset(
  settings: SimulationSettings,
  preset: WorldSizePreset,
): SimulationSettings {
  const { width, height } = dimensionsForPreset(preset)
  return { ...settings, worldSizePreset: preset, worldWidth: width, worldHeight: height }
}
