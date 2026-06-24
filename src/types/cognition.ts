/** Proto-cognition memory types — v0.5.4 */

export interface NeuralControllerSnapshot {
  learningScore: number
  dominantOutput: string
}

export interface AgentMemory {
  lastFoodTile: { x: number; y: number } | null
  lastDangerTile: { x: number; y: number } | null
  preferredHabitatSignature: number
  successCounts: Record<string, number>
  failureCounts: Record<string, number>
  survivedDisaster: boolean
  inheritedKnowledgeScore: number
}

export interface SpeciesMemory {
  goodHabitatScores: Record<string, number>
  dangerHabitatScores: Record<string, number>
  foodPreference: number
  predatorAvoidance: number
  migrationTendency: number
  refugiaKnowledge: number
  learningScore: number
  dominantBehavior: string
}

export interface CognitionSnapshot {
  controllerTraitSummary: string | null
  learningScore: number
  inheritedBias: number
  currentGoalLabel: string | null
}
