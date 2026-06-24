/** Lightweight fixed-size adaptive controller — no external ML. */

export const CONTROLLER_INPUT_COUNT = 12
export const CONTROLLER_OUTPUT_COUNT = 8

export type ControllerInputIndex =
  | 0 // hunger
  | 1 // energy
  | 2 // health
  | 3 // local food density
  | 4 // predator density
  | 5 // prey density
  | 6 // temperature stress
  | 7 // water stress
  | 8 // crowding
  | 9 // recent success
  | 10 // recent failure
  | 11 // disaster/stress

export type ControllerOutputIndex =
  | 0 // seekFood
  | 1 // flee
  | 2 // hunt
  | 3 // rest
  | 4 // explore
  | 5 // migrate
  | 6 // reproduce
  | 7 // avoidHazard

export interface NeuralController {
  /** Flat weight matrix: output[i] = sum_j weights[i * INPUT + j] * input[j] + bias[i] */
  weights: Float32Array
  biases: Float32Array
  /** Learned bias accumulated during life — partially inherited. */
  learnedBias: Float32Array
}

const WEIGHT_SIZE = CONTROLLER_OUTPUT_COUNT * CONTROLLER_INPUT_COUNT

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0.5
  return Math.max(0, Math.min(1, v))
}

export function createRandomController(rng: () => number, scale = 0.35): NeuralController {
  const weights = new Float32Array(WEIGHT_SIZE)
  const biases = new Float32Array(CONTROLLER_OUTPUT_COUNT)
  const learnedBias = new Float32Array(CONTROLLER_OUTPUT_COUNT)
  for (let i = 0; i < WEIGHT_SIZE; i++) {
    weights[i] = (rng() - 0.5) * scale
  }
  for (let i = 0; i < CONTROLLER_OUTPUT_COUNT; i++) {
    biases[i] = (rng() - 0.5) * scale * 0.5
    learnedBias[i] = 0
  }
  return { weights, biases, learnedBias }
}

export function cloneController(parent: NeuralController): NeuralController {
  return {
    weights: new Float32Array(parent.weights),
    biases: new Float32Array(parent.biases),
    learnedBias: new Float32Array(parent.learnedBias),
  }
}

export function mutateController(parent: NeuralController, rng: () => number, rate: number): NeuralController {
  const child = cloneController(parent)
  if (rng() > rate) return child
  const mutations = 1 + Math.floor(rng() * 3)
  for (let m = 0; m < mutations; m++) {
    const idx = Math.floor(rng() * WEIGHT_SIZE)
    child.weights[idx] += (rng() - 0.5) * 0.12
  }
  if (rng() > 0.5) {
    const b = Math.floor(rng() * CONTROLLER_OUTPUT_COUNT)
    child.biases[b] += (rng() - 0.5) * 0.08
  }
  sanitizeController(child)
  return child
}

export function sanitizeController(c: NeuralController): void {
  for (let i = 0; i < c.weights.length; i++) {
    if (!Number.isFinite(c.weights[i])) c.weights[i] = 0
    c.weights[i] = Math.max(-2, Math.min(2, c.weights[i]))
  }
  for (let i = 0; i < c.biases.length; i++) {
    if (!Number.isFinite(c.biases[i])) c.biases[i] = 0
    c.biases[i] = Math.max(-1, Math.min(1, c.biases[i]))
  }
  for (let i = 0; i < c.learnedBias.length; i++) {
    if (!Number.isFinite(c.learnedBias[i])) c.learnedBias[i] = 0
    c.learnedBias[i] = Math.max(-0.5, Math.min(0.5, c.learnedBias[i]))
  }
}

export function controllerForward(
  controller: NeuralController,
  inputs: Float32Array,
): Float32Array {
  const outputs = new Float32Array(CONTROLLER_OUTPUT_COUNT)
  for (let o = 0; o < CONTROLLER_OUTPUT_COUNT; o++) {
    let sum = controller.biases[o] + controller.learnedBias[o]
    for (let j = 0; j < CONTROLLER_INPUT_COUNT; j++) {
      sum += controller.weights[o * CONTROLLER_INPUT_COUNT + j] * (inputs[j] ?? 0)
    }
    outputs[o] = clamp01(1 / (1 + Math.exp(-sum * 3)))
  }
  return outputs
}

export function dominantOutput(outputs: Float32Array): { index: number; value: number } {
  let best = 0
  let bestVal = outputs[0] ?? 0
  for (let i = 1; i < outputs.length; i++) {
    if ((outputs[i] ?? 0) > bestVal) {
      bestVal = outputs[i] ?? 0
      best = i
    }
  }
  return { index: best, value: bestVal }
}

export const OUTPUT_LABELS = [
  'Seek food',
  'Flee',
  'Hunt',
  'Rest',
  'Explore',
  'Migrate',
  'Reproduce',
  'Avoid hazard',
] as const
