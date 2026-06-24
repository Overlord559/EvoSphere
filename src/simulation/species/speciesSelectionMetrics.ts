import type { MobileAgent } from '../../types/agents'
import type { BodyPlan } from '../../types/bodyPlan'
import type { SpeciesRecord } from '../../types/life'
import type { SensoryProfile } from '../../types/senses'
import type { SpeciesSelectionProfile } from '../../types/selection'
import type { World } from '../../types/simulation'
import { bodyPlanSummary } from '../../types/bodyPlan'
import { sensesSummary } from '../../types/senses'
import { getTileAt } from '../world/generateWorld'
import { computeAgentFitness } from '../ecology/environmentalFitness'

function averageBodyPlan(plans: BodyPlan[]): BodyPlan | null {
  if (plans.length === 0) return null
  const n = plans.length
  const numericKeys: (keyof Pick<
    BodyPlan,
    | 'limbCount'
    | 'manipulatorPotential'
    | 'armorLevel'
    | 'aquaticAdaptation'
    | 'terrestrialAdaptation'
    | 'burrowingAdaptation'
    | 'climbingAdaptation'
    | 'flightPotential'
  >)[] = [
    'limbCount',
    'manipulatorPotential',
    'armorLevel',
    'aquaticAdaptation',
    'terrestrialAdaptation',
    'burrowingAdaptation',
    'climbingAdaptation',
    'flightPotential',
  ]
  const avg = { ...plans[0] }
  for (const key of numericKeys) {
    let sum = 0
    for (const p of plans) sum += p[key]
    avg[key] = key === 'limbCount' ? Math.round(sum / n) : sum / n
  }
  return avg
}

function averageSenses(profiles: SensoryProfile[]): SensoryProfile | null {
  if (profiles.length === 0) return null
  const n = profiles.length
  return {
    visualRange: profiles.reduce((s, p) => s + p.visualRange, 0) / n,
    smellRange: profiles.reduce((s, p) => s + p.smellRange, 0) / n,
    vibrationRange: profiles.reduce((s, p) => s + p.vibrationRange, 0) / n,
    heatSensitivity: profiles.reduce((s, p) => s + p.heatSensitivity, 0) / n,
    waterSensitivity: profiles.reduce((s, p) => s + p.waterSensitivity, 0) / n,
    pressureSensitivity: profiles.reduce((s, p) => s + p.pressureSensitivity, 0) / n,
    primarySensor: profiles[0].primarySensor,
  }
}

export function buildSpeciesSelectionProfiles(
  species: SpeciesRecord[],
  agents: MobileAgent[],
  world: World,
  tileBiomass: number[],
  tileAgentCounts: number[],
): Record<string, SpeciesSelectionProfile> {
  const out: Record<string, SpeciesSelectionProfile> = {}
  const bySpecies = new Map<string, MobileAgent[]>()

  for (const agent of agents) {
    const list = bySpecies.get(agent.speciesId) ?? []
    list.push(agent)
    bySpecies.set(agent.speciesId, list)
  }

  for (const record of species) {
    if (!record.isMobile || record.population <= 0) continue
    const group = bySpecies.get(record.id) ?? []
    if (group.length === 0) continue

    const terrainCounts = new Map<string, number>()
    let fitnessSum = 0
    let extinctionSum = 0
    const pressures = new Set<string>()
    const notes: string[] = []

    for (const agent of group) {
      const tile = getTileAt(world, agent.x, agent.y)
      if (!tile) continue
      const idx = agent.y * world.width + agent.x
      const biomass = tileBiomass[idx] ?? 0
      const fit = computeAgentFitness(agent, tile, biomass, tileAgentCounts[idx] ?? 0, 0)
      fitnessSum += fit.score
      extinctionSum += fit.extinctionRisk
      terrainCounts.set(fit.habitatLabel, (terrainCounts.get(fit.habitatLabel) ?? 0) + 1)
      if (fit.migrationPressure > 0.55) pressures.add('migration')
      if (fit.healthStress > 0.5) pressures.add('environmental stress')
      if (agent.hunger > 0.7) pressures.add('starvation')
      if (agent.sensoryInput?.predatorPressure && agent.sensoryInput.predatorPressure > 0.4) pressures.add('predation')
    }

    let dominantHabitat = 'unknown'
    let maxCount = 0
    for (const [terrain, count] of terrainCounts) {
      if (count > maxCount) {
        maxCount = count
        dominantHabitat = terrain
      }
    }

    const avgPlan = averageBodyPlan(group.map((a) => a.bodyPlan))
    const avgSenses = averageSenses(group.map((a) => a.senses))
    const avgFitness = fitnessSum / group.length
    const avgExtinction = extinctionSum / group.length

    if (avgPlan && avgPlan.aquaticAdaptation > 0.65) notes.push('wetland/coastal specialization')
    if (avgPlan && avgPlan.armorLevel > 0.55) notes.push('armored against predation')
    if (avgSenses && avgSenses.visualRange > 3) notes.push('strong visual hunters/foragers')
    if (avgFitness > 0.65) notes.push('well adapted to current habitat')
    if (avgFitness < 0.35) notes.push('marginal habitat fit')

    out[record.id] = {
      speciesId: record.id,
      preferredTerrain: group[0] ? dominantHabitat : 'generalist',
      dominantHabitat,
      averageBodyPlan: avgPlan,
      averageSensoryProfile: avgSenses,
      bodyPlanSummary: avgPlan ? bodyPlanSummary(avgPlan) : '—',
      sensesSummary: avgSenses ? sensesSummary(avgSenses) : '—',
      environmentalFitnessScore: avgFitness,
      selectionPressures: [...pressures],
      extinctionRisk: avgExtinction,
      adaptationNotes: notes,
    }
  }

  return out
}

export function buildSelectionNarratives(
  profiles: Record<string, SpeciesSelectionProfile>,
  species: SpeciesRecord[],
): string[] {
  const narratives: string[] = []
  const entries = Object.values(profiles)

  for (const p of entries) {
    const record = species.find((s) => s.id === p.speciesId)
    if (!record) continue
    if (p.dominantHabitat === 'arid/cold' && p.environmentalFitnessScore > 0.55) {
      narratives.push(
        `${record.name} tolerates ${p.dominantHabitat} — cold/drought-adapted ${record.trophicRole}s holding on.`,
      )
    }
    if (p.dominantHabitat === 'wetland' || p.dominantHabitat === 'aquatic') {
      if (record.trophicRole === 'grazer' && record.population > 5) {
        narratives.push(
          `Wetland producer biomass supports ${record.name} grazer population (${record.population}).`,
        )
      }
    }
    if (p.selectionPressures.includes('predation') && p.averageSensoryProfile && p.averageSensoryProfile.visualRange > 3) {
      narratives.push(
        `Predators with stronger senses dominate ${p.dominantHabitat} — ${record.name} leading locally.`,
      )
    }
    if (p.dominantHabitat === 'grassland' && p.environmentalFitnessScore > 0.6 && record.trophicRole === 'grazer') {
      narratives.push(`${record.name} expanding across ${p.dominantHabitat} grasslands.`)
    }
    if (p.adaptationNotes.includes('marginal habitat fit') && record.trophicRole === 'scavenger') {
      narratives.push(`Desert-adapted scavengers like ${record.name} surviving drought better.`)
    }
  }

  return narratives.slice(0, 6)
}
