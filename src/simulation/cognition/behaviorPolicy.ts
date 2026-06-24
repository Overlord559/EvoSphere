import type { AgentGoal, MobileAgent } from '../../types/agents'
import type { SpeciesMemory } from '../../types/cognition'
import {
  buildControllerInputs,
  reinforceController,
  recordAgentFailure,
  recordAgentSuccess,
} from './agentLearning'
import {
  controllerForward,
  dominantOutput,
  OUTPUT_LABELS,
  type ControllerOutputIndex,
} from './NeuralController'
import { speciesMemoryHabitatModifier } from './speciesMemory'

/** Map controller output dominance to agent goal — blends with utility when controller weak. */
export function goalFromController(
  agent: MobileAgent,
  fallbackGoal: AgentGoal,
  disasterStress = 0,
  speciesMemory?: SpeciesMemory,
): AgentGoal {
  if (!agent.controller) return fallbackGoal

  const inputs = buildControllerInputs(agent, disasterStress)
  const outputs = controllerForward(agent.controller, inputs)
  const { index, value } = dominantOutput(outputs)

  if (value < 0.42) return fallbackGoal

  const habitatMod = speciesMemory ? speciesMemoryHabitatModifier(speciesMemory, {
    x: agent.x,
    y: agent.y,
    terrain: 'barren',
    ecosystem: 'none',
    successionStage: 'none',
    successionStability: 0,
    disturbanceLevel: 0,
    elevation: 0.5,
    moisture: 0.5,
    temperature: 0.5,
    water: 0.5,
    soilFertility: 0.5,
    resourceDeposits: 0,
  }) : 1

  if (habitatMod < 0.85 && (index === 5 || index === 4)) {
    return 'migrate'
  }

  switch (index as ControllerOutputIndex) {
    case 0:
      return agent.trophicRole === 'predator' ? 'hunt' : 'find_food'
    case 1:
      return 'flee'
    case 2:
      return 'hunt'
    case 3:
      return 'rest'
    case 4:
      return 'wander'
    case 5:
      return 'migrate'
    case 6:
      return 'seek_mate'
    case 7:
      return agent.habitatStress > 0.4 ? 'migrate' : 'flee'
    default:
      return fallbackGoal
  }
}

export function controllerGoalLabel(agent: MobileAgent, disasterStress = 0): string {
  if (!agent.controller) return 'utility fallback'
  const outputs = controllerForward(agent.controller, buildControllerInputs(agent, disasterStress))
  const { index, value } = dominantOutput(outputs)
  return `${OUTPUT_LABELS[index] ?? 'unknown'} (${(value * 100).toFixed(0)}%)`
}

export function applyLearningFromAction(
  agent: MobileAgent,
  action: string,
  success: boolean,
): void {
  if (!agent.controller) return
  const outputMap: Record<string, ControllerOutputIndex> = {
    graze: 0,
    eat: 0,
    hunt: 2,
    flee: 1,
    rest: 3,
    move: 4,
    migrate: 5,
    reproduce: 6,
  }
  const idx = outputMap[action] ?? 4
  if (success) {
    recordAgentSuccess(agent, action)
    reinforceController(agent, idx, 0.06)
  } else {
    recordAgentFailure(agent, action)
    reinforceController(agent, idx, -0.04)
  }
}
