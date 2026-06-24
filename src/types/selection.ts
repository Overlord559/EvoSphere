import type { BodyPlan } from './bodyPlan'
import type { SensoryProfile } from './senses'

export interface SpeciesSelectionProfile {
  speciesId: string
  preferredTerrain: string
  dominantHabitat: string
  averageBodyPlan: BodyPlan | null
  averageSensoryProfile: SensoryProfile | null
  bodyPlanSummary: string
  sensesSummary: string
  environmentalFitnessScore: number
  selectionPressures: string[]
  extinctionRisk: number
  adaptationNotes: string[]
}
