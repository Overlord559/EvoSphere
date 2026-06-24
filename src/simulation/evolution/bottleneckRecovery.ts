import type { World } from '../../types/simulation'
import { tickToYears } from '../engine/simTime'

export type BottleneckKind =
  | 'none'
  | 'ecological_bottleneck'
  | 'artificial_cap_bottleneck'
  | 'carrying_capacity_plateau'
  | 'expansion_failure'

export interface BottleneckState {
  detected: boolean
  kind: BottleneckKind
  flatPopulationTicks: number
  flatSpeciesTicks: number
  flatTilesTicks: number
  recoveryActive: boolean
  recoveryStartedTick: number
  lastDetectedTick: number
  immediateExtinctions: number
  /** True when tracked cap is hit but habitat remains suitable. */
  artificialCapPressure: boolean
  /** Estimated world carrying capacity at detection. */
  habitatCapacityEstimate: number
}

export type BottleneckEventEmitter = (type: string, message: string) => void

const FLAT_WINDOW = 80
const POP_FLAT_THRESHOLD = 0.02
const SPECIES_COLLAPSE_THRESHOLD = 0.15
const TILE_FLAT_THRESHOLD = 0.01

export function createBottleneckState(): BottleneckState {
  return {
    detected: false,
    kind: 'none',
    flatPopulationTicks: 0,
    flatSpeciesTicks: 0,
    flatTilesTicks: 0,
    recoveryActive: false,
    recoveryStartedTick: 0,
    lastDetectedTick: 0,
    immediateExtinctions: 0,
    artificialCapPressure: false,
    habitatCapacityEstimate: 0,
  }
}

export interface BottleneckMetrics {
  totalPopulation: number
  biologicalPopulation: number
  trackedPopulation: number
  aggregatePopulation: number
  speciesCount: number
  colonizedTiles: number
  producerBiomass: number
  dominantShare: number
  habitatCapacityEstimate: number
  suitableHabitatRemaining: number
  artificialCapEngaged: boolean
  capacityPressurePct: number
}

export function updateBottleneckDetection(
  state: BottleneckState,
  tick: number,
  current: BottleneckMetrics,
  previous: BottleneckMetrics,
  emit: BottleneckEventEmitter,
  suppressEvents = false,
): BottleneckState {
  const popDelta =
    previous.totalPopulation > 0
      ? Math.abs(current.totalPopulation - previous.totalPopulation) / previous.totalPopulation
      : 1
  const tileDelta =
    previous.colonizedTiles > 0
      ? Math.abs(current.colonizedTiles - previous.colonizedTiles) / previous.colonizedTiles
      : 1

  state.flatPopulationTicks = popDelta < POP_FLAT_THRESHOLD ? state.flatPopulationTicks + 1 : 0
  state.flatSpeciesTicks =
    current.speciesCount < previous.speciesCount * (1 - SPECIES_COLLAPSE_THRESHOLD)
      ? state.flatSpeciesTicks + 1
      : 0
  state.flatTilesTicks = tileDelta < TILE_FLAT_THRESHOLD ? state.flatTilesTicks + 1 : 0

  const monopoly = current.dominantShare > 0.85 && current.speciesCount > 2
  const stagnant =
    state.flatPopulationTicks >= FLAT_WINDOW &&
    state.flatTilesTicks >= FLAT_WINDOW / 2 &&
    current.totalPopulation > 0

  let detectedKind: BottleneckKind = 'none'
  if (stagnant || monopoly || state.flatSpeciesTicks > 20) {
    if (
      current.artificialCapEngaged &&
      current.suitableHabitatRemaining > 0.15 &&
      current.capacityPressurePct > 0.7
    ) {
      detectedKind = 'artificial_cap_bottleneck'
    } else if (
      current.suitableHabitatRemaining > 0.2 &&
      current.capacityPressurePct < 0.85 &&
      current.colonizedTiles < current.habitatCapacityEstimate * 0.3
    ) {
      detectedKind = 'expansion_failure'
    } else if (current.capacityPressurePct >= 0.88 && current.suitableHabitatRemaining < 0.1) {
      detectedKind = 'carrying_capacity_plateau'
    } else if (current.biologicalPopulation < current.habitatCapacityEstimate * 0.25) {
      detectedKind = 'ecological_bottleneck'
    } else {
      detectedKind = 'carrying_capacity_plateau'
    }
  }

  if (detectedKind !== 'none' && !state.detected) {
    state.detected = true
    state.kind = detectedKind
    state.lastDetectedTick = tick
    state.artificialCapPressure = detectedKind === 'artificial_cap_bottleneck'
    state.habitatCapacityEstimate = current.habitatCapacityEstimate
    if (!suppressEvents) {
      const msg =
        detectedKind === 'artificial_cap_bottleneck'
          ? `Representation cap reached at year ${tickToYears(tick)} — aggregate pools absorbing growth; habitat remains suitable.`
          : detectedKind === 'expansion_failure'
            ? `Expansion failure at year ${tickToYears(tick)} — suitable habitat exists but dispersal/adaptation is weak.`
            : detectedKind === 'carrying_capacity_plateau'
              ? `Population plateau at year ${tickToYears(tick)} — ecological carrying capacity reached locally.`
              : `Ecological bottleneck at year ${tickToYears(tick)} — recovery pressure activating.`
      emit('evolution.bottleneck_detected', msg)
    }
  }

  if (state.detected && !state.recoveryActive && current.totalPopulation > 0) {
    state.recoveryActive = true
    state.recoveryStartedTick = tick
    if (!suppressEvents) {
      const recoveryMsg =
        state.kind === 'artificial_cap_bottleneck'
          ? 'Converting excess population to aggregate representation pools.'
          : state.kind === 'expansion_failure'
            ? 'Boosting dispersal and adaptive radiation pressure.'
            : 'Recovery phase started from surviving refugia lineages.'
      emit('evolution.recovery_started', recoveryMsg)
    }
  }

  if (state.recoveryActive && current.colonizedTiles > previous.colonizedTiles + 5) {
    state.detected = false
    state.kind = 'none'
    state.recoveryActive = false
    state.flatPopulationTicks = 0
    state.flatTilesTicks = 0
    state.artificialCapPressure = false
  }

  return state
}

export interface RecoveryModifiers {
  reproductionBoost: number
  dispersalBoost: number
  mutationVarianceBoost: number
  overcrowdingRelief: number
}

export function recoveryModifiers(state: BottleneckState): RecoveryModifiers {
  if (!state.recoveryActive) {
    return {
      reproductionBoost: 1,
      dispersalBoost: 1,
      mutationVarianceBoost: 1,
      overcrowdingRelief: 1,
    }
  }
  switch (state.kind) {
    case 'artificial_cap_bottleneck':
      return {
        reproductionBoost: 1.05,
        dispersalBoost: 1.15,
        mutationVarianceBoost: 1.04,
        overcrowdingRelief: 0.9,
      }
    case 'expansion_failure':
      return {
        reproductionBoost: 1.08,
        dispersalBoost: 1.35,
        mutationVarianceBoost: 1.12,
        overcrowdingRelief: 0.88,
      }
    case 'carrying_capacity_plateau':
      return {
        reproductionBoost: 1,
        dispersalBoost: 1.1,
        mutationVarianceBoost: 1.15,
        overcrowdingRelief: 1,
      }
    default:
      return {
        reproductionBoost: 1.12,
        dispersalBoost: 1.25,
        mutationVarianceBoost: 1.08,
        overcrowdingRelief: 0.85,
      }
  }
}

export function recordImmediateBranchExtinction(state: BottleneckState): void {
  state.immediateExtinctions += 1
}

export function isRefugiaTile(world: World, tileIndex: number): boolean {
  const tile = world.tiles[tileIndex]
  if (!tile || tile.terrain === 'void') return false
  return (
    tile.terrain === 'hydrothermal_vent' ||
    tile.terrain === 'deep_ocean' ||
    tile.terrain === 'basin' ||
    tile.terrain === 'volcanic'
  )
}
