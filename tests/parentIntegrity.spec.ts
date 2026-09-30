import { expect, test } from '@playwright/test'

test('repository rejects orphaned and mismatched child records', async ({ page }) => {
  await page.goto('/')
  const result = await page.evaluate(async () => {
    const { repository } = await import('/src/repositories/localRepository.ts')
    const { db } = await import('/src/db/myrideDb.ts')
    const bike = (nickname: string) => repository.motorcycles.create({ manufacturer: 'Honda', model: 'CB350', nickname, currentOdometerKm: 0, active: false })
    const bikeA = await bike('A')
    const bikeB = await bike('B')
    const trip = (title: string, motorcycleId: string) => repository.trips.create({ title, motorcycleId, startDate: '2026-01-01T00:00:00.000Z', origin: { label: 'Start' }, destination: { label: 'Finish' }, status: 'Planned' })
    const tripA = await trip('Trip A', bikeA.id)
    const tripB = await trip('Trip B', bikeB.id)
    const eventA = await repository.rideEvents.create({ tripId: tripA.id, type: 'event', title: 'Trip A event', timestamp: '2026-01-01T01:00:00.000Z' })
    const eventB = await repository.rideEvents.create({ tripId: tripB.id, type: 'event', title: 'Other trip event', timestamp: '2026-01-01T01:00:00.000Z' })
    const missing = crypto.randomUUID()
    const failures: string[] = []
    async function reject(operation: () => Promise<unknown>) {
      try { await operation(); failures.push('accepted') } catch (error) { failures.push(error instanceof Error ? error.message : String(error)) }
    }
    const queueBefore = await db.syncQueue.count()

    await reject(() => repository.trips.create({ title: 'Orphan trip', motorcycleId: missing, startDate: '2026-01-01T00:00:00.000Z', origin: { label: 'A' }, destination: { label: 'B' }, status: 'Planned' }))
    await reject(() => repository.plannedStops.create({ tripId: missing, label: 'Orphan stop' }))
    await reject(() => repository.gpsPoints.create({ tripId: missing, latitude: 1, longitude: 1, timestamp: '2026-01-01T01:00:00.000Z' }))
    await reject(() => repository.rideEvents.create({ tripId: missing, type: 'event', title: 'Orphan event', timestamp: '2026-01-01T01:00:00.000Z' }))
    await reject(() => repository.weather.create({ tripId: missing, latitude: 1, longitude: 1, timestamp: '2026-01-01T01:00:00.000Z' }))
    await reject(() => repository.maintenance.create({ motorcycleId: missing, date: '2026-01-01T01:00:00.000Z', odometerKm: 100, serviceType: 'General', component: 'Engine oil' }))
    await reject(() => repository.fuelLogs.create({ motorcycleId: bikeB.id, tripId: tripA.id, dateTime: '2026-01-01T01:00:00.000Z', odometerKm: 100, litres: 5, fullTank: true }))
    await reject(() => repository.expenses.create({ motorcycleId: bikeB.id, tripId: tripA.id, date: '2026-01-01T01:00:00.000Z', amount: 10, currency: 'INR', category: 'food', paymentMethod: 'Cash' }))
    await reject(() => repository.photos.create({ tripId: tripA.id, rideEventId: eventB.id, takenAt: '2026-01-01T01:00:00.000Z' }))
    await reject(() => repository.readinessChecks.set({ tripId: tripA.id, motorcycleId: bikeB.id }, 'Tyres', true))

    const fuel = await repository.fuelLogs.create({ motorcycleId: bikeA.id, tripId: tripA.id, dateTime: '2026-01-01T02:00:00.000Z', odometerKm: 110, litres: 5, fullTank: true })
    await reject(() => repository.fuelLogs.update(fuel.id, { motorcycleId: bikeB.id }))
    await reject(() => repository.trips.update(tripA.id, { motorcycleId: bikeB.id }))
    const photo = await repository.photos.create({ tripId: tripA.id, rideEventId: eventA.id, takenAt: '2026-01-01T02:00:00.000Z' })
    await reject(() => repository.photos.update(photo.id, { rideEventId: eventB.id }))
    await reject(() => repository.rideEvents.update(eventA.id, { tripId: tripB.id }))

    return {
      failures,
      queueDelta: (await db.syncQueue.count()) - queueBefore,
      invalidCounts: {
        plannedStops: await db.plannedStops.count(), gpsPoints: await db.gpsPoints.count(),
        weather: await db.weatherSnapshots.count(), maintenance: await db.maintenanceLogs.count(),
        expenses: await db.expenseLogs.count(), readiness: await db.readinessChecks.count(),
      },
      bikeAId: bikeA.id,
      fuelMotorcycleId: (await db.fuelLogs.get(fuel.id))?.motorcycleId,
      tripMotorcycleId: (await db.trips.get(tripA.id))?.motorcycleId,
      photoEventId: (await db.photos.get(photo.id))?.rideEventId,
      eventTripId: (await db.rideEvents.get(eventA.id))?.tripId,
      eventAId: eventA.id,
      tripAId: tripA.id,
    }
  })

  expect(result.failures).toHaveLength(14)
  expect(result.failures).not.toContain('accepted')
  expect(result.failures.filter((message) => message === 'The motorcycle does not match this trip.')).toHaveLength(4)
  expect(result.failures).toContain('The ride event does not belong to this trip.')
  expect(result.failures).toContain('Trip motorcycle cannot change while linked records belong to another motorcycle.')
  expect(result.failures).toContain('Ride event trip cannot change while linked photos belong to another trip.')
  expect(result.queueDelta).toBe(2)
  expect(result.invalidCounts).toEqual({ plannedStops: 0, gpsPoints: 0, weather: 0, maintenance: 0, expenses: 0, readiness: 0 })
  expect(result.fuelMotorcycleId).toBe(result.bikeAId)
  expect(result.tripMotorcycleId).toBe(result.bikeAId)
  expect(result.photoEventId).toBe(result.eventAId)
  expect(result.eventTripId).toBe(result.tripAId)
})
