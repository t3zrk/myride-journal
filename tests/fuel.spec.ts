import { expect, test } from '@playwright/test'
import { calculateMileageIntervals, fuelAnalytics } from '../src/services/fuel/calculations'
import type { FuelLog } from '../src/types/myride'

function fill(id: string, bike: string, odometerKm: number, litres: number, fullTank: boolean): FuelLog {
  return { id, userId: 'test', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z', syncStatus: 'pending', motorcycleId: bike, dateTime: `2026-01-${id.padStart(2, '0')}T00:00:00Z`, odometerKm, litres, fullTank }
}

test('full tank calculation and motorcycle isolation', () => {
  const logs = [fill('1', 'bike-a', 10000, 10, true), fill('2', 'bike-b', 4000, 8, true), fill('3', 'bike-a', 10320, 10.2, true), fill('4', 'bike-b', 4200, 10, true)]
  const intervals = calculateMileageIntervals(logs)
  expect(intervals).toHaveLength(2)
  expect(intervals.find((item) => item.motorcycleId === 'bike-a')?.mileageKmPerLitre).toBeCloseTo(31.3725, 3)
  expect(intervals.find((item) => item.motorcycleId === 'bike-b')?.mileageKmPerLitre).toBe(20)
})

test('partial fills wait for a closing full tank', () => {
  const start = fill('1', 'bike-a', 10000, 10, true)
  const partial = fill('2', 'bike-a', 10100, 4, false)
  expect(calculateMileageIntervals([start, partial])).toHaveLength(0)
  const closing = fill('3', 'bike-a', 10320, 6.2, true)
  const analytics = fuelAnalytics([start, partial, closing])
  expect(analytics.verifiedIntervals).toBe(1)
  expect(analytics.averageMileage).toBeCloseTo(320 / 10.2, 5)
  expect(fuelAnalytics([start, partial]).averageMileage).toBeUndefined()
})
