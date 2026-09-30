import { expect, test } from '@playwright/test'
import { deriveMilestones } from '../src/services/achievements'
import type { BaseRecord, FuelLog, GpsPoint, MaintenanceLog, Trip, WeatherSnapshot } from '../src/types/myride'

const at = '2026-01-01T00:00:00.000Z'
let sequence = 0
function base(): BaseRecord {
  sequence += 1
  return { id: `00000000-0000-4000-8000-${sequence.toString().padStart(12, '0')}`, userId: 'local-rider', createdAt: at, updatedAt: at, syncStatus: 'synced' }
}

test('milestones are derived only from authoritative completed records', () => {
  const local = (day: number, hour: number) => new Date(2026, 0, day, hour).toISOString()
  const motorcycleId = base().id
  const dawnTrip: Trip = { ...base(), title: 'Dawn endurance', motorcycleId, startDate: local(2, 5), endDate: local(2, 15), origin: { label: 'A' }, destination: { label: 'B' }, status: 'Completed', distanceKm: 1200, durationMinutes: 600 }
  const nightTrip: Trip = { ...base(), title: 'Night journal', motorcycleId, startDate: local(3, 22), endDate: local(3, 23), origin: { label: 'B' }, destination: { label: 'C' }, status: 'Completed', distanceKm: 50, durationMinutes: 60 }
  const planned: Trip = { ...base(), title: 'Unridden plan', motorcycleId, startDate: '2026-01-04T08:00:00.000Z', origin: { label: 'C' }, destination: { label: 'D' }, status: 'Planned', distanceKm: 9000 }
  const fills: FuelLog[] = [
    { ...base(), motorcycleId, dateTime: local(2, 5), odometerKm: 1000, litres: 10, fullTank: true },
    { ...base(), motorcycleId, dateTime: local(2, 15), odometerKm: 1320, litres: 10, fullTank: true },
  ]
  const weather: WeatherSnapshot[] = [{ ...base(), tripId: dawnTrip.id, timestamp: '2026-01-02T10:00:00.000Z', latitude: 10, longitude: 10, weatherCode: 63, precipitationMm: 3 }]
  const gpsPoints: GpsPoint[] = [{ ...base(), tripId: dawnTrip.id, timestamp: '2026-01-02T10:00:00.000Z', latitude: 10, longitude: 10, altitude: 2800 }]
  const maintenance: MaintenanceLog[] = [{ ...base(), motorcycleId, date: '2026-01-01T00:00:00.000Z', odometerKm: 900, serviceType: 'Routine', component: 'Engine oil' }]

  const milestones = deriveMilestones({ trips: [planned, nightTrip, dawnTrip], fuelLogs: fills, weather, maintenance, gpsPoints })
  const labels = milestones.map((item) => item.label)
  expect(labels).toEqual(expect.arrayContaining([
    'First completed trip', '1,000 km lifetime', '500 km day', 'Longest trip', 'Dawn ride', 'Night ride',
    'Rain recorded', 'Highest recorded elevation', 'High altitude ride', 'Verified mileage', 'First recorded service',
  ]))
  expect(labels).not.toContain('5,000 km lifetime')
  expect(milestones.find((item) => item.label === 'First completed trip')?.detail).toBe('Dawn endurance')
})

test('dashboard recent activity includes proven milestones', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { repository } = await import('/src/repositories/localRepository.ts')
    await repository.trips.create({ title: 'Completed journal', startDate: '2026-02-01T08:00:00.000Z', endDate: '2026-02-01T09:00:00.000Z', origin: { label: 'A' }, destination: { label: 'B' }, status: 'Completed', distanceKm: 40, durationMinutes: 60 })
  })
  await page.reload()
  const activity = page.getByRole('heading', { name: 'Recent Activity' }).locator('..').locator('..')
  await expect(activity.getByRole('link', { name: /First completed trip/ })).toHaveAttribute('href', '/achievements')
})
