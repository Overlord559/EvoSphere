/**
 * Structure-of-arrays storage for mobile agent hot fields.
 * Phase 1 migration: mirrors AgentSystem.agents[] after each tick for fast snapshot encoding.
 * Future: tick loop reads/writes SoA directly; object views only for inspector.
 */
import type { AgentGoal, AgentKind, MobileAgent, TrophicRole } from '../../types/agents'

const KIND_INDEX: Record<AgentKind, number> = {
  SimpleGrazer: 0,
  SimplePredator: 1,
  Scavenger: 2,
}

const ROLE_INDEX: Record<TrophicRole, number> = {
  producer: 0,
  grazer: 1,
  predator: 2,
  scavenger: 3,
}

const GOAL_INDEX: Record<AgentGoal, number> = {
  find_food: 0,
  graze: 1,
  hunt: 2,
  flee: 3,
  rest: 4,
  wander: 5,
  seek_mate: 6,
  migrate: 7,
}

export interface AgentSoAStats {
  count: number
  capacity: number
  freeSlots: number
}

export class AgentSoA {
  private capacity = 0
  private count = 0
  private freeList: number[] = []

  /** Stable integer slot per agent — maps to agents[] index during migration. */
  slotOfId = new Map<string, number>()

  x = new Float32Array(0)
  y = new Float32Array(0)
  tileIndex = new Int32Array(0)
  energy = new Float32Array(0)
  health = new Float32Array(0)
  hunger = new Float32Array(0)
  age = new Float32Array(0)
  speciesIndex = new Uint16Array(0)
  kind = new Uint8Array(0)
  trophicRole = new Uint8Array(0)
  currentGoal = new Uint8Array(0)
  bodyScale = new Float32Array(0)
  senseRange = new Float32Array(0)
  fitness = new Float32Array(0)

  /** Parallel string ids — only populated for live slots. */
  ids: (string | null)[] = []
  speciesIds: (string | null)[] = []

  private speciesIdToIndex = new Map<string, number>()
  private speciesIndexToId: string[] = []

  ensureCapacity(min: number): void {
    if (min <= this.capacity) return
    const nextCap = Math.max(min, Math.max(64, this.capacity * 2))

    this.x = growFloat32(this.x, nextCap)
    this.y = growFloat32(this.y, nextCap)
    this.tileIndex = growInt32(this.tileIndex, nextCap)
    this.energy = growFloat32(this.energy, nextCap)
    this.health = growFloat32(this.health, nextCap)
    this.hunger = growFloat32(this.hunger, nextCap)
    this.age = growFloat32(this.age, nextCap)
    this.speciesIndex = growUint16(this.speciesIndex, nextCap)
    this.kind = growUint8(this.kind, nextCap)
    this.trophicRole = growUint8(this.trophicRole, nextCap)
    this.currentGoal = growUint8(this.currentGoal, nextCap)
    this.bodyScale = growFloat32(this.bodyScale, nextCap)
    this.senseRange = growFloat32(this.senseRange, nextCap)
    this.fitness = growFloat32(this.fitness, nextCap)

    while (this.ids.length < nextCap) this.ids.push(null)
    while (this.speciesIds.length < nextCap) this.speciesIds.push(null)

    this.capacity = nextCap
  }

  /** Rebuild SoA from agent objects — called after tick or on snapshot. */
  syncFromAgents(agents: MobileAgent[], worldWidth: number): void {
    this.ensureCapacity(agents.length)
    this.slotOfId.clear()
    this.freeList.length = 0
    this.count = agents.length

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i]
      this.slotOfId.set(a.id, i)
      this.ids[i] = a.id
      this.x[i] = a.x
      this.y[i] = a.y
      this.tileIndex[i] = a.y * worldWidth + a.x
      this.energy[i] = a.energy
      this.health[i] = a.health
      this.hunger[i] = a.hunger
      this.age[i] = a.age
      this.kind[i] = KIND_INDEX[a.kind] ?? 0
      this.trophicRole[i] = ROLE_INDEX[a.trophicRole] ?? 0
      this.currentGoal[i] = GOAL_INDEX[a.currentGoal] ?? 0
      this.bodyScale[i] = a.bodyPlan?.armorLevel ?? 1
      this.senseRange[i] = a.senses?.visualRange ?? 1
      this.fitness[i] = a.environmentalFitness

      const spIdx = this.indexForSpecies(a.speciesId)
      this.speciesIndex[i] = spIdx
      this.speciesIds[i] = a.speciesId
    }

    for (let i = agents.length; i < this.capacity; i++) {
      this.ids[i] = null
      this.freeList.push(i)
    }
  }

  /** Pack positions into transferable Float32Array for render snapshots. */
  packPositions(): Float32Array {
    const out = new Float32Array(this.count * 2)
    for (let i = 0; i < this.count; i++) {
      out[i * 2] = this.x[i]
      out[i * 2 + 1] = this.y[i]
    }
    return out
  }

  packSlotIndices(): Uint16Array {
    const out = new Uint16Array(this.count)
    for (let i = 0; i < this.count; i++) out[i] = i
    return out
  }

  getStats(): AgentSoAStats {
    return { count: this.count, capacity: this.capacity, freeSlots: this.freeList.length }
  }

  private indexForSpecies(speciesId: string): number {
    let idx = this.speciesIdToIndex.get(speciesId)
    if (idx === undefined) {
      idx = this.speciesIndexToId.length
      this.speciesIdToIndex.set(speciesId, idx)
      this.speciesIndexToId.push(speciesId)
    }
    return idx
  }
}

function growFloat32(src: Float32Array, cap: number): Float32Array<ArrayBuffer> {
  const next = new Float32Array(cap)
  next.set(src)
  return next
}

function growInt32(src: Int32Array, cap: number): Int32Array<ArrayBuffer> {
  const next = new Int32Array(cap)
  next.set(src)
  return next
}

function growUint16(src: Uint16Array, cap: number): Uint16Array<ArrayBuffer> {
  const next = new Uint16Array(cap)
  next.set(src)
  return next
}

function growUint8(src: Uint8Array, cap: number): Uint8Array<ArrayBuffer> {
  const next = new Uint8Array(cap)
  next.set(src)
  return next
}

/** Migration plan (Phase B): tick hot loops read/write AgentSoA; MobileAgent views built on demand for inspector only. */
export const AGENT_SOA_MIGRATION_PLAN = {
  phaseA: 'Mirror agents[] into SoA after tick — snapshot codec uses typed arrays',
  phaseB: 'Movement, predation, grazing iterate SoA + tile buckets; objects for inspector only',
  phaseC: 'Rust/WASM hot loops operate on exported SoA buffers if TS worker ceiling hit',
} as const
