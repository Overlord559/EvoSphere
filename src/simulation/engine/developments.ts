import type { AgentSnapshot } from '../../types/agents'
import type { LifeSnapshot } from '../../types/life'
import type { DisasterSnapshot, LatestDevelopment } from '../../types/runtime'
import type { EventLogEntry, World } from '../../types/simulation'
import { DISASTER_LABELS, type DisasterType } from '../disasters/DisasterTypes'
import { formatEstimatedPopulation } from '../ecology/representationScale'
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
  disasters: DisasterSnapshot,
): LatestDevelopment[] {
  const out: LatestDevelopment[] = []
  const year = tickToYears(tick)
  let id = 0
  const push = (message: string, severity: LatestDevelopment['severity']) => {
    out.push({ id: `dev-${tick}-${id++}`, message, severity, year, tick })
  }

  for (const disaster of disasters.active.slice(0, 2)) {
    const label = DISASTER_LABELS[disaster.type as DisasterType] ?? disaster.type
    push(`${label} ongoing — ${disaster.effectSummary}`, 'warning')
    const c = centroidFromTiles(disaster.affectedTileIds, world.width)
    if (c) {
      out[out.length - 1].focusTileX = Math.round(c.x)
      out[out.length - 1].focusTileY = Math.round(c.y)
    }
  }

  const disasterEvent = events.find(
    (e) => e.type.startsWith('disaster.') && e.type !== 'disaster.ended',
  )
  if (disasterEvent && out.length < 6) {
    push(disasterEvent.message, 'warning')
  }

  const grazerCenter = agentCentroid(agents, (r) => r === 'grazer')
  if (grazerCenter && grazerCenter.count >= 3 && out.length < 6) {
    const region = regionLabel(grazerCenter.x, grazerCenter.y, world.width, world.height)
    push(`Grazers are active across ${region} grasslands (${grazerCenter.count} visible).`, 'info')
    out[out.length - 1].focusTileX = Math.round(grazerCenter.x)
    out[out.length - 1].focusTileY = Math.round(grazerCenter.y)
  }

  const predatorCenter = agentCentroid(agents, (r) => r === 'predator')
  if (predatorCenter && predatorCenter.count >= 2 && out.length < 6) {
    const region = regionLabel(predatorCenter.x, predatorCenter.y, world.width, world.height)
    push(`Predators are concentrating near the ${region} territories.`, 'warning')
    out[out.length - 1].focusTileX = Math.round(predatorCenter.x)
    out[out.length - 1].focusTileY = Math.round(predatorCenter.y)
  }

  const bloomEvent = events.find((e) => e.type === 'life.bloom')
  if (bloomEvent && out.length < 6) {
    push(bloomEvent.message.replace(/^Life bloom:/i, 'Biomass surge:'), 'positive')
  }

  const algaeSpecies = life.species.find((s) => s.kind === 'Algae' && s.population > 8)
  if (algaeSpecies && out.length < 6) {
    const occ = life.speciesOccupancy[algaeSpecies.id]
    const c = occ ? centroidFromTiles(occ.tileIndices, world.width) : null
    if (c) {
      const region = regionLabel(c.x, c.y, world.width, world.height)
      push(`Algae blooms expanded across ${region} coastlines.`, 'positive')
      out[out.length - 1].focusTileX = Math.round(c.x)
      out[out.length - 1].focusTileY = Math.round(c.y)
    }
  }

  if (agents.predatorCount >= 2 && agents.grazerCount < 4 && out.length < 6) {
    push('Predators declined after grazer collapse — prey recovery needed.', 'warning')
  }

  const extinctionEvent = events.find(
    (e) => e.type === 'life.extinction' || e.type === 'agent.local_extinction',
  )
  if (extinctionEvent && out.length < 6) {
    push(extinctionEvent.message, 'warning')
  }

  const colonization = events.find((e) => e.type === 'life.colonization')
  if (colonization && out.length < 6) {
    const msg = colonization.message.replace(/^Colonization:/i, 'Life spreading:')
    const match = msg.match(/(\d+)\s*new/i)
    if (match) {
      push(`Photosynthetic life colonized ${match[1]} new tiles.`, 'positive')
    } else {
      push(msg, 'positive')
    }
  }

  if (selectedSpeciesId && out.length < 7) {
    const record = life.species.find((s) => s.id === selectedSpeciesId)
    const occ = life.speciesOccupancy[selectedSpeciesId]
    const prev = speciesPopHistory.get(selectedSpeciesId) ?? record?.population ?? 0
    if (record && occ && record.population > 0) {
      const delta = record.population - prev
      const pct =
        prev > 0 ? Math.round((Math.abs(delta) / prev) * 100) : 0
      if (delta < 0 && pct >= 10) {
        push(
          `Selected species lost ${pct}% population during recent stress (${record.name}).`,
          'warning',
        )
      } else if (delta !== 0) {
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
  if (threatened && out.length < 7) {
    const occ = life.speciesOccupancy[threatened.id]
    const terrain = occ?.dominantTerrain ?? null
    push(
      `${threatened.name} is declining near ${terrainLabel(terrain)} — local die-off pressure.`,
      'warning',
    )
  }

  const recentPredation = events.find((e) => e.type === 'agent.predation')
  if (recentPredation && out.length < 8) {
    push(recentPredation.message, 'warning')
  }

  const wildfire = disasters.recentEnded.find((d) => d.type === 'wildfire')
  if (wildfire && out.length < 8) {
    const region = centroidFromTiles(wildfire.affectedTileIds, world.width)
    const regionName = region
      ? regionLabel(region.x, region.y, world.width, world.height)
      : 'regional'
    push(`Wildfire reduced forest biomass in the ${regionName} basin.`, 'warning')
  }

  const icePulse = disasters.recentEnded.find((d) => d.type === 'ice_age_pulse')
  if (icePulse && out.length < 8) {
    push('A cold pulse expanded tundra into mountain valleys.', 'info')
  }

  const settings = disasters.settings
  if (settings && out.length < 8) {
    const yr = tickToYears(tick)
    if (
      disasters.lastMajorDisasterYear != null &&
      disasters.lastMajorDisasterYear > 0 &&
      yr - disasters.lastMajorDisasterYear < settings.minimumYearsBetweenMajorDisasters
    ) {
      push('Major disaster cooldown active — pacing holding severity down.', 'info')
    }
    if (settings.disasterSafeMode && disasters.active.length > 0) {
      push('Safe mode preserving refugia in stressed tiles.', 'info')
    }
  }

  const capEvent = events.find(
    (e) =>
      e.type === 'population.capacity_pressure' ||
      e.type === 'population.expansion_wave' ||
      e.type === 'evolution.local_specialization',
  )
  if (capEvent && out.length < 8) {
    push(capEvent.message, capEvent.type.includes('expansion') ? 'positive' : 'info')
  }

  const popArch = life.populationArchitecture
  if (popArch.representationCapped && out.length < 8) {
    const rep = popArch.representation
    push(
      `Population compressed into ${rep.populationUnitsCount} cohort/patch units (~${formatEstimatedPopulation(life.aggregateOrganisms + agents.populationReserve)} in reserve); ${agents.totalAgents} visible agents represent larger herds/packs.`,
      'info',
    )
  } else if (popArch.capacityPressurePct >= 80 && out.length < 8) {
    push(
      `Algae reached local carrying capacity (${popArch.capacityPressurePct}% fill); expansion pressure ${popArch.expansionPressurePct}%.`,
      'info',
    )
  }

  const ecotypeEvent = events.find((e) => e.type === 'evolution.niche_expansion' || e.type === 'evolution.subspecies_emerged')
  if (ecotypeEvent && out.length < 8) {
    push(ecotypeEvent.message, 'positive')
  }

  return out.slice(0, 8)
}
