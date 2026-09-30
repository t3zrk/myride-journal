import { expect, test } from '@playwright/test'

test('dashboard separates active-bike mileage from lifetime verified mileage and uses recorded odometers', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { repository } = await import('/src/repositories/localRepository.ts')
    const bikeA = await repository.motorcycles.create({ manufacturer: 'Honda', model: 'CB350', nickname: 'Active bike', currentOdometerKm: 50, serviceIntervalKm: 1000, active: true })
    const bikeB = await repository.motorcycles.create({ manufacturer: 'Honda', model: 'NX500', nickname: 'Touring bike', currentOdometerKm: 0, active: false })
    const addFuel = (motorcycleId: string, odometerKm: number, dateTime: string) => repository.fuelLogs.create({ motorcycleId, odometerKm, dateTime, litres: 10, fullTank: true })
    await addFuel(bikeA.id, 0, '2026-01-01T00:00:00.000Z')
    await addFuel(bikeA.id, 100, '2026-01-02T00:00:00.000Z')
    await addFuel(bikeB.id, 0, '2026-01-01T00:00:00.000Z')
    await addFuel(bikeB.id, 300, '2026-01-02T00:00:00.000Z')
    await repository.maintenance.create({ motorcycleId: bikeA.id, date: '2026-01-03T00:00:00.000Z', odometerKm: 500, serviceType: 'General service', component: 'Engine oil' })
  })
  await page.reload()

  await expect(page.getByText('Recent mileage').locator('..').locator('dd > span').first()).toHaveText('10.0 km/L')
  await expect(page.getByText('Lifetime mileage').locator('..').locator('dd > span').first()).toHaveText('20.0 km/L')
  await expect(page.getByText('Odometer', { exact: true }).locator('..').locator('dd > span').first()).toHaveText('500 km')
})
