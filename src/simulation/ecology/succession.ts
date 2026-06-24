import type { EcosystemType, Tile, World } from '../../types/simulation'
import { ecosystemToSuccession } from '../world/terrainHelpers'

export type SuccessionEventEmitter = (type: string, message: string) => void

const STABILITY_TICKS_ADVANCE = 45
const EVENT_COOLDOWN_TICKS = 120

export interface SuccessionContext {
  tileBiomass: number[]
  tileCounts: number[]
  worldWidth: number
  tick: number
  lastEventTick: number
  herbivoryPressure: number[]
}

export interface SuccessionSnapshot {
  barrenPercent: number
  microbialPercent: number
  algalPercent: number
  pioneerPercent: number
  grasslandPercent: number
  forestPercent: number
  swampMarshPercent: number
  maturePercent: number
}

function producerKindsOnTile(count: number, biomass: number): 'none' | 'microbial' | 'algal' | 'plant' {
  if (biomass < 0.15 && count === 0) return 'none'
  if (biomass < 0.8) return 'microbial'
  if (biomass < 2.5) return 'algal'
  return 'plant'
}

function targetEcosystem(tile: Tile, biomass: number, count: number, ctx: SuccessionContext): EcosystemType {
  const producer = producerKindsOnTile(count, biomass)
  if (producer === 'none') {
    if (tile.disturbanceLevel > 0.6) return 'none'
    return tile.ecosystem === 'none' ? 'none' : tile.ecosystem
  }

  const wet = tile.water > 0.45 || tile.moisture > 0.6
  const dry = tile.moisture < 0.25 && tile.water < 0.3
  const cold = tile.temperature < 0.28
  const vent = tile.terrain === 'hydrothermal_vent'
  const aquatic =
    tile.terrain === 'ocean' ||
    tile.terrain === 'deep_ocean' ||
    tile.terrain === 'coast' ||
    tile.terrain === 'river' ||
    tile.terrain === 'basin'

  if (vent || (aquatic && tile.water > 0.5 && biomass < 1.2)) {
    return producer === 'microbial' ? 'microbial_mat' : tile.ecosystem === 'none' ? 'microbial_mat' : tile.ecosystem
  }

  if (aquatic && biomass >= 0.8) {
    if (tile.terrain === 'coast') return biomass > 3 ? 'kelp_coast' : 'algae_bloom'
    return biomass > 4 ? 'reef' : 'algae_bloom'
  }

  if (cold || tile.terrain === 'snow' || tile.terrain === 'tundra') {
    if (biomass > 0.5) return 'moss_field'
    return 'microbial_mat'
  }

  if (wet && tile.elevation < 0.48) {
    if (biomass > 5 && tile.successionStability > STABILITY_TICKS_ADVANCE * 2) {
      return tile.moisture > 0.75 ? 'swamp' : 'marsh'
    }
    if (biomass > 2) return 'moss_field'
    return 'microbial_mat'
  }

  if (dry && tile.terrain === 'desert') {
    return biomass > 0.4 ? 'microbial_mat' : 'none'
  }

    if (producer === 'plant' || biomass > 3) {
      const herbIdx = tile.y * ctx.worldWidth + tile.x
      const herb = ctx.herbivoryPressure[herbIdx] ?? 0
    if (herb > 0.7 && tile.successionStability < STABILITY_TICKS_ADVANCE) {
      return tile.ecosystem === 'forest' ? 'grassland' : tile.ecosystem
    }
    if (biomass > 8 && tile.moisture > 0.45 && !dry) {
      return 'forest'
    }
    if (biomass > 2.5) {
      return 'grassland'
    }
    return 'moss_field'
  }

  if (producer === 'algal') return 'moss_field'
  return 'microbial_mat'
}

function applyEcosystem(tile: Tile, eco: EcosystemType): void {
  tile.ecosystem = eco
  tile.successionStage = eco === 'none' ? 'none' : ecosystemToSuccession(eco)
}

function regressFromDisturbance(tile: Tile): void {
  if (tile.disturbanceLevel < 0.35) return
  const stage = tile.successionStage
  if (stage === 'forest') applyEcosystem(tile, 'grassland')
  else if (stage === 'grassland' || stage === 'swamp' || stage === 'marsh') applyEcosystem(tile, 'moss_field')
  else if (stage === 'pioneer_plants') applyEcosystem(tile, 'microbial_mat')
  else if (stage !== 'none') applyEcosystem(tile, 'none')
  tile.disturbanceLevel *= 0.85
  tile.successionStability = 0
}

export function tickSuccession(
  world: World,
  ctx: SuccessionContext,
  emit: SuccessionEventEmitter,
  suppressEvents = false,
): { lastEventTick: number } {
  let lastEvent = ctx.lastEventTick

  for (let i = 0; i < world.tiles.length; i++) {
    const tile = world.tiles[i]
    if (tile.terrain === 'void' || !world.activeMask[i]) continue

    if (tile.disturbanceLevel > 0.4) {
      regressFromDisturbance(tile)
      continue
    }

    const biomass = ctx.tileBiomass[i] ?? 0
    const count = ctx.tileCounts[i] ?? 0
    const target = targetEcosystem(tile, biomass, count, ctx)

    if (target === tile.ecosystem) {
      tile.successionStability += 1
      continue
    }

    if (target === 'none' && tile.ecosystem !== 'none') {
      tile.successionStability = Math.max(0, tile.successionStability - 2)
      if (biomass < 0.1 && tile.successionStability <= 0) {
        applyEcosystem(tile, 'none')
      }
      continue
    }

    if (tile.ecosystem === 'none' || biomass > 0.2) {
      tile.successionStability += 1
    }

    const requiredStability =
      target === 'forest' || target === 'swamp' || target === 'marsh'
        ? STABILITY_TICKS_ADVANCE * 2
        : STABILITY_TICKS_ADVANCE

    if (tile.successionStability >= requiredStability || (tile.ecosystem === 'none' && biomass > 0.5)) {
      const prev = tile.ecosystem
      applyEcosystem(tile, target)
      tile.successionStability = 0

      if (!suppressEvents && ctx.tick - lastEvent >= EVENT_COOLDOWN_TICKS) {
        if (prev === 'none' && target !== 'none') {
          emit('ecology.succession_started', `Ecological succession began — ${target.replace(/_/g, ' ')} forming.`)
          lastEvent = ctx.tick
        } else if (target === 'forest' && prev !== 'forest') {
          emit('ecology.forest_emerged', `Forest ecosystem emerged from sustained plant biomass.`)
          lastEvent = ctx.tick
        } else if (target === 'grassland' && prev !== 'grassland') {
          emit('ecology.grassland_emerged', `Grassland ecosystem established from pioneer cover.`)
          lastEvent = ctx.tick
        } else if (target === 'swamp' && prev !== 'swamp') {
          emit('ecology.swamp_emerged', `Swamp ecosystem formed in stable wet lowlands.`)
          lastEvent = ctx.tick
        } else if (target === 'algae_bloom' && prev === 'none') {
          emit('ecology.algae_bloom', `Algae bloom colonized shallow aquatic zone.`)
          lastEvent = ctx.tick
        } else if (target !== 'none' && prev !== 'none' && target !== prev) {
          emit('ecology.biome_emerged', `Biological zone shifted to ${target.replace(/_/g, ' ')}.`)
          lastEvent = ctx.tick
        }
      }
    }
  }

  return { lastEventTick: lastEvent }
}

export function computeSuccessionSnapshot(world: World): SuccessionSnapshot {
  let active = 0
  let barren = 0
  let microbial = 0
  let algal = 0
  let pioneer = 0
  let grassland = 0
  let forest = 0
  let swampMarsh = 0
  let mature = 0

  for (let i = 0; i < world.tiles.length; i++) {
    const tile = world.tiles[i]
    if (tile.terrain === 'void' || !world.activeMask[i]) continue
    active++
    switch (tile.successionStage) {
      case 'none':
        barren++
        break
      case 'microbial':
        microbial++
        break
      case 'algal':
        algal++
        break
      case 'pioneer_plants':
        pioneer++
        break
      case 'grassland':
        grassland++
        break
      case 'forest':
        forest++
        break
      case 'swamp':
      case 'marsh':
        swampMarsh++
        break
      case 'mature':
        mature++
        break
    }
  }

  const pct = (n: number) => (active > 0 ? (n / active) * 100 : 0)
  return {
    barrenPercent: pct(barren),
    microbialPercent: pct(microbial),
    algalPercent: pct(algal),
    pioneerPercent: pct(pioneer),
    grasslandPercent: pct(grassland),
    forestPercent: pct(forest),
    swampMarshPercent: pct(swampMarsh),
    maturePercent: pct(mature),
  }
}

export function addTileDisturbance(world: World, tileIndex: number, amount: number): void {
  const tile = world.tiles[tileIndex]
  if (!tile) return
  tile.disturbanceLevel = Math.min(1, tile.disturbanceLevel + amount)
  if (tile.disturbanceLevel > 0.5 && tile.ecosystem !== 'none') {
    tile.successionStability = Math.max(0, tile.successionStability - 5)
  }
}
