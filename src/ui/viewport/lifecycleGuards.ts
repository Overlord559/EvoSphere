/** Singleton guards for browser render/sim lifecycle — detect duplicate loops/workers. */

let viewportRafActive = false
let runtimeRafActive = false
let workerInstanceCount = 0
let workerBootstrapCount = 0

export function registerViewportRaf(): boolean {
  if (viewportRafActive) return false
  viewportRafActive = true
  return true
}

export function unregisterViewportRaf(): void {
  viewportRafActive = false
}

export function registerRuntimeRaf(): boolean {
  if (runtimeRafActive) return false
  runtimeRafActive = true
  return true
}

export function unregisterRuntimeRaf(): void {
  runtimeRafActive = false
}

export function countActiveRafLoops(): number {
  let n = 0
  if (viewportRafActive) n += 1
  if (runtimeRafActive) n += 1
  return n
}

export function registerWorkerInstance(): number {
  workerInstanceCount += 1
  workerBootstrapCount += 1
  return workerInstanceCount
}

export function unregisterWorkerInstance(): void {
  workerInstanceCount = Math.max(0, workerInstanceCount - 1)
}

export function getWorkerInstanceCount(): number {
  return workerInstanceCount
}

export function getWorkerBootstrapCount(): number {
  return workerBootstrapCount
}

export function resetLifecycleGuards(): void {
  viewportRafActive = false
  runtimeRafActive = false
}
