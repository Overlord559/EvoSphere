import type { SimulationSnapshot } from '../../types/simulation'

/** Species kinds counted as producers in showcase / arcade milestone QA. */
export const PRODUCER_KINDS = ['PhotosyntheticMicrobe', 'Algae', 'PrimitivePlant'] as const

/** Species kinds counted as microbial in showcase / arcade milestone QA. */
export const MICROBIAL_KINDS = ['Microbe', 'PhotosyntheticMicrobe', 'ChemosyntheticMicrobe'] as const

export interface HudMilestoneMetrics {
  microPop: number
  microSpecies: number
  microUnits: number
  producerSpecies: number
  producerPop: number
  mobileAgents: number
  mobilePop: number
  mobileReserve: number
  mobileCohorts: number
}

/** Browser HUD metrics aligned with headless qa:showcase-evolution-speed. */
export function hudMilestoneMetrics(snapshot: SimulationSnapshot): HudMilestoneMetrics {
  const alive = snapshot.life.species.filter((s) => s.population > 0)
  const microbial = alive.filter((s) =>
    MICROBIAL_KINDS.includes(s.kind as (typeof MICROBIAL_KINDS)[number]),
  )
  const producers = alive.filter((s) =>
    PRODUCER_KINDS.includes(s.kind as (typeof PRODUCER_KINDS)[number]),
  )
  const microUnits = snapshot.life.populationUnits.filter((u) =>
    [...MICROBIAL_KINDS, 'Algae'].includes(u.kind as string),
  ).length
  const mobileCohorts = snapshot.life.populationUnits.filter(
    (u) => u.unitType === 'herd' || u.unitType === 'pack' || u.unitType === 'swarm',
  ).length

  return {
    microPop: microbial.reduce((n, s) => n + s.population, 0),
    microSpecies: microbial.length,
    microUnits,
    producerSpecies: producers.length,
    producerPop: producers.reduce((n, s) => n + s.population, 0),
    mobileAgents: snapshot.agents.totalAgents,
    mobilePop: snapshot.agents.totalMobilePopulation,
    mobileReserve: snapshot.agents.populationReserve,
    mobileCohorts,
  }
}
