import type { MobileAgent } from '../../types/agents'
import type { AgentMemory } from '../../types/cognition'
import {
  CONTROLLER_INPUT_COUNT,
  CONTROLLER_OUTPUT_COUNT,
  type ControllerOutputIndex,
  sanitizeController,
} from './NeuralController'

const LEARNING_RATE = 0.018
const MEMORY_DECAY = 0.9995

export function createEmptyAgentMemory(): AgentMemory {
  return {
    lastFoodTile: null,
    lastDangerTile: null,
    preferredHabitatSignature: 0.5,
    successCounts: {},
    failureCounts: {},
    survivedDisaster: false,
    inheritedKnowledgeScore: 0,
  }
}

export function buildControllerInputs(agent: MobileAgent, disasterStress = 0): Float32Array {
  const input = agent.sensoryInput
  const inputs = new Float32Array(CONTROLLER_INPUT_COUNT)
  inputs[0] = agent.hunger
  inputs[1] = agent.energy
  inputs[2] = agent.health
  inputs[3] = Math.min(1, (input?.nearestFoodBiomass ?? 0) / 8)
  inputs[4] = input?.predatorPressure ?? 0
  inputs[5] = Math.min(1, (input?.predatorPressure ?? 0) > 0.2 ? 0.6 : 0.1)
  inputs[6] = agent.habitatStress
  inputs[7] = Math.min(1, agent.habitatStress * 0.6 + (1 - agent.environmentalFitness) * 0.4)
  inputs[8] = Math.min(1, (input?.habitatQuality ?? 0.5) < 0.35 ? 0.7 : 0.2)
  inputs[9] = Math.min(1, (agent.memory?.successCounts['feed'] ?? 0) / 10)
  inputs[10] = Math.min(1, (agent.memory?.failureCounts['hunt'] ?? 0) / 8)
  inputs[11] = disasterStress
  return inputs
}

export function reinforceController(
  agent: MobileAgent,
  outputIndex: ControllerOutputIndex,
  reward: number,
): void {
  if (!agent.controller) return
  const delta = reward * LEARNING_RATE
  agent.controller.learnedBias[outputIndex] += delta
  sanitizeController(agent.controller)
}

export function recordAgentSuccess(agent: MobileAgent, action: string): void {
  if (!agent.memory) agent.memory = createEmptyAgentMemory()
  agent.memory.successCounts[action] = (agent.memory.successCounts[action] ?? 0) + 1
  agent.memory.lastFoodTile = { x: agent.x, y: agent.y }
}

export function recordAgentFailure(agent: MobileAgent, action: string): void {
  if (!agent.memory) agent.memory = createEmptyAgentMemory()
  agent.memory.failureCounts[action] = (agent.memory.failureCounts[action] ?? 0) + 1
  agent.memory.lastDangerTile = { x: agent.x, y: agent.y }
}

export function decayAgentMemory(agent: MobileAgent): void {
  if (!agent.memory) return
  agent.memory.preferredHabitatSignature =
    agent.memory.preferredHabitatSignature * MEMORY_DECAY + agent.environmentalFitness * (1 - MEMORY_DECAY)
}

export function inheritMemoryBias(
  parent: MobileAgent,
  inheritanceRate = 0.45,
): AgentMemory {
  const pm = parent.memory ?? createEmptyAgentMemory()
  const child = createEmptyAgentMemory()
  child.preferredHabitatSignature = pm.preferredHabitatSignature
  child.lastFoodTile = pm.lastFoodTile ? { ...pm.lastFoodTile } : null
  child.inheritedKnowledgeScore = Math.min(
    1,
    pm.inheritedKnowledgeScore * inheritanceRate +
      Object.values(pm.successCounts).reduce((a, b) => a + b, 0) * 0.02,
  )
  if (parent.controller) {
    for (let i = 0; i < CONTROLLER_OUTPUT_COUNT; i++) {
      child.inheritedKnowledgeScore += Math.abs(parent.controller.learnedBias[i] ?? 0) * 0.1
    }
    child.inheritedKnowledgeScore = Math.min(1, child.inheritedKnowledgeScore)
  }
  return child
}

export function applyInheritedLearnedBias(
  childController: import('./NeuralController').NeuralController,
  parentController: import('./NeuralController').NeuralController,
  rate = 0.35,
): void {
  for (let i = 0; i < CONTROLLER_OUTPUT_COUNT; i++) {
    childController.learnedBias[i] += parentController.learnedBias[i] * rate
  }
  sanitizeController(childController)
}
