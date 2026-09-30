import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'

const pages = [
  ['/', 'MyRide'],
  ['/trips', 'Journey Archive'],
  ['/trips/new', 'Record a New Journey'],
  ['/garage', 'Motorcycle Dossier'],
  ['/fuel', 'Fuel Journal'],
  ['/expenses', 'Riding Costs'],
  ['/profile', 'Rider Profile'],
  ['/settings', 'Application Settings'],
  ['/achievements', 'Rider Achievements & Milestones'],
] as const

test('primary pages have no automated accessibility violations on desktop or mobile', async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport)
    for (const [path, heading] of pages) {
      await page.goto(path)
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible()
      const results = await new AxeBuilder({ page }).analyze()
      const violations = results.violations.map((violation) => ({
        rule: violation.id,
        impact: violation.impact,
        targets: violation.nodes.map((node) => node.target.join(' ')),
      }))
      expect(violations, `${path} at ${viewport.width}px`).toEqual([])
    }
  }
})

test('populated trip, motorcycle, and replay views have no automated accessibility violations', async ({ page }) => {
  await page.goto('/')
  const ids = await page.evaluate(async () => {
    const { repository } = await import('/src/repositories/localRepository.ts')
    const bike = await repository.motorcycles.create({ manufacturer: 'Honda', model: 'CB350', nickname: 'Accessible bike', currentOdometerKm: 1000, serviceIntervalKm: 5000, active: true })
    const trip = await repository.trips.create({ title: 'Accessible journey', motorcycleId: bike.id, startDate: '2026-01-01T08:00:00.000Z', endDate: '2026-01-01T10:00:00.000Z', origin: { label: 'Start', latitude: 13.08, longitude: 80.27 }, destination: { label: 'Finish', latitude: 13.18, longitude: 80.37 }, status: 'Completed', distanceKm: 20, durationMinutes: 120 })
    await repository.plannedStops.create({ tripId: trip.id, label: 'Tea stop', latitude: 13.12, longitude: 80.31 })
    await repository.gpsPoints.create({ tripId: trip.id, latitude: 13.08, longitude: 80.27, altitude: 10, timestamp: '2026-01-01T08:00:00.000Z' })
    await repository.gpsPoints.create({ tripId: trip.id, latitude: 13.18, longitude: 80.37, altitude: 35, timestamp: '2026-01-01T10:00:00.000Z' })
    await repository.rideEvents.create({ tripId: trip.id, type: 'checkpoint', title: 'Reached the stop', timestamp: '2026-01-01T09:00:00.000Z', latitude: 13.12, longitude: 80.31 })
    await repository.fuelLogs.create({ motorcycleId: bike.id, tripId: trip.id, dateTime: '2026-01-01T08:00:00.000Z', odometerKm: 1000, litres: 5, fullTank: true })
    await repository.expenses.create({ tripId: trip.id, motorcycleId: bike.id, amount: 250, currency: 'INR', date: '2026-01-01T09:00:00.000Z', category: 'food', paymentMethod: 'UPI' })
    await repository.maintenance.create({ motorcycleId: bike.id, date: '2025-12-01T00:00:00.000Z', odometerKm: 900, serviceType: 'Routine', component: 'Engine oil' })
    await repository.weather.create({ tripId: trip.id, timestamp: '2026-01-01T09:00:00.000Z', latitude: 13.12, longitude: 80.31, temperatureC: 29, windKph: 8, summary: 'Clear' })
    return { bikeId: bike.id, tripId: trip.id }
  })

  const detailPaths = ['overview', 'journal', 'gps', 'fuel', 'expenses', 'media', 'weather', 'readiness'].map((tab) => `/trips/${ids.tripId}?tab=${tab}`)
  for (const path of [...detailPaths, `/garage/${ids.bikeId}`, `/trips/${ids.tripId}/replay`]) {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto(path)
    await expect(page.getByRole('heading', { name: path.includes('/garage/') ? 'Accessible bike' : 'Accessible journey', exact: true })).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.map((violation) => ({ rule: violation.id, targets: violation.nodes.map((node) => node.target.join(' ')) })), path).toEqual([])
  }

  await page.goto('/expenses')
  await expect(page.getByRole('heading', { name: 'Riding Costs', exact: true })).toBeVisible()
  await expect(page.getByRole('img', { name: /Expense category breakdown: food, INR 250/ })).toBeVisible()
  const expenseResults = await new AxeBuilder({ page }).analyze()
  expect(expenseResults.violations.map((violation) => ({ rule: violation.id, targets: violation.nodes.map((node) => node.target.join(' ')) })), '/expenses populated').toEqual([])

  await page.setViewportSize({ width: 390, height: 844 })
  for (const path of [`/trips/${ids.tripId}`, `/garage/${ids.bikeId}`, `/trips/${ids.tripId}/replay`]) {
    await page.goto(path)
    await expect(page.getByRole('heading', { name: path.includes('/garage/') ? 'Accessible bike' : 'Accessible journey', exact: true })).toBeVisible()
    const results = await new AxeBuilder({ page }).analyze()
    expect(results.violations.map((violation) => ({ rule: violation.id, targets: violation.nodes.map((node) => node.target.join(' ')) })), `${path} at 390px`).toEqual([])
  }
})
