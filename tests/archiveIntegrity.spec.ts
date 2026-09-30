import { expect, test } from '@playwright/test'

test('archive import rejects orphaned records without partial writes', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { importArchive } = await import('/src/services/backup.ts')
    const { db } = await import('/src/db/myrideDb.ts')
    const timestamp = new Date().toISOString()
    const record = () => ({ id: crypto.randomUUID(), userId: 'local-rider', createdAt: timestamp, updatedAt: timestamp, syncStatus: 'pending' as const })
    const records = {
      profiles: [], settings: [], motorcycles: [{ ...record(), manufacturer: 'Honda', model: 'CB350', currentOdometerKm: 0, active: true }], trips: [],
      plannedStops: [{ ...record(), tripId: crypto.randomUUID(), label: 'Nowhere' }], gpsPoints: [], fuelLogs: [], expenseLogs: [], rideEvents: [],
      maintenanceLogs: [], weatherSnapshots: [], photos: [], emergencyContacts: [], readinessChecks: [],
    }
    let message = ''
    try {
      await importArchive(new File([JSON.stringify({ format: 'myride-archive', version: 1, exportedAt: timestamp, records })], 'orphan.json', { type: 'application/json' }))
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    return { message, motorcycles: await db.motorcycles.count(), stops: await db.plannedStops.count(), queue: await db.syncQueue.count() }
  })

  expect(result.message).toMatch(/^Backup relationship error in plannedStops record .+: trip .+ does not exist\.$/)
  expect(result).toMatchObject({ motorcycles: 0, stops: 0, queue: 0 })
})

test('archive validation checks relationships after newer local records win the merge', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { importArchive } = await import('/src/services/backup.ts')
    const { repository } = await import('/src/repositories/localRepository.ts')
    const { db } = await import('/src/db/myrideDb.ts')
    const bikeA = await repository.motorcycles.create({ manufacturer: 'Honda', model: 'CB350', currentOdometerKm: 0, active: true })
    const bikeB = await repository.motorcycles.create({ manufacturer: 'Royal Enfield', model: 'Himalayan', currentOdometerKm: 0, active: false })
    const trip = await repository.trips.create({ title: 'Local trip', motorcycleId: bikeA.id, startDate: '2026-01-01T00:00:00.000Z', origin: { label: 'A' }, destination: { label: 'B' }, status: 'Planned' })
    await db.syncQueue.clear()

    const olderTimestamp = new Date(Date.parse(trip.updatedAt) - 1000).toISOString()
    const olderTrip = { ...trip, motorcycleId: bikeB.id, createdAt: olderTimestamp, updatedAt: olderTimestamp }
    const timestamp = new Date(Date.parse(trip.updatedAt) + 1000).toISOString()
    const fuel = { id: crypto.randomUUID(), userId: 'local-rider', createdAt: timestamp, updatedAt: timestamp, syncStatus: 'pending' as const, motorcycleId: bikeB.id, tripId: trip.id, dateTime: timestamp, odometerKm: 100, litres: 5, fullTank: true }
    const records = {
      profiles: [], settings: [], motorcycles: [], trips: [olderTrip], plannedStops: [], gpsPoints: [], fuelLogs: [fuel], expenseLogs: [], rideEvents: [],
      maintenanceLogs: [], weatherSnapshots: [], photos: [], emergencyContacts: [], readinessChecks: [],
    }
    let message = ''
    try {
      await importArchive(new File([JSON.stringify({ format: 'myride-archive', version: 1, exportedAt: timestamp, records })], 'merge-conflict.json', { type: 'application/json' }))
    } catch (error) {
      message = error instanceof Error ? error.message : String(error)
    }
    return {
      message,
      tripMotorcycleId: (await db.trips.get(trip.id))?.motorcycleId,
      fuelCount: await db.fuelLogs.count(),
      queueCount: await db.syncQueue.count(),
      bikeAId: bikeA.id,
    }
  })

  expect(result.message).toMatch(/^Backup relationship error in fuelLogs record .+: motorcycle does not match its trip\.$/)
  expect(result.tripMotorcycleId).toBe(result.bikeAId)
  expect(result.fuelCount).toBe(0)
  expect(result.queueCount).toBe(0)
})
