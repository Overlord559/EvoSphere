import type { SpeciesRecord } from '../../types/life'

export type MortalityCause =
  | 'starvation'
  | 'disaster'
  | 'succession_regression'
  | 'herbivory_overgrazing'
  | 'predation'
  | 'crowding'
  | 'habitat_unsuitable'
  | 'representation_merge'
  | 'converted_to_cohort'
  | 'quarantine'
  | 'unknown'

export interface ExtinctionForensics {
  lastCauseOfDecline: string | null
  lastMajorMortalityCause: MortalityCause | null
  populationChangeReason: string | null
  extinctionCause: string | null
  hiddenAsAggregate: boolean
  convertedToCohort: boolean
  refugiaRemaining: number
  recoveryPossible: boolean
}

export const DEFAULT_FORENSICS: ExtinctionForensics = {
  lastCauseOfDecline: null,
  lastMajorMortalityCause: null,
  populationChangeReason: null,
  extinctionCause: null,
  hiddenAsAggregate: false,
  convertedToCohort: false,
  refugiaRemaining: 0,
  recoveryPossible: false,
}

export function applyForensicsToRecord(
  record: SpeciesRecord,
  patch: Partial<ExtinctionForensics>,
): void {
  if (patch.lastCauseOfDecline !== undefined) record.lastCauseOfDecline = patch.lastCauseOfDecline
  if (patch.lastMajorMortalityCause !== undefined) {
    record.lastMajorMortalityCause = patch.lastMajorMortalityCause
  }
  if (patch.populationChangeReason !== undefined) {
    record.populationChangeReason = patch.populationChangeReason
  }
  if (patch.extinctionCause !== undefined) record.extinctionCause = patch.extinctionCause
  if (patch.hiddenAsAggregate !== undefined) record.hiddenAsAggregate = patch.hiddenAsAggregate
  if (patch.convertedToCohort !== undefined) record.convertedToCohort = patch.convertedToCohort
  if (patch.refugiaRemaining !== undefined) record.refugiaRemaining = patch.refugiaRemaining
  if (patch.recoveryPossible !== undefined) record.recoveryPossible = patch.recoveryPossible
}

export function recordPopulationDecline(
  record: SpeciesRecord,
  cause: MortalityCause,
  message: string,
  options: {
    hiddenAsAggregate?: boolean
    convertedToCohort?: boolean
    refugiaRemaining?: number
    recoveryPossible?: boolean
  } = {},
): void {
  applyForensicsToRecord(record, {
    lastCauseOfDecline: message,
    lastMajorMortalityCause: cause,
    populationChangeReason: message,
    hiddenAsAggregate: options.hiddenAsAggregate ?? false,
    convertedToCohort: options.convertedToCohort ?? false,
    refugiaRemaining: options.refugiaRemaining ?? record.refugiaRemaining ?? 0,
    recoveryPossible: options.recoveryPossible ?? record.recoveryPossible ?? false,
  })
}

export function recordAggregateCompression(
  record: SpeciesRecord,
  aggregateCount: number,
  trackedCount: number,
): void {
  if (aggregateCount <= 0 || trackedCount > 0) return
  applyForensicsToRecord(record, {
    lastCauseOfDecline: 'Population compressed into aggregate cohorts — not extinct',
    lastMajorMortalityCause: 'converted_to_cohort',
    populationChangeReason: `Tracked individuals (${trackedCount}) moved to cohort representation (~${aggregateCount} est. individuals remain)`,
    hiddenAsAggregate: true,
    convertedToCohort: true,
    recoveryPossible: aggregateCount > 0,
    refugiaRemaining: Math.max(record.refugiaRemaining ?? 0, aggregateCount > 0 ? 1 : 0),
  })
}

export function recordExtinction(record: SpeciesRecord, cause: string): void {
  applyForensicsToRecord(record, {
    extinctionCause: cause,
    lastCauseOfDecline: cause,
    populationChangeReason: cause,
    recoveryPossible: false,
    hiddenAsAggregate: false,
  })
}

export function formatForensicsSummary(record: SpeciesRecord): string | null {
  if (record.hiddenAsAggregate && record.population > 0) {
    return `Population hidden as aggregate cohort — ~${record.population} est. individuals remain (not extinct).`
  }
  if (record.convertedToCohort && record.population > 0) {
    return record.populationChangeReason ?? 'Life continues in aggregate cohorts; visible glyphs are sampled.'
  }
  if (record.population === 0 && record.extinctionCause) {
    return record.extinctionCause
  }
  if (record.lastCauseOfDecline && record.populationTrend === 'declining') {
    return record.lastCauseOfDecline
  }
  return null
}
