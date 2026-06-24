import type { MainToWorkerMessage, WorkerToMainMessage } from './workerTypes'

export function postToWorker(worker: Worker, message: MainToWorkerMessage, transfer?: Transferable[]): void {
  if (transfer && transfer.length > 0) {
    worker.postMessage(message, transfer)
  } else {
    worker.postMessage(message)
  }
}

export function isWorkerMessage(data: unknown): data is WorkerToMainMessage {
  return typeof data === 'object' && data !== null && 'type' in data
}

export function workerErrorMessage(err: unknown): string {
  if (err instanceof Error) return err.message
  return String(err)
}
