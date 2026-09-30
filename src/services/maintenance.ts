import type { ComponentHealth, MaintenanceLog } from '../types/myride'

export const trackedComponents = ['Engine oil', 'Chain', 'Tyres', 'Brake pads', 'Battery', 'Air filter'] as const

export function latestGeneralService(logs: MaintenanceLog[]) {
  return logs
    .filter((log) => /\bservice\b/i.test(log.serviceType) || /\bengine oil\b/i.test(log.component))
    .sort((a, b) => b.odometerKm - a.odometerKm)[0]
}

export function estimateServiceHealth(currentOdometerKm: number, intervalKm?: number, lastServiceOdometerKm?: number): ComponentHealth {
  if (!intervalKm || lastServiceOdometerKm === undefined) return 'UNKNOWN'
  const used = Math.max(0, currentOdometerKm - lastServiceOdometerKm)
  if (used >= intervalKm * 1.25) return 'OVERDUE'
  if (used >= intervalKm) return 'DUE'
  if (used >= intervalKm * 0.8) return 'DUE SOON'
  return 'GOOD'
}
