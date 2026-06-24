import type {
  AgentKind,
  AgentSnapshot,
  MobileAgent,
} from '../../types/agents'
import {
  AGENT_BASE_METABOLISM,
  AGENT_HUNGER_RATE,
  AGENT_REPRODUCTION_COST,
  AGENT_REPRODUCTION_ENERGY,
  MAX_AGENTS_PER_TILE,
  MAX_TOTAL_AGENTS,
} from '../../types/agents'
import type { World } from '../../types/simulation'
import type { Rng } from '../../utils/rng'
import { forkRng } from '../../utils/rng'
import {
  chooseAgentGoal,
  goalTargetReason,
  pickMoveTarget,
  stepTowardTarget,
} from '../behavior/mobileBehavior'
import { goalFromController, applyLearningFromAction } from '../cognition/behaviorPolicy'
import {
  applyInheritedLearnedBias,
  inheritMemoryBias,
} from '../cognition/agentLearning'
import { mutateController } from '../cognition/NeuralController'
import { recordSpeciesHabitatSuccess } from '../cognition/speciesMemory'
import { adaptiveRadiationMessage, evaluateBranchCandidate } from '../evolution/adaptiveRadiation'
import type { RecoveryModifiers } from '../evolution/bottleneckRecovery'
import { scanLocalEnvironment } from '../behavior/sensoryTargets'
import { FoodWebTracker, syncSpeciesFoodWeb } from '../ecology/foodWeb'
import { computeGrazeEnergyGain, movementEnergyCost, terrainMovementCost } from '../ecology/herbivory'
import { computeAgentFitness } from '../ecology/environmentalFitness'
import { findPreyInRange, resolvePredation } from '../ecology/predation'
import { mutateMobileAgentTraits } from '../genetics/agentMutation'
import { deriveSensoryProfile } from '../senses/SenseSystem'
import { buildSpeciesSelectionProfiles } from '../species/speciesSelectionMetrics'
import { getTileAt } from '../world/generateWorld'
import { isTileActive } from '../world/planetMask'
import {
  clampAgentVitals,
  sanitizeAgent,
} from '../engine/stabilityGuards'
import type { LifeSystem } from '../life/LifeSystem'
import { SpeciesRegistry } from '../species/speciesRegistry'
import { DEFAULT_SPECIATION_CONFIG } from '../species/speciationConfig'
import { createAgent, createFounderAgent } from './createAgent'

export type AgentEventEmitter = (type: string, message: string) => void

const NOOP_EMIT: AgentEventEmitter = () => {}

export class AgentSystem {
  private agents: MobileAgent[] = []
  private tileAgentCounts: number[] = []
  private tileAgentIndex = new Map<number, MobileAgent[]>()
  private readonly seed: string
  private readonly life: LifeSystem
  private readonly foodWeb = new FoodWebTracker()
  private tickRng: Rng
  private recentActivityTiles = new Set<number>()
  private firstSpawnLogged = false
  private grazerPopBefore = 0
  private predatorPopBefore = 0
  private predationCountTick = 0
  private starvationCountTick = 0
  private deepStats = {
    predationCount: 0,
    starvationCount: 0,
    localExtinctions: 0,
  }
  private lastWorld: World | null = null
  private recoveryMods: RecoveryModifiers = {
    reproductionBoost: 1,
    dispersalBoost: 1,
    mutationVarianceBoost: 1,
    overcrowdingRelief: 1,
  }

  constructor(seed: string, world: World, life: LifeSystem) {
    this.seed = seed
    this.life = life
    this.tickRng = forkRng(seed, 'agents')
    this.initTileArrays(world)
  }

  setRecoveryModifiers(mods: RecoveryModifiers): void {
    this.recoveryMods = mods
  }

  seedInitialAgents(world: World, emit: AgentEventEmitter): void {
    const spawnRng = forkRng(this.seed, 'agent-seed')
    const registry = this.life.getRegistry()
    let spawned = 0

    for (const tile of world.tiles) {
      if (spawned >= 24) break
      if (!isTileActive(world, tile.x, tile.y)) continue
      const idx = tile.y * world.width + tile.x
      const biomass = this.life.getTileBiomassArray()[idx] ?? 0
      if (
        biomass > 0.5 &&
        (tile.terrain === 'fertile_plain' ||
          tile.terrain === 'barren' ||
          tile.terrain === 'basin' ||
          tile.ecosystem === 'grassland' ||
          tile.ecosystem === 'moss_field') &&
        spawnRng() > 0.88
      ) {
        this.spawnFounder('SimpleGrazer', tile.x, tile.y, world, 0, registry)
        spawned += 1
      }
    }

    for (const tile of world.tiles) {
      if (spawned >= 32) break
      if (!isTileActive(world, tile.x, tile.y)) continue
      const idx = tile.y * world.width + tile.x
      const grazerHere = this.tileAgentCounts[idx] ?? 0
      const biomass = this.life.getTileBiomassArray()[idx] ?? 0
      if (
        grazerHere > 0 &&
        biomass > 0.3 &&
        (tile.ecosystem === 'grassland' ||
          tile.ecosystem === 'forest' ||
          tile.terrain === 'fertile_plain') &&
        spawnRng() > 0.92
      ) {
        this.spawnFounder('SimplePredator', tile.x, tile.y, world, 0, registry)
        spawned += 1
      }
    }

    for (const tile of world.tiles) {
      if (spawned >= 36) break
      if (!isTileActive(world, tile.x, tile.y)) continue
      if (
        (tile.terrain === 'coast' || tile.terrain === 'basin' || tile.ecosystem === 'swamp') &&
        spawnRng() > 0.95
      ) {
        this.spawnFounder('Scavenger', tile.x, tile.y, world, 0, registry)
        spawned += 1
      }
    }

    this.rebuildIndexes(world)
    if (this.agents.length > 0 && !this.firstSpawnLogged) {
      this.firstSpawnLogged = true
      emit(
        'agent.spawned',
        `Mobile agents seeded: ${this.agents.length} (${this.countByRole('grazer')} grazers, ${this.countByRole('predator')} predators, ${this.countByRole('scavenger')} scavengers)`,
      )
    }
    this.grazerPopBefore = this.countByRole('grazer')
    this.predatorPopBefore = this.countByRole('predator')
  }

  tick(
    world: World,
    tick: number,
    emit: AgentEventEmitter,
    suppressMinorEvents = false,
  ): void {
    this.tickRng = forkRng(this.seed, `agents-tick-${tick}`)
    this.predationCountTick = 0
    this.starvationCountTick = 0
    this.lastWorld = world

    const tileBiomass = this.life.getTileBiomassArray()
    this.rebuildTileAgentIndex(world)
    const registry = this.life.getRegistry()

    const deaths: string[] = []
    const births: MobileAgent[] = []
    const preGrazers = this.countByRole('grazer')
    const prePredators = this.countByRole('predator')

    for (const agent of this.agents) {
      const tile = getTileAt(world, agent.x, agent.y)
      if (!tile) {
        deaths.push(agent.id)
        continue
      }

      const idx = agent.y * world.width + agent.x
      const scanCtx = { tileBiomass, tileAgentIndex: this.tileAgentIndex }
      agent.sensoryInput = scanLocalEnvironment(agent, world, scanCtx)
      const fitness = computeAgentFitness(
        agent,
        tile,
        tileBiomass[idx] ?? 0,
        this.tileAgentCounts[idx] ?? 0,
        agent.sensoryInput.predatorPressure,
      )
      agent.environmentalFitness = fitness.score
      agent.habitatStress = fitness.healthStress
      agent.senses = deriveSensoryProfile(agent.genome, agent.bodyPlan)

      agent.hunger = Math.min(1, agent.hunger + AGENT_HUNGER_RATE * agent.genome.metabolism)
      const metabolism = AGENT_BASE_METABOLISM * agent.genome.metabolism * (2 - fitness.energyGainMultiplier * 0.5)
      agent.energy = Math.max(0, agent.energy - metabolism)

      if (fitness.healthStress > 0.55) agent.health -= 0.03
      if (agent.energy < 0.18) agent.health -= 0.05
      if (agent.hunger > 0.85) agent.health -= 0.04
      agent.age += 1
      if (agent.reproductionCooldown > 0) agent.reproductionCooldown -= 1

      const utilityGoal = chooseAgentGoal(agent, tileBiomass, world, this.tileAgentIndex, this.tickRng)
      const speciesMem = registry.memoryStore.get(agent.speciesId)
      const disasterStress = 0
      const goal = agent.controller
        ? goalFromController(agent, utilityGoal, disasterStress, speciesMem)
        : utilityGoal
      agent.currentGoal = goal
      agent.targetReason = goalTargetReason(agent, goal)

      recordSpeciesHabitatSuccess(
        registry.memoryStore.ensure(agent.speciesId),
        tile,
        agent.environmentalFitness,
      )

      if (goal === 'rest') {
        agent.lastAction = 'rest'
        agent.energy = Math.min(1, agent.energy + 0.02)
        agent.hunger = Math.max(0, agent.hunger - 0.01)
      } else if (goal === 'graze' || goal === 'find_food') {
        this.tryGraze(agent, world, tileBiomass, emit, suppressMinorEvents)
      } else if (goal === 'hunt') {
        this.tryHunt(agent, world, emit, suppressMinorEvents, deaths)
      } else {
        const target = pickMoveTarget(agent, goal, world, tileBiomass, this.tileAgentIndex, this.tickRng)
        if (target) {
          agent.targetTile = target
          const step = stepTowardTarget(agent, target, world, this.tileAgentCounts, this.tickRng)
          if (step.moved) {
            const terrainCost = terrainMovementCost(
              world,
              step.x,
              step.y,
              agent.genome.terrainPreference,
            ) * fitness.movementCostMultiplier
            agent.energy = Math.max(0, agent.energy - movementEnergyCost(agent, terrainCost))
            this.moveAgent(agent, step.x, step.y, world)
            agent.lastAction = 'move'
            if (goal === 'migrate' && !suppressMinorEvents && this.tickRng() > 0.97) {
              this.recentActivityTiles.add(step.y * world.width + step.x)
              emit(
                'agent.migrated',
                `${agent.kind} migrated toward food at (${step.x}, ${step.y})`,
              )
            }
          }
        }
      }

      if (agent.age >= agent.maxAge || agent.health <= 0 || agent.energy <= 0) {
        if (agent.hunger > 0.9 && agent.energy <= 0) {
          agent.lastAction = 'starve'
          if (!suppressMinorEvents && this.tickRng() > 0.92) {
            emit('agent.starved', `${agent.kind} starved at (${agent.x}, ${agent.y})`)
          }
          this.starvationCountTick += 1
        }
        deaths.push(agent.id)
      } else if (
        agent.energy >= AGENT_REPRODUCTION_ENERGY &&
        agent.health > 0.55 &&
        agent.hunger < 0.5 &&
        agent.reproductionCooldown <= 0 &&
        fitness.reproductionMultiplier > 0.45 * this.recoveryMods.reproductionBoost &&
        this.agents.length + births.length < MAX_TOTAL_AGENTS
      ) {
        const child = this.tryReproduce(agent, world, tick, emit, suppressMinorEvents)
        if (child) {
          births.push(child)
          agent.energy -= AGENT_REPRODUCTION_COST
          agent.reproductionCooldown = Math.round(28 / Math.max(0.12, agent.genome.reproductionRate))
          if (!suppressMinorEvents) {
            emit(
              'agent.reproduced',
              `${agent.kind} reproduced — population ${this.agents.length + births.length}`,
            )
          }
        }
      }
    }

    if (deaths.length > 0) {
      const dead = new Set(deaths)
      this.agents = this.agents.filter((a) => !dead.has(a.id))
    }
    this.agents.push(...births)
    this.rebuildIndexes(world)

    if (!suppressMinorEvents) {
      this.detectFoodWebEvents(emit, preGrazers, prePredators)
    }

    this.deepStats.predationCount += this.predationCountTick
    this.deepStats.starvationCount += this.starvationCountTick
  }

  tickBatch(world: World, startTick: number, count: number): number {
    let t = startTick
    for (let i = 0; i < count; i++) {
      t += 1
      this.tick(world, t, NOOP_EMIT, true)
    }
    return t
  }

  getAgentCount(): number {
    return this.agents.length
  }

  quarantineInvalid(world: World): number {
    let removed = 0
    const next: MobileAgent[] = []
    for (const agent of this.agents) {
      const reason = sanitizeAgent(agent, world)
      if (reason) {
        removed += 1
        continue
      }
      clampAgentVitals(agent)
      next.push(agent)
    }
    if (removed > 0) {
      this.agents = next
      this.rebuildIndexes(world)
    }
    return removed
  }

  getSnapshot(includeAgents = true): AgentSnapshot {
    const registry = this.life.getRegistry()
    syncSpeciesFoodWeb(registry.getAll(), this.foodWeb)

    let grazerCount = 0
    let predatorCount = 0
    let scavengerCount = 0
    let totalBiomass = 0
    for (const agent of this.agents) {
      totalBiomass += agent.biomass
      if (agent.trophicRole === 'grazer') grazerCount += 1
      else if (agent.trophicRole === 'predator') predatorCount += 1
      else if (agent.trophicRole === 'scavenger') scavengerCount += 1
    }

    const tileBiomass = this.life.getTileBiomassArray()
    const species = registry.getAll()
    const selectionProfiles =
      this.lastWorld && includeAgents
        ? buildSpeciesSelectionProfiles(
            species,
            this.agents,
            this.lastWorld,
            tileBiomass,
            this.tileAgentCounts,
          )
        : {}

    return {
      agents: includeAgents ? [...this.agents] : [],
      totalAgents: this.agents.length,
      totalBiomass,
      tileAgentCounts: [...this.tileAgentCounts],
      grazerCount,
      predatorCount,
      scavengerCount,
      foodWebLinks: this.foodWeb.getLinks().slice(0, 24),
      dominantGrazerSpeciesId: registry.getDominantByRole('grazer')?.id ?? null,
      dominantPredatorSpeciesId: registry.getDominantByRole('predator')?.id ?? null,
      speciesSelectionProfiles: selectionProfiles,
    }
  }

  getRecentActivityTiles(): number[] {
    return [...this.recentActivityTiles]
  }

  clearRecentActivity(): void {
    this.recentActivityTiles.clear()
  }

  getDeepStats(): typeof this.deepStats {
    return { ...this.deepStats }
  }

  resetDeepStats(): void {
    this.deepStats = { predationCount: 0, starvationCount: 0, localExtinctions: 0 }
  }

  reset(world: World, emit: AgentEventEmitter): void {
    this.agents = []
    this.foodWeb.clear()
    this.tickRng = forkRng(this.seed, 'agents')
    this.recentActivityTiles.clear()
    this.firstSpawnLogged = false
    this.initTileArrays(world)
    this.resetDeepStats()
    this.seedInitialAgents(world, emit)
  }

  applyMortalityPressure(world: World, tileIndex: number, pressure: number): void {
    const w = world.width
    const x = tileIndex % w
    const y = Math.floor(tileIndex / w)
    for (const agent of this.agents) {
      if (agent.x !== x || agent.y !== y) continue
      agent.health -= pressure
      agent.energy = Math.max(0, agent.energy - pressure * 0.6)
      agent.hunger = Math.min(1, agent.hunger + pressure * 0.3)
    }
  }

  private tryGraze(
    agent: MobileAgent,
    world: World,
    tileBiomass: number[],
    emit: AgentEventEmitter,
    suppressMinorEvents: boolean,
  ): void {
    const idx = agent.y * world.width + agent.x
    const available = tileBiomass[idx] ?? 0
    const result = computeGrazeEnergyGain(agent, available)

    if (result.consumed <= 0) {
      agent.lastAction = 'idle'
      return
    }

    const actual = this.life.consumeBiomassAt(agent.x, agent.y, result.consumed, world)
    if (actual <= 0) {
      agent.lastAction = 'idle'
      return
    }

    agent.energy = Math.min(
      1,
      agent.energy +
        result.energyGain *
          (actual / result.consumed) *
          (0.85 + agent.environmentalFitness * 0.25),
    )
    agent.hunger = Math.max(0, agent.hunger - actual * 1.8)
    agent.lastAction = 'graze'
    applyLearningFromAction(agent, 'graze', true)

    if (!suppressMinorEvents && this.tickRng() > 0.985) {
      this.recentActivityTiles.add(idx)
      emit(
        'agent.grazed',
        `${agent.kind} grazed biomass at (${agent.x}, ${agent.y}) — hunger ${agent.hunger.toFixed(2)}`,
      )
    }
  }

  private tryHunt(
    predator: MobileAgent,
    world: World,
    emit: AgentEventEmitter,
    suppressMinorEvents: boolean,
    deaths: string[],
  ): void {
    this.rebuildTileAgentIndex(world)
    const prey = findPreyInRange(predator, this.agents, this.tileAgentIndex, world.width, predator.senses.visualRange)
    if (!prey) {
      predator.lastAction = 'idle'
      predator.energy = Math.max(0, predator.energy - 0.04)
      return
    }

    if (prey.x !== predator.x || prey.y !== predator.y) {
      const step = stepTowardTarget(
        predator,
        { x: prey.x, y: prey.y },
        world,
        this.tileAgentCounts,
        this.tickRng,
      )
      if (step.moved) {
        const terrainCost = terrainMovementCost(
          world,
          step.x,
          step.y,
          predator.genome.terrainPreference,
        )
        predator.energy = Math.max(0, predator.energy - movementEnergyCost(predator, terrainCost))
        this.moveAgent(predator, step.x, step.y, world)
        predator.lastAction = 'move'
      }
      return
    }

    const result = resolvePredation(predator, prey, this.tickRng)
    predator.energy = Math.max(0, predator.energy - result.huntCost)

    if (result.success && result.preyId) {
      deaths.push(result.preyId)
      predator.energy = Math.min(1, predator.energy + result.energyGain)
      predator.hunger = Math.max(0, predator.hunger - 0.45)
      predator.lastAction = 'hunt'
      this.predationCountTick += 1

      if (result.preySpeciesId) {
        this.foodWeb.recordPredation(predator.speciesId, result.preySpeciesId)
      }

      if (!suppressMinorEvents) {
        this.recentActivityTiles.add(predator.y * world.width + predator.x)
        emit(
          'agent.predation',
          `${predator.kind} hunted ${prey.kind} at (${predator.x}, ${predator.y})`,
        )
      }
      applyLearningFromAction(predator, 'hunt', true)
    } else {
      predator.lastAction = 'hunt'
      applyLearningFromAction(predator, 'hunt', false)
    }
  }

  private tryReproduce(
    parent: MobileAgent,
    world: World,
    tick: number,
    emit: AgentEventEmitter,
    suppressMinorEvents: boolean,
  ): MobileAgent | null {
    if (this.tickRng() > parent.genome.reproductionRate * 0.5 * parent.environmentalFitness + 0.2) return null
    if (this.countAtTile(parent.x, parent.y, world) >= MAX_AGENTS_PER_TILE) return null

    const registry = this.life.getRegistry()
    const mutRng = forkRng(this.seed, `agent-mut-${parent.id}-${tick}`)
    const { genome: childGenome, bodyPlan: childBodyPlan } = mutateMobileAgentTraits(
      parent.genome,
      parent.bodyPlan,
      parent.kind,
      mutRng,
    )
    let speciesId = parent.speciesId
    const childGeneration = parent.generation + 1
    const parentPop = registry.getPopulation(parent.speciesId)

    const tile = getTileAt(world, parent.x, parent.y)
    if (!tile) return null

    const config = DEFAULT_SPECIATION_CONFIG
    const branch = evaluateBranchCandidate(
      parent.genome,
      childGenome,
      tile,
      childGeneration,
      parentPop,
      config,
      tick - (registry.get(parent.speciesId)?.createdAtTick ?? tick),
      1,
    )

    if (branch.shouldBranch) {
      const existing = registry.findByGenome(parent.kind, childGenome, config.geneticDistanceVariantThreshold)
      if (existing && existing.establishmentStatus !== 'failed') {
        speciesId = existing.id
      } else {
        const species = registry.registerBranch(
          parent.kind,
          childGenome,
          tick,
          parent.speciesId,
          childGeneration,
          {
            rank: branch.rank,
            localFitnessScore: branch.localFitnessScore,
            adaptedTerrain: branch.adaptedTerrain,
            reason: branch.reason,
          },
        )
        speciesId = species.id
        if (!suppressMinorEvents && branch.rank !== 'variant') {
          emit(
            branch.rank === 'species' ? 'evolution.species_stabilized' : 'evolution.subspecies_emerged',
            adaptiveRadiationMessage(branch.rank, parent.kind, branch.reason, tick),
          )
        } else if (!suppressMinorEvents && branch.rank === 'variant' && this.tickRng() > 0.85) {
          emit('evolution.ecotype_emerged', adaptiveRadiationMessage('variant', parent.kind, branch.reason, tick))
        }
      }
    }

    const child = createAgent(
      parent.kind,
      speciesId,
      parent.x,
      parent.y,
      childGenome,
      childGeneration,
      childBodyPlan,
      `${this.seed}-child-${parent.id}-${tick}`,
    )
    if (parent.controller && child.controller) {
      child.controller = mutateController(parent.controller, () => mutRng(), parent.genome.mutationRate)
      applyInheritedLearnedBias(child.controller, parent.controller)
    }
    child.memory = inheritMemoryBias(parent)
    return child
  }

  private spawnFounder(
    kind: AgentKind,
    x: number,
    y: number,
    world: World,
    tick: number,
    registry: SpeciesRegistry,
  ): void {
    if (!isTileActive(world, x, y)) return
    if (this.countAtTile(x, y, world) >= MAX_AGENTS_PER_TILE) return
    if (this.agents.length >= MAX_TOTAL_AGENTS) return

    const founder = createFounderAgent(kind, '', x, y)
    const species = registry.getOrCreateFounderSpecies(kind, founder.genome, tick)
    founder.speciesId = species.id
    this.agents.push(founder)
  }

  private moveAgent(agent: MobileAgent, x: number, y: number, world: World): void {
    if (!isTileActive(world, x, y)) return
    const oldIdx = agent.y * world.width + agent.x
    const newIdx = y * world.width + x
    this.tileAgentCounts[oldIdx] = Math.max(0, (this.tileAgentCounts[oldIdx] ?? 0) - 1)
    this.tileAgentCounts[newIdx] = (this.tileAgentCounts[newIdx] ?? 0) + 1
    agent.x = x
    agent.y = y
  }

  private countAtTile(x: number, y: number, world: World): number {
    return this.tileAgentCounts[y * world.width + x] ?? 0
  }

  private countByRole(role: MobileAgent['trophicRole']): number {
    let count = 0
    for (const agent of this.agents) {
      if (agent.trophicRole === role) count += 1
    }
    return count
  }

  private rebuildTileAgentIndex(world: World): void {
    this.tileAgentIndex.clear()
    for (const agent of this.agents) {
      const idx = agent.y * world.width + agent.x
      const list = this.tileAgentIndex.get(idx)
      if (list) list.push(agent)
      else this.tileAgentIndex.set(idx, [agent])
    }
  }

  private rebuildIndexes(world: World): void {
    this.initTileArrays(world)
    const combined = this.life.getPopulationMap()

    for (const agent of this.agents) {
      const idx = agent.y * world.width + agent.x
      this.tileAgentCounts[idx] += 1

      const stats = combined.get(agent.speciesId) ?? { count: 0, biomass: 0 }
      stats.count += 1
      stats.biomass += agent.biomass
      combined.set(agent.speciesId, stats)
    }

    const registry = this.life.getRegistry()
    registry.updateCounts(combined)
    syncSpeciesFoodWeb(registry.getAll(), this.foodWeb)
  }

  private detectFoodWebEvents(
    emit: AgentEventEmitter,
    preGrazers: number,
    prePredators: number,
  ): void {
    const grazers = this.countByRole('grazer')
    const predators = this.countByRole('predator')

    if (preGrazers >= 8 && grazers < preGrazers * 0.45) {
      emit('foodweb.prey_collapse', `Prey collapse: grazers ${preGrazers} → ${grazers}`)
      this.deepStats.localExtinctions += 1
    }

    if (prePredators >= 3 && predators < prePredators * 0.4 && grazers < 4) {
      emit(
        'foodweb.predator_starvation',
        `Predator starvation risk: ${predators} predators, ${grazers} grazers remaining`,
      )
    }

    if (
      Math.abs(grazers - this.grazerPopBefore) >= 6 &&
      Math.abs(predators - this.predatorPopBefore) >= 2
    ) {
      emit(
        'foodweb.population_cycle',
        `Population cycle: grazers ${this.grazerPopBefore}→${grazers}, predators ${this.predatorPopBefore}→${predators}`,
      )
    }

    this.grazerPopBefore = grazers
    this.predatorPopBefore = predators
  }

  private initTileArrays(world: World): void {
    const size = world.width * world.height
    if (this.tileAgentCounts.length !== size) {
      this.tileAgentCounts = new Array(size).fill(0)
    } else {
      this.tileAgentCounts.fill(0)
    }
  }
}

export function agentsOnTile(
  agents: MobileAgent[],
  x: number,
  y: number,
): MobileAgent[] {
  return agents.filter((a) => a.x === x && a.y === y)
}

export function topAgentSpeciesOnTile(
  agents: MobileAgent[],
  x: number,
  y: number,
): { speciesId: string; kind: AgentKind; count: number }[] {
  const onTile = agentsOnTile(agents, x, y)
  const counts = new Map<string, { kind: AgentKind; count: number }>()
  for (const agent of onTile) {
    const entry = counts.get(agent.speciesId) ?? { kind: agent.kind, count: 0 }
    entry.count += 1
    counts.set(agent.speciesId, entry)
  }
  return [...counts.entries()]
    .map(([speciesId, { kind, count }]) => ({ speciesId, kind, count }))
    .sort((a, b) => b.count - a.count)
}
