import type { SensorType } from './bodyPlan'

export interface SensoryProfile {
  visualRange: number
  smellRange: number
  vibrationRange: number
  heatSensitivity: number
  waterSensitivity: number
  pressureSensitivity: number
  primarySensor: SensorType
}

export function sensesSummary(senses: SensoryProfile): string {
  const parts: string[] = []
  if (senses.visualRange >= 2) parts.push(`vision ${senses.visualRange.toFixed(1)}`)
  if (senses.smellRange >= 1.5) parts.push(`smell ${senses.smellRange.toFixed(1)}`)
  if (senses.vibrationRange >= 1.5) parts.push(`vibration ${senses.vibrationRange.toFixed(1)}`)
  if (senses.heatSensitivity >= 0.5) parts.push('heat')
  if (senses.waterSensitivity >= 0.5) parts.push('water')
  if (parts.length === 0) parts.push(`${senses.primarySensor} (weak)`)
  return parts.join(' · ')
}

export interface SensoryInputSummary {
  nearestPreyDistance: number | null
  nearestFoodBiomass: number
  predatorPressure: number
  habitatQuality: number
  ventProximity: boolean
}
