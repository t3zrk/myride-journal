import { expect, test } from '@playwright/test'
import { estimateServiceHealth, latestGeneralService } from '../src/services/maintenance'
import type { MaintenanceLog } from '../src/types/myride'

test('minor component work does not reset the general service estimate', () => {
  const logs = [
    { id: 'oil', component: 'Engine oil', serviceType: 'Oil change', odometerKm: 10000 },
    { id: 'chain', component: 'Chain', serviceType: 'Lubrication', odometerKm: 14900 },
  ] as MaintenanceLog[]
  expect(latestGeneralService(logs)?.id).toBe('oil')
  expect(estimateServiceHealth(14900, 5000, 10000)).toBe('DUE SOON')
  expect(estimateServiceHealth(15000, 5000, 10000)).toBe('DUE')
  expect(estimateServiceHealth(16300, 5000, 10000)).toBe('OVERDUE')
  expect(estimateServiceHealth(12000, 5000, 10000)).toBe('GOOD')
  expect(estimateServiceHealth(12000, 5000)).toBe('UNKNOWN')
})
