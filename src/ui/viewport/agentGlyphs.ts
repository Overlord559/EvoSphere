import { Graphics } from 'pixi.js'
import type { MobileAgent } from '../../types/agents'
import { agentVisualTraits, traitsToColor, type ZoomDetail } from './visualGenes'
import { actionNudge, breatheOffset, wiggleAngle } from './animationLayer'

export interface AgentDrawAnim {
  phaseMs: number
  moving: boolean
}

function rotatePoint(x: number, y: number, angle: number): [number, number] {
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return [x * cos - y * sin, x * sin + y * cos]
}

function adjustColor(color: number, dr: number, dg: number, db: number): number {
  const r = Math.max(0, Math.min(255, ((color >> 16) & 0xff) + dr))
  const g = Math.max(0, Math.min(255, ((color >> 8) & 0xff) + dg))
  const b = Math.max(0, Math.min(255, (color & 0xff) + db))
  return (r << 16) | (g << 8) | b
}

export function drawAgentGlyph(
  g: Graphics,
  agent: MobileAgent,
  cx: number,
  cy: number,
  tileSize: number,
  detail: ZoomDetail,
  isSelectedSpecies: boolean,
  anim?: AgentDrawAnim,
): void {
  const phaseMs = anim?.phaseMs ?? 0
  const nudge = anim ? actionNudge(agent.lastAction, phaseMs) : { dx: 0, dy: 0 }
  const wiggle = anim ? wiggleAngle(phaseMs, agent.id, anim.moving ? 0.18 : 0.08) : 0
  const breath = anim ? breatheOffset(phaseMs, 0.4) : 0
  cx += nudge.dx
  cy += nudge.dy + breath

  const traits = agentVisualTraits(agent)
  const scale = tileSize * 0.45 * traits.bodyScale
  const { color, alpha } = traitsToColor(traits.hue, traits.saturation, traits.brightness, traits.alpha)
  const angle = traits.facingAngle + wiggle

  const bodyW = scale * traits.bodyWidth
  const bodyH = scale * traits.bodyHeight * (traits.compactPosture ? 0.85 : 1)

  if (detail === 'far') {
    const shape = agent.kind === 'SimplePredator' ? 'diamond' : agent.kind === 'Scavenger' ? 'triangle' : 'circle'
    if (shape === 'diamond') {
      const pts = [
        rotatePoint(0, -scale * 0.35, angle),
        rotatePoint(scale * 0.3, 0, angle),
        rotatePoint(0, scale * 0.35, angle),
        rotatePoint(-scale * 0.3, 0, angle),
      ]
      g.poly(pts.flatMap(([x, y]) => [cx + x, cy + y]))
      g.fill({ color, alpha })
    } else if (shape === 'triangle') {
      const pts = [
        rotatePoint(0, -scale * 0.35, angle),
        rotatePoint(scale * 0.32, scale * 0.3, angle),
        rotatePoint(-scale * 0.32, scale * 0.3, angle),
      ]
      g.poly(pts.flatMap(([x, y]) => [cx + x, cy + y]))
      g.fill({ color, alpha })
    } else {
      g.circle(cx, cy, scale * 0.32)
      g.fill({ color, alpha })
    }
  } else {
    drawCreatureBody(g, cx, cy, agent, traits, bodyW, bodyH, angle, color, alpha, detail)
  }

  if (isSelectedSpecies) {
    const pulse = anim ? 0.55 + Math.sin(phaseMs * 0.004) * 0.08 : 0.55
    g.circle(cx, cy, scale * pulse)
    g.stroke({ width: 1.5, color: 0xffffff, alpha: 0.75 })
    g.circle(cx, cy, scale * (pulse + 0.07))
    g.stroke({ width: 1, color: 0xc084fc, alpha: 0.5 + Math.sin(phaseMs * 0.003) * 0.2 })
  }
}

function drawCreatureBody(
  g: Graphics,
  cx: number,
  cy: number,
  agent: MobileAgent,
  traits: ReturnType<typeof agentVisualTraits>,
  bodyW: number,
  bodyH: number,
  angle: number,
  color: number,
  alpha: number,
  detail: ZoomDetail,
): void {
  const isPredator = agent.kind === 'SimplePredator'
  const isScavenger = agent.kind === 'Scavenger'
  const sensoryNorm = agent.genome.sensoryRange / 4

  const [hx, hy] = rotatePoint(bodyW * 0.55, 0, angle)
  const headR = bodyW * traits.headScale

  if (traits.angularBody) {
    const pts = [
      rotatePoint(-bodyW * 0.5, -bodyH * 0.4, angle),
      rotatePoint(bodyW * 0.3, -bodyH * 0.35, angle),
      rotatePoint(bodyW * 0.55, 0, angle),
      rotatePoint(bodyW * 0.3, bodyH * 0.35, angle),
      rotatePoint(-bodyW * 0.5, bodyH * 0.4, angle),
    ]
    g.poly(pts.flatMap(([x, y]) => [cx + x, cy + y]))
    g.fill({ color, alpha })
  } else {
    g.ellipse(cx, cy, bodyW * 0.55, bodyH * 0.5)
    g.fill({ color, alpha })
  }

  g.circle(cx + hx, cy + hy, headR)
  g.fill({ color: adjustColor(color, 15, 10, 5), alpha })

  if (agent.bodyPlan.armorLevel > 0.55 || agent.bodyPlan.bodyCovering === 'shell') {
    g.circle(cx, cy, bodyW * 0.62)
    g.stroke({ width: bodyW * 0.08, color: adjustColor(color, -30, -25, -20), alpha: alpha * 0.85 })
  }

  if (detail !== 'far') {
    const eyeR = bodyW * traits.eyeScale
    const [ex, ey] = rotatePoint(bodyW * 0.65, -headR * 0.35, angle)
    g.circle(cx + ex, cy + ey, eyeR)
    g.fill({ color: 0xffffff, alpha: 0.9 })
    g.circle(cx + ex, cy + ey, eyeR * 0.5)
    g.fill({ color: 0x111111, alpha: 0.85 })

    if (detail === 'close' && sensoryNorm > 0.4) {
      const [ex2, ey2] = rotatePoint(bodyW * 0.65, headR * 0.35, angle)
      g.circle(cx + ex2, cy + ey2, eyeR * 0.7)
      g.fill({ color: 0xffffff, alpha: 0.7 })
    }
  }

  const mouthW = bodyW * traits.mouthScale
  const [mx, my] = rotatePoint(bodyW * 0.75, 0, angle)
  const mouth = agent.bodyPlan.mouthType
  if (mouth === 'jaw' || mouth === 'mandible' || isPredator) {
    g.moveTo(cx + mx - mouthW * 0.5, cy + my)
    g.lineTo(cx + mx + mouthW * 0.3, cy + my - mouthW * 0.3)
    g.lineTo(cx + mx + mouthW * 0.3, cy + my + mouthW * 0.3)
    g.fill({ color: 0x331111, alpha: 0.85 })
  } else if (mouth === 'sucker' || mouth === 'proboscis' || isScavenger) {
    g.moveTo(cx + mx - mouthW * 0.4, cy + my - mouthW * 0.2)
    g.lineTo(cx + mx + mouthW * 0.5, cy + my)
    g.lineTo(cx + mx - mouthW * 0.4, cy + my + mouthW * 0.2)
    g.stroke({ width: 1, color: 0x443322, alpha: 0.8 })
  } else {
    g.ellipse(cx + mx, cy + my, mouthW * 0.5, mouthW * 0.35)
    g.fill({ color: adjustColor(color, -20, -15, -10), alpha: 0.7 })
  }

  if (traits.tailLength > 0.1 && detail !== 'far') {
    const tailLen = bodyW * traits.tailLength
    const [tx, ty] = rotatePoint(-bodyW * 0.5, 0, angle)
    const [tx2, ty2] = rotatePoint(-bodyW * 0.5 - tailLen, tailLen * 0.15 * (isPredator ? 1 : -1), angle)
    g.moveTo(cx + tx, cy + ty)
    g.quadraticCurveTo(cx + tx - tailLen * 0.5, cy + ty, cx + tx2, cy + ty2)
    g.stroke({ width: bodyW * 0.12, color, alpha: alpha * 0.85 })
  }

  if (detail === 'close') {
    drawAppendages(g, cx, cy, agent, traits, bodyW, angle, color, alpha)
  } else if (detail === 'medium') {
    drawLegs(g, cx, cy, traits, bodyW, bodyH, angle, color, alpha, Math.min(4, traits.legCount), agent.bodyPlan.locomotionType)
  }
}

function drawLegs(
  g: Graphics,
  cx: number,
  cy: number,
  traits: ReturnType<typeof agentVisualTraits>,
  bodyW: number,
  bodyH: number,
  angle: number,
  color: number,
  alpha: number,
  count: number,
  locomotion: MobileAgent['bodyPlan']['locomotionType'] = 'legs',
): void {
  if (traits.finEmphasis || locomotion === 'fins') {
    for (let i = -1; i <= 1; i += 2) {
      const [fx, fy] = rotatePoint(0, i * bodyH * 0.4, angle)
      const finTip = rotatePoint(bodyW * 0.35 * i, 0, angle)
      g.moveTo(cx + fx, cy + fy)
      g.lineTo(cx + finTip[0], cy + finTip[1])
      g.stroke({ width: bodyW * 0.1, color, alpha: alpha * 0.7 })
    }
    return
  }

  if (locomotion === 'tentacles') {
    for (let i = 0; i < count; i++) {
      const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1
      const [lx, ly] = rotatePoint(bodyW * 0.35, bodyH * 0.5 * t, angle)
      const wave = rotatePoint(bodyW * 0.55, bodyH * 0.7 * t, angle)
      g.moveTo(cx + lx, cy + ly)
      g.quadraticCurveTo(cx + wave[0], cy + wave[1], cx + wave[0] + bodyW * 0.2, cy + wave[1] + bodyW * 0.15 * t)
      g.stroke({ width: bodyW * 0.07, color, alpha: alpha * 0.85 })
    }
    return
  }

  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : (i / (count - 1)) * 2 - 1
    const [lx, ly] = rotatePoint(-bodyW * 0.1, bodyH * 0.45 * t, angle)
    const legLen = bodyW * traits.appendageLength
    const [lx2, ly2] = rotatePoint(-bodyW * 0.1 + legLen * 0.3, bodyH * 0.45 * t + legLen, angle)
    g.moveTo(cx + lx, cy + ly)
    g.lineTo(cx + lx2, cy + ly2)
    g.stroke({ width: bodyW * 0.08, color: adjustColor(color, -15, -10, -5), alpha })
  }
}

function drawAppendages(
  g: Graphics,
  cx: number,
  cy: number,
  _agent: MobileAgent,
  traits: ReturnType<typeof agentVisualTraits>,
  bodyW: number,
  angle: number,
  color: number,
  alpha: number,
): void {
  drawLegs(g, cx, cy, traits, bodyW, bodyW * 0.8, angle, color, alpha, traits.legCount, _agent.bodyPlan.locomotionType)

  if (traits.antennaCount > 0) {
    for (let i = 0; i < traits.antennaCount; i++) {
      const side = i % 2 === 0 ? -1 : 1
      const [ax, ay] = rotatePoint(bodyW * 0.55, side * bodyW * 0.25, angle)
      const [ax2, ay2] = rotatePoint(bodyW * 0.75, side * bodyW * 0.55, angle)
      g.moveTo(cx + ax, cy + ay)
      g.lineTo(cx + ax2, cy + ay2)
      g.stroke({ width: bodyW * 0.06, color: adjustColor(color, 10, 5, 0), alpha })
      g.circle(cx + ax2, cy + ay2, bodyW * 0.05)
      g.fill({ color: 0xffffff, alpha: 0.5 })
    }
  }

  if (traits.clawEmphasis) {
    const [cx1, cy1] = rotatePoint(bodyW * 0.4, -bodyW * 0.35, angle)
    const clawTip = rotatePoint(bodyW * 0.2, -bodyW * 0.15, angle)
    g.moveTo(cx + cx1, cy + cy1)
    g.lineTo(cx + cx1 + clawTip[0], cy + cy1 + clawTip[1])
    g.stroke({ width: bodyW * 0.07, color: 0xcccccc, alpha: 0.8 })
  }

  if (traits.spineEmphasis) {
    for (let i = 0; i < 3; i++) {
      const [sx, sy] = rotatePoint(-bodyW * 0.1 + i * bodyW * 0.15, -bodyW * 0.35, angle)
      const spineTip = rotatePoint(0, -bodyW * 0.12, angle)
      g.moveTo(cx + sx, cy + sy)
      g.lineTo(cx + sx + spineTip[0], cy + sy + spineTip[1])
      g.stroke({ width: bodyW * 0.05, color: 0x888888, alpha: 0.6 })
    }
  }
}

export function drawAgentPreview(
  g: Graphics,
  agent: MobileAgent,
  cx: number,
  cy: number,
  previewSize: number,
): void {
  const traits = agentVisualTraits(agent)
  const scale = previewSize * traits.bodyScale
  const { color, alpha } = traitsToColor(traits.hue, traits.saturation, traits.brightness, 0.95)
  const bodyW = scale * traits.bodyWidth
  const bodyH = scale * traits.bodyHeight
  drawCreatureBody(g, cx, cy, agent, traits, bodyW, bodyH, 0, color, alpha, 'close')
}
