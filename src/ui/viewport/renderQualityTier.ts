/** v0.6.4 — adaptive render quality tiers with auto-degrade on frame budget miss. */

export type RenderQualityTier = 'ultra' | 'high' | 'balanced' | 'performance'

export const DEFAULT_RENDER_QUALITY_TIER: RenderQualityTier = 'balanced'

export interface RenderQualityConfig {
  tier: RenderQualityTier
  movingGlyphCap: number
  producerGlyphCap: number
  staticMarkerCap: number
  farZoomDensityOnlyThreshold: number
  skipAnimatedDetail: boolean
}

const TIER_CONFIG: Record<RenderQualityTier, RenderQualityConfig> = {
  ultra: {
    tier: 'ultra',
    movingGlyphCap: 280,
    producerGlyphCap: 160,
    staticMarkerCap: 580,
    farZoomDensityOnlyThreshold: 0.45,
    skipAnimatedDetail: false,
  },
  high: {
    tier: 'high',
    movingGlyphCap: 220,
    producerGlyphCap: 140,
    staticMarkerCap: 520,
    farZoomDensityOnlyThreshold: 0.5,
    skipAnimatedDetail: false,
  },
  balanced: {
    tier: 'balanced',
    movingGlyphCap: 150,
    producerGlyphCap: 120,
    staticMarkerCap: 450,
    farZoomDensityOnlyThreshold: 0.55,
    skipAnimatedDetail: false,
  },
  performance: {
    tier: 'performance',
    movingGlyphCap: 72,
    producerGlyphCap: 56,
    staticMarkerCap: 280,
    farZoomDensityOnlyThreshold: 0.72,
    skipAnimatedDetail: true,
  },
}

const TIER_ORDER: RenderQualityTier[] = ['ultra', 'high', 'balanced', 'performance']

export function qualityConfigForTier(tier: RenderQualityTier): RenderQualityConfig {
  return TIER_CONFIG[tier]
}

export function tierIndex(tier: RenderQualityTier): number {
  return TIER_ORDER.indexOf(tier)
}

export function degradeTier(tier: RenderQualityTier): RenderQualityTier {
  const idx = tierIndex(tier)
  return TIER_ORDER[Math.min(TIER_ORDER.length - 1, idx + 1)]
}

export function upgradeTier(tier: RenderQualityTier): RenderQualityTier {
  const idx = tierIndex(tier)
  return TIER_ORDER[Math.max(0, idx - 1)]
}

/** Auto-adjust tier from recent frame time — degrades fast, upgrades slowly. */
export function autoAdjustQualityTier(
  frameMs: number,
  current: RenderQualityTier,
  budgetMs = 16.67,
  consecutiveBadFrames: number,
  consecutiveGoodFrames: number,
): { tier: RenderQualityTier; badFrames: number; goodFrames: number } {
  // Severe spikes — drop immediately to performance tier (screenshot / arcade blockers).
  if (frameMs > 250) {
    return { tier: 'performance', badFrames: 0, goodFrames: 0 }
  }

  if (frameMs > budgetMs * 1.35) {
    const bad = consecutiveBadFrames + 1
    if (bad >= 2 && tierIndex(current) < TIER_ORDER.length - 1) {
      return { tier: degradeTier(current), badFrames: 0, goodFrames: 0 }
    }
    return { tier: current, badFrames: bad, goodFrames: 0 }
  }

  if (frameMs < budgetMs * 0.85) {
    const good = consecutiveGoodFrames + 1
    if (good >= 120 && tierIndex(current) > 0) {
      return { tier: upgradeTier(current), badFrames: 0, goodFrames: 0 }
    }
    return { tier: current, badFrames: 0, goodFrames: good }
  }

  return { tier: current, badFrames: 0, goodFrames: 0 }
}

export function tierLabel(tier: RenderQualityTier): string {
  switch (tier) {
    case 'ultra':
      return 'Ultra'
    case 'high':
      return 'High'
    case 'balanced':
      return 'Balanced'
    case 'performance':
      return 'Performance'
  }
}
