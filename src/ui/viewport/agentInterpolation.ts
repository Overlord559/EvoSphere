import type { AgentVisualState } from '../../types/runtime'
import type { MobileAgent } from '../../types/agents'

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2
}

export function syncAgentVisualStates(
  agents: MobileAgent[],
  prev: Map<string, AgentVisualState>,
): Map<string, AgentVisualState> {
  const next = new Map<string, AgentVisualState>()

  for (const agent of agents) {
    const existing = prev.get(agent.id)
    if (existing && (existing.toX !== agent.x || existing.toY !== agent.y)) {
      next.set(agent.id, {
        id: agent.id,
        fromX: existing.toX,
        fromY: existing.toY,
        toX: agent.x,
        toY: agent.y,
        progress: 0,
        lastAction: agent.lastAction,
      })
    } else if (existing) {
      next.set(agent.id, { ...existing, lastAction: agent.lastAction })
    } else {
      next.set(agent.id, {
        id: agent.id,
        fromX: agent.x,
        fromY: agent.y,
        toX: agent.x,
        toY: agent.y,
        progress: 1,
        lastAction: agent.lastAction,
      })
    }
  }

  return next
}

export function advanceAgentInterpolation(
  states: Map<string, AgentVisualState>,
  deltaMs: number,
  durationMs = 320,
): Map<string, AgentVisualState> {
  const next = new Map<string, AgentVisualState>()
  for (const [id, state] of states) {
    if (state.progress >= 1) {
      next.set(id, state)
      continue
    }
    const progress = Math.min(1, state.progress + deltaMs / durationMs)
    next.set(id, { ...state, progress })
  }
  return next
}

export function interpolatedTilePosition(state: AgentVisualState): { x: number; y: number } {
  const t = easeInOut(state.progress)
  return {
    x: state.fromX + (state.toX - state.fromX) * t,
    y: state.fromY + (state.toY - state.fromY) * t,
  }
}

export function isAgentMoving(state: AgentVisualState): boolean {
  return state.progress < 1 || state.fromX !== state.toX || state.fromY !== state.toY
}
