import type { World } from '../../types/simulation'
import { tickToYears } from '../engine/simTime'

export interface BottleneckState {
  detected: boolean
  flatPopulationTicks: number
  flatSpeciesTicks: number
  flatTilesTicks: number
  recoveryActive: boolean
  recoveryStartedTick: number
  lastDetectedTick: number
  immediateExtinctions: number
}

export type BottleneckEventEmitter = (type: string, message: string) => void

const FLAT_WINDOW = 80
const POP_FLAT_THRESHOLD = 0.02
const SPECIES_COLLAPSE_THRESHOLD = 0.15
const TILE_FLAT_THRESHOLD = 0.01

export function createBottleneckState(): BottleneckState {
  return {
    detected: false,
    flatPopulationTicks: 0,
    flatSpeciesTicks: 0,
    flatTilesTicks: 0,
    recoveryActive: false,
    recoveryStartedTick: 0,
    lastDetectedTick: 0,
    immediateExtinctions: 0,
  }
}

export interface BottleneckMetrics {
  totalPopulation: number
  speciesCount: number
  colonizedTiles: number
  producerBiomass: number
  dominantShare: number
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

  if ((stagnant || monopoly || state.flatSpeciesTicks > 20) && !state.detected) {
    state.detected = true
    state.lastDetectedTick = tick
    if (!suppressEvents) {
      emit(
        'evolution.bottleneck_detected',
        `Population bottleneck detected at year ${tickToYears(tick)} — recovery pressure activating.`,
      )
    }
  }

  if (state.detected && !state.recoveryActive && current.totalPopulation > 0) {
    state.recoveryActive = true
    state.recoveryStartedTick = tick
    if (!suppressEvents) {
      emit('evolution.recovery_started', `Recovery phase started from surviving refugia lineages.`)
    }
  }

  if (state.recoveryActive && current.colonizedTiles > previous.colonizedTiles + 5) {
    state.detected = false
    state.recoveryActive = false
    state.flatPopulationTicks = 0
    state.flatTilesTicks = 0
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
  return {
    reproductionBoost: 1.12,
    dispersalBoost: 1.25,
    mutationVarianceBoost: 1.08,
    overcrowdingRelief: 0.85,
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
