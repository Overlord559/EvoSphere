import type { AgentSnapshot } from '../../types/agents'
import type { LifeSnapshot } from '../../types/life'
import type { LatestDevelopment } from '../../types/runtime'
import type { EventLogEntry, World } from '../../types/simulation'
import { tickToYears } from './simTime'

function regionLabel(cx: number, cy: number, width: number, height: number): string {
  const h = cx < width * 0.33 ? 'western' : cx > width * 0.66 ? 'eastern' : 'central'
  const v = cy < height * 0.33 ? 'northern' : cy > height * 0.66 ? 'southern' : ''
  if (v && h !== 'central') return `${h} ${v}`
  if (v) return v
  return h
}

function terrainLabel(terrain: string | null): string {
  if (!terrain) return 'the map'
  return terrain.replace(/_/g, ' ')
}

function centroidFromTiles(
  tileIndices: number[],
  width: number,
): { x: number; y: number } | null {
  if (tileIndices.length === 0) return null
  let sx = 0
  let sy = 0
  for (const idx of tileIndices) {
    sx += idx % width
    sy += Math.floor(idx / width)
  }
  return { x: sx / tileIndices.length, y: sy / tileIndices.length }
}

function agentCentroid(
  agents: AgentSnapshot,
  filter: (role: string) => boolean,
): { x: number; y: number; count: number } | null {
  let sx = 0
  let sy = 0
  let count = 0
  for (const a of agents.agents) {
    if (!filter(a.trophicRole)) continue
    sx += a.x
    sy += a.y
    count += 1
  }
  if (count === 0) return null
  return { x: sx / count, y: sy / count, count }
}

export function buildLatestDevelopments(
  tick: number,
  world: World,
  life: LifeSnapshot,
  agents: AgentSnapshot,
  events: EventLogEntry[],
  selectedSpeciesId: string | null,
  speciesPopHistory: Map<string, number>,
): LatestDevelopment[] {
  const out: LatestDevelopment[] = []
  const year = tickToYears(tick)
  let id = 0
  const push = (message: string, severity: LatestDevelopment['severity']) => {
    out.push({ id: `dev-${tick}-${id++}`, message, severity, year, tick })
  }

  const grazerCenter = agentCentroid(agents, (r) => r === 'grazer')
  if (grazerCenter && grazerCenter.count >= 3) {
    const region = regionLabel(grazerCenter.x, grazerCenter.y, world.width, world.height)
    push(`Grazers are active across ${region} grasslands (${grazerCenter.count} visible).`, 'info')
  }

  const predatorCenter = agentCentroid(agents, (r) => r === 'predator')
  if (predatorCenter && predatorCenter.count >= 2) {
    const region = regionLabel(predatorCenter.x, predatorCenter.y, world.width, world.height)
    push(`Predators are concentrating near the ${region} territories.`, 'warning')
  }

  const bloomEvent = events.find((e) => e.type === 'life.bloom')
  if (bloomEvent) {
    push(bloomEvent.message.replace(/^Life bloom:/i, 'Biomass surge:'), 'positive')
  }

  const algaeSpecies = life.species.find((s) => s.kind === 'Algae' && s.population > 8)
  if (algaeSpecies) {
    const occ = life.speciesOccupancy[algaeSpecies.id]
    const c = occ ? centroidFromTiles(occ.tileIndices, world.width) : null
    if (c) {
      const region = regionLabel(c.x, c.y, world.width, world.height)
      push(`Algae biomass is building along ${region} aquatic zones.`, 'positive')
    }
  }

  if (agents.predatorCount >= 2 && agents.grazerCount < 4) {
    push('Prey collapse warning — predator pressure exceeds grazer recovery.', 'warning')
  }

  const extinctionEvent = events.find(
    (e) => e.type === 'life.extinction' || e.type === 'agent.local_extinction',
  )
  if (extinctionEvent) {
    push(extinctionEvent.message, 'warning')
  }

  const colonization = events.find((e) => e.type === 'life.colonization')
  if (colonization) {
    push(colonization.message.replace(/^Colonization:/i, 'Life spreading:'), 'positive')
  }

  if (selectedSpeciesId) {
    const record = life.species.find((s) => s.id === selectedSpeciesId)
    const occ = life.speciesOccupancy[selectedSpeciesId]
    const prev = speciesPopHistory.get(selectedSpeciesId) ?? record?.population ?? 0
    if (record && occ) {
      const delta = record.population - prev
      if (delta !== 0) {
        push(
          `Selected species ${record.name}: ${delta >= 0 ? '+' : ''}${delta} population, ${occ.occupiedTileCount} occupied tiles.`,
          delta >= 0 ? 'positive' : 'warning',
        )
      } else {
        push(`Selected species ${record.name} holds ${occ.occupiedTileCount} tiles.`, 'info')
      }
    }
  }

  const threatened = life.species.find((s) => {
    if (s.population <= 0 || s.population >= 15) return false
    const prev = speciesPopHistory.get(s.id) ?? s.population
    return s.population - prev < -2
  })
  if (threatened) {
    const occ = life.speciesOccupancy[threatened.id]
    const terrain = occ?.dominantTerrain ?? null
    push(
      `${threatened.name} is declining near ${terrainLabel(terrain)} — local die-off pressure.`,
      'warning',
    )
  }

  const recentPredation = events.find((e) => e.type === 'agent.predation')
  if (recentPredation && out.length < 4) {
    push(recentPredation.message, 'warning')
  }

  return out.slice(0, 8)
}
