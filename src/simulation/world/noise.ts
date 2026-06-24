import type { Rng } from '../../utils/rng'
import { randomFloat } from '../../utils/rng'

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function smoothstep(t: number): number {
  return t * t * (3 - 2 * t)
}

/** Build a coarse lattice of deterministic random values. */
export function buildNoiseLattice(
  rng: Rng,
  latticeWidth: number,
  latticeHeight: number,
): number[][] {
  const lattice: number[][] = []
  for (let y = 0; y < latticeHeight; y++) {
    lattice[y] = []
    for (let x = 0; x < latticeWidth; x++) {
      lattice[y][x] = rng()
    }
  }
  return lattice
}

/** Bilinear sample from a noise lattice across world dimensions. */
export function sampleLattice(
  lattice: number[][],
  x: number,
  y: number,
  worldWidth: number,
  worldHeight: number,
): number {
  const lw = lattice[0].length
  const lh = lattice.length
  const fx = (x / Math.max(worldWidth - 1, 1)) * (lw - 1)
  const fy = (y / Math.max(worldHeight - 1, 1)) * (lh - 1)

  const x0 = Math.floor(fx)
  const y0 = Math.floor(fy)
  const x1 = Math.min(x0 + 1, lw - 1)
  const y1 = Math.min(y0 + 1, lh - 1)
  const tx = smoothstep(fx - x0)
  const ty = smoothstep(fy - y0)

  const v00 = lattice[y0][x0]
  const v10 = lattice[y0][x1]
  const v01 = lattice[y1][x0]
  const v11 = lattice[y1][x1]

  return lerp(lerp(v00, v10, tx), lerp(v01, v11, tx), ty)
}

/** Fractal combination of multiple lattice scales. */
export function fractalNoise(
  lattices: number[][][],
  x: number,
  y: number,
  worldWidth: number,
  worldHeight: number,
): number {
  let value = 0
  let weight = 0
  for (let i = 0; i < lattices.length; i++) {
    const amplitude = 0.5 ** i
    value += sampleLattice(lattices[i], x, y, worldWidth, worldHeight) * amplitude
    weight += amplitude
  }
  return value / weight
}

/** Jittered offset for secondary detail layers. */
export function jitteredNoise(
  rng: Rng,
  base: number,
  strength: number,
): number {
  return Math.max(0, Math.min(1, base + randomFloat(rng, -strength, strength)))
}
