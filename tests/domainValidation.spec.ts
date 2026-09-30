import { expect, test } from '@playwright/test'

test('repository rejects invalid domain values and preserves single active records', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { repository } = await import('/src/repositories/localRepository.ts')
    const { db } = await import('/src/db/myrideDb.ts')
    const bikeA = await repository.motorcycles.create({ manufacturer: 'Honda', model: 'CB350', nickname: 'Archived bike', currentOdometerKm: 100, active: true })
    const bikeB = await repository.motorcycles.create({ manufacturer: 'Honda', model: 'NX500', nickname: 'Current bike', currentOdometerKm: 200, active: true })
    const afterSecondBike = [await db.motorcycles.get(bikeA.id), await db.motorcycles.get(bikeB.id)].map((bike) => bike?.active)
    await repository.motorcycles.update(bikeA.id, { active: true })
    const afterReactivation = [await db.motorcycles.get(bikeA.id), await db.motorcycles.get(bikeB.id)].map((bike) => bike?.active)

    const tripA = await repository.trips.create({ title: 'Historical trip', motorcycleId: bikeA.id, startDate: '2026-01-01T08:00:00.000Z', origin: { label: 'Start' }, destination: { label: 'Finish' }, status: 'Active' })
    const tripB = await repository.trips.create({ title: 'Planned trip', motorcycleId: bikeA.id, startDate: '2026-01-02T08:00:00.000Z', origin: { label: 'Start' }, destination: { label: 'Finish' }, status: 'Planned' })
    const fuel = await repository.fuelLogs.create({ motorcycleId: bikeA.id, tripId: tripA.id, dateTime: '2026-01-01T09:00:00.000Z', odometerKm: 110, litres: 5, fullTank: true })
    const settings = await repository.settings.get()
    const queueBefore = await db.syncQueue.count()
    const failures: string[] = []
    async function reject(operation: () => Promise<unknown>) {
      try { await operation(); failures.push('accepted') }
      catch (error) { failures.push(error instanceof Error ? error.message : String(error)) }
    }

    await reject(() => repository.trips.update(tripB.id, { status: 'Active' }))
    await reject(() => repository.motorcycles.create({ manufacturer: 'Honda', model: 'Bad odometer', currentOdometerKm: -1, active: false }))
    await reject(() => repository.trips.create({ title: 'Missing end', motorcycleId: bikeA.id, startDate: '2026-01-03T08:00:00.000Z', origin: { label: 'Start' }, destination: { label: 'Finish' }, status: 'Completed' }))
    await reject(() => repository.gpsPoints.create({ tripId: tripA.id, latitude: 91, longitude: 10, timestamp: '2026-01-01T09:00:00.000Z' }))
    await reject(() => repository.fuelLogs.create({ motorcycleId: bikeA.id, tripId: tripA.id, dateTime: '2026-01-01T10:00:00.000Z', odometerKm: 120, litres: 0, fullTank: true }))
    await reject(() => repository.expenses.create({ tripId: tripA.id, motorcycleId: bikeA.id, amount: -10, currency: 'INR', date: '2026-01-01T10:00:00.000Z', category: 'food', paymentMethod: 'Cash' }))
    await reject(() => repository.maintenance.create({ motorcycleId: bikeA.id, date: '2026-01-01T10:00:00.000Z', odometerKm: 100, serviceType: 'Routine', component: 'Engine oil', cost: -1 }))
    await reject(() => repository.weather.create({ tripId: tripA.id, timestamp: '2026-01-01T10:00:00.000Z', latitude: 10, longitude: 10, humidityPercent: 101 }))
    await reject(() => repository.emergencyContacts.create({ name: 'Contact', phone: '   ' }))
    await reject(() => repository.settings.save(settings.id, { safeRangeReservePercent: 80 }))
    await reject(() => repository.photos.create({ tripId: tripA.id, takenAt: '2026-01-01T10:00:00.000Z', locationSource: 'manual' }))
    await reject(() => repository.readinessChecks.set({ tripId: tripA.id, motorcycleId: bikeA.id }, '   ', true))
    await reject(() => repository.fuelLogs.update(fuel.id, { litres: 0 }))

    return {
      failures,
      queueStable: await db.syncQueue.count() === queueBefore,
      afterSecondBike,
      afterReactivation,
      activeTrips: (await repository.trips.all()).filter((trip) => trip.status === 'Active').map((trip) => trip.id),
      fuelLitres: (await db.fuelLogs.get(fuel.id))?.litres,
      invalidCounts: {
        gps: await db.gpsPoints.count(), expenses: await db.expenseLogs.count(), maintenance: await db.maintenanceLogs.count(),
        weather: await db.weatherSnapshots.count(), contacts: await db.emergencyContacts.count(), photos: await db.photos.count(), readiness: await db.readinessChecks.count(), settings: await db.settings.count(),
      },
      bikeAId: bikeA.id,
      tripAId: tripA.id,
    }
  })

  expect(result.failures).toHaveLength(13)
  expect(result.failures).not.toContain('accepted')
  expect(result.queueStable).toBe(true)
  expect(result.afterSecondBike).toEqual([false, true])
  expect(result.afterReactivation).toEqual([true, false])
  expect(result.activeTrips).toEqual([result.tripAId])
  expect(result.fuelLitres).toBe(5)
  expect(result.invalidCounts).toEqual({ gps: 0, expenses: 0, maintenance: 0, weather: 0, contacts: 0, photos: 0, readiness: 0, settings: 0 })

  await page.evaluate(async (bikeId) => {
    const { repository } = await import('/src/repositories/localRepository.ts')
    await repository.motorcycles.remove(bikeId)
  }, result.bikeAId)
  await page.goto('/trips')
  await expect(page.getByLabel('Motorcycle').locator('option', { hasText: 'Archived bike (archived)' })).toHaveCount(1)
  await page.getByLabel('Motorcycle').selectOption(result.bikeAId)
  await expect(page.getByRole('heading', { name: 'Historical trip' })).toBeVisible()
})

test('archive import rejects invalid values and duplicate active records atomically', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { importArchive } = await import('/src/services/backup.ts')
    const { db } = await import('/src/db/myrideDb.ts')
    const timestamp = new Date().toISOString()
    const base = () => ({ id: crypto.randomUUID(), userId: 'local-rider', createdAt: timestamp, updatedAt: timestamp, syncStatus: 'pending' as const })
    const empty = () => ({
      profiles: [], settings: [], trips: [], plannedStops: [], gpsPoints: [], fuelLogs: [], expenseLogs: [], rideEvents: [],
      maintenanceLogs: [], weatherSnapshots: [], photos: [], emergencyContacts: [], readinessChecks: [],
    })
    async function attempt(motorcycles: Array<Record<string, unknown>>) {
      const records = { ...empty(), motorcycles }
      try {
        await importArchive(new File([JSON.stringify({ format: 'myride-archive', version: 1, exportedAt: timestamp, records })], 'invalid.json', { type: 'application/json' }))
        return 'accepted'
      } catch (error) {
        return error instanceof Error ? error.message : String(error)
      }
    }
    const duplicateActive = await attempt([
      { ...base(), manufacturer: 'Honda', model: 'A', currentOdometerKm: 0, active: true },
      { ...base(), manufacturer: 'Honda', model: 'B', currentOdometerKm: 0, active: true },
    ])
    const invalidValue = await attempt([{ ...base(), manufacturer: 'Honda', model: 'A', currentOdometerKm: -1, active: true }])
    const invalidOptionalText = await attempt([{ ...base(), manufacturer: 'Honda', model: 'A', currentOdometerKm: 0, active: true, notes: { unsafe: true } }])
    return { duplicateActive, invalidValue, invalidOptionalText, motorcycles: await db.motorcycles.count(), queue: await db.syncQueue.count() }
  })

  expect(result.duplicateActive).toBe('Backup invariant error: more than one motorcycle is active.')
  expect(result.invalidValue).toBe('Invalid motorcycles record: currentOdometerKm must be at least 0.')
  expect(result.invalidOptionalText).toBe('Invalid motorcycles record: notes must be text.')
  expect(result).toMatchObject({ motorcycles: 0, queue: 0 })
})

test('pages do not silently substitute the first motorcycle when none is active', async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async () => {
    const { repository } = await import('/src/repositories/localRepository.ts')
    await repository.motorcycles.create({ manufacturer: 'Honda', model: 'CB350', nickname: 'Inactive bike', currentOdometerKm: 100, active: false })
  })
  await page.reload()
  await expect(page.getByText('NO ACTIVE MOTORCYCLE')).toBeVisible()
  await page.goto('/fuel')
  await expect(page.getByLabel('Motorcycle')).toHaveValue('')
  await expect(page.getByRole('option', { name: 'Select a motorcycle' })).toHaveCount(1)
})
