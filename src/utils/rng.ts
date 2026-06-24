import seedrandom from 'seedrandom'

export type Rng = seedrandom.PRNG

export function createRng(seed: string): Rng {
  return seedrandom(seed)
}

export function randomFloat(rng: Rng, min = 0, max = 1): number {
  return min + rng() * (max - min)
}

export function randomInt(rng: Rng, min: number, max: number): number {
  return Math.floor(randomFloat(rng, min, max + 1))
}

export function forkRng(seed: string, label: string): Rng {
  return seedrandom(`${seed}:${label}`)
}
