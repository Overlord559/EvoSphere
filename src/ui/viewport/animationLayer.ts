/** Visual-only animation helpers — do not mutate simulation state. */

export function animPhaseMs(nowMs: number): number {
  return nowMs % 100_000
}

export function breatheOffset(phaseMs: number, amplitude = 1): number {
  return Math.sin(phaseMs * 0.004) * amplitude
}

export function wiggleAngle(phaseMs: number, id: string, amplitude = 0.12): number {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (Math.imul(31, h) + id.charCodeAt(i)) | 0
  return Math.sin(phaseMs * 0.005 + (h % 100) * 0.1) * amplitude
}

export function pulseAlpha(phaseMs: number, base = 0.5, range = 0.25): number {
  return base + Math.sin(phaseMs * 0.003) * range
}

export function shimmerOffset(phaseMs: number, salt: number): number {
  return Math.sin(phaseMs * 0.002 + salt) * 2
}

export function seasonTint(phaseMs: number, tick: number): number {
  const cycle = Math.sin((tick * 0.02 + phaseMs * 0.0001) * Math.PI * 2)
  return cycle * 0.04
}

export function actionNudge(
  lastAction: string,
  phaseMs: number,
): { dx: number; dy: number } {
  if (lastAction === 'hunt') {
    return { dx: Math.sin(phaseMs * 0.02) * 2, dy: -Math.abs(Math.sin(phaseMs * 0.025)) * 2 }
  }
  if (lastAction === 'graze' || lastAction === 'eat') {
    return { dx: 0, dy: Math.sin(phaseMs * 0.015) * 1.2 }
  }
  return { dx: 0, dy: 0 }
}
