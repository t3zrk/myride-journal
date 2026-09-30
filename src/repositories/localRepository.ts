import type { Table } from 'dexie'
import { db } from '../db/myrideDb'
import type {
  BaseRecord,
  EmergencyContact,
  ExpenseLog,
  FuelLog,
  GpsPoint,
  MaintenanceLog,
  Motorcycle,
  PlannedStop,
  ReadinessCheck,
  Profile,
  RideEvent,
  SyncQueueItem,
  Trip,
  TripPhoto,
  UserSettings,
  WeatherSnapshot,
} from '../types/myride'
import { baseRecord, cacheDisplaySettings, nowIso, touchRecord } from '../utils/record'
import { validateDomainRecord, type DomainEntity } from '../services/domainValidation'

type EntityName = DomainEntity
type TripWrite = Omit<Trip, keyof BaseRecord>
type PlannedStopWrite = Omit<PlannedStop, keyof BaseRecord | 'tripId'> & { id?: string }

function plannedStopFields(stop: PlannedStopWrite) {
  return {
    label: stop.label,
    latitude: stop.latitude,
    longitude: stop.longitude,
    plannedAt: stop.plannedAt,
    notes: stop.notes,
  }
}

async function queue(entity: EntityName, entityId: string, operation: 'upsert' | 'delete', payload: unknown) {
  await db.syncQueue.where('entityId').equals(entityId).and((item) => item.entity === entity).delete()
  const item: SyncQueueItem = {
    ...baseRecord(),
    entity,
    entityId,
    operation,
    payload,
  }
  await db.syncQueue.put(item)
}

async function put<T extends BaseRecord>(entity: EntityName, table: Table<T, string>, record: T) {
  validateDomainRecord(entity, record)
  return db.transaction('rw', [table, db.syncQueue], async () => {
    await table.put(record)
    await queue(entity, record.id, 'upsert', record)
    return record
  })
}

async function update<T extends BaseRecord>(entity: EntityName, table: Table<T, string>, id: string, updates: Partial<T>) {
  return db.transaction('rw', [table, db.syncQueue], async () => {
    const existing = await table.get(id)
    if (!existing) throw new Error(`${entity} record not found`)
    const next = touchRecord({ ...existing, ...updates })
    validateDomainRecord(entity, next)
    await table.put(next)
    await queue(entity, id, 'upsert', next)
    return next
  })
}

async function remove<T extends BaseRecord>(entity: EntityName, table: Table<T, string>, id: string) {
  return db.transaction('rw', [table, db.syncQueue], async () => {
    const existing = await table.get(id)
    if (!existing) throw new Error(`${entity} record not found`)
    const next = touchRecord({ ...existing, deletedAt: nowIso() })
    validateDomainRecord(entity, next)
    await table.put(next)
    await queue(entity, id, 'delete', next)
    return next
  })
}

function defaultSettings(id?: string): UserSettings {
  const record = baseRecord()
  return {
    ...record,
    id: id ?? record.id,
    distanceUnit: 'km',
    fuelUnit: 'litre',
    temperatureUnit: 'C',
    dateFormat: 'local',
    currency: 'INR',
    gpsIntervalSeconds: 60,
    safeRangeReservePercent: 15,
    aiEnabled: false,
    aiProvider: 'local',
    maintenanceRemindersEnabled: false,
  }
}

async function ensureSingleActiveTrip(exceptId?: string) {
  const other = await db.trips.where('status').equals('Active').and((trip) => !trip.deletedAt && trip.id !== exceptId).first()
  if (other) throw new Error(`End ${other.title} before starting another trip.`)
}

async function requireParent<T extends BaseRecord>(table: Table<T, string>, id: string, label: string, allowDeleted = false) {
  const record = await table.get(id)
  if (!record || (!allowDeleted && record.deletedAt)) throw new Error(`${label} not found`)
  return record
}

async function requireTripMotorcycle(tripId: string, motorcycleId: string, allowDeleted = false) {
  const trip = await requireParent(db.trips, tripId, 'Trip', allowDeleted)
  if (trip.motorcycleId !== motorcycleId) throw new Error('The motorcycle does not match this trip.')
  return trip
}

async function requireCompatibleTripMotorcycleChange(tripId: string, currentMotorcycleId: string | undefined, nextMotorcycleId: string | undefined) {
  if (currentMotorcycleId === nextMotorcycleId) return
  const [fuel, expenses, readiness] = await Promise.all([
    db.fuelLogs.where('tripId').equals(tripId).toArray(),
    db.expenseLogs.where('tripId').equals(tripId).toArray(),
    db.readinessChecks.where('tripId').equals(tripId).toArray(),
  ])
  const incompatibleFuel = fuel.some((record) => !record.deletedAt && record.motorcycleId !== nextMotorcycleId)
  const incompatibleExpense = nextMotorcycleId !== undefined && expenses.some((record) => !record.deletedAt && record.motorcycleId !== undefined && record.motorcycleId !== nextMotorcycleId)
  const incompatibleReadiness = nextMotorcycleId !== undefined && readiness.some((record) => !record.deletedAt && record.motorcycleId !== undefined && record.motorcycleId !== nextMotorcycleId)
  if (incompatibleFuel || incompatibleExpense || incompatibleReadiness) throw new Error('Trip motorcycle cannot change while linked records belong to another motorcycle.')
}

async function requireCompatibleRideEventTripChange(eventId: string, currentTripId: string, nextTripId: string) {
  if (currentTripId === nextTripId) return
  const linkedPhoto = await db.photos.where('rideEventId').equals(eventId).and((record) => !record.deletedAt && record.tripId !== nextTripId).first()
  if (linkedPhoto) throw new Error('Ride event trip cannot change while linked photos belong to another trip.')
}

export const repository = {
  profiles: {
    async get() {
      return db.profiles.filter((item) => !item.deletedAt).first()
    },
    async save(input: Omit<Profile, keyof BaseRecord> & Partial<BaseRecord>) {
      const existing = input.id ? await db.profiles.get(input.id) : await db.profiles.filter((item) => !item.deletedAt).first()
      const record = existing ? touchRecord({ ...existing, ...input }) : ({ ...baseRecord(), ...input } as Profile)
      return put('profiles', db.profiles, record)
    },
  },
  settings: {
    async get() {
      const existing = await db.settings.filter((item) => !item.deletedAt).first()
      if (existing) { cacheDisplaySettings(existing); return existing }
      const defaults = defaultSettings()
      cacheDisplaySettings(defaults)
      return defaults
    },
    async save(id: string, updates: Partial<UserSettings>) {
      const saved = await db.transaction('rw', [db.settings, db.expenseLogs, db.fuelLogs, db.syncQueue], async () => {
        const existing = await db.settings.get(id)
        const currency = updates.currency ?? existing?.currency ?? 'INR'
        if (!/^[A-Z]{3}$/.test(currency)) throw new Error('Enter a three-letter currency code.')
        if (currency !== (existing?.currency ?? 'INR')) {
          const expense = await db.expenseLogs.filter((item) => !item.deletedAt).first()
          const fuelCost = await db.fuelLogs.filter((item) => !item.deletedAt && (item.totalCost !== undefined || item.pricePerLitre !== undefined)).first()
          if (expense || fuelCost) throw new Error('Currency cannot change after costs have been recorded.')
        }
        return existing
          ? update('settings', db.settings, id, updates)
          : put('settings', db.settings, { ...defaultSettings(id), ...updates })
      })
      cacheDisplaySettings(saved)
      return saved
    },
  },
  motorcycles: {
    all: () => db.motorcycles.filter((item) => !item.deletedAt).toArray(),
    allIncludingDeleted: () => db.motorcycles.toArray(),
    get: (id: string) => db.motorcycles.get(id),
    async create(input: Omit<Motorcycle, keyof BaseRecord>) {
      const record = { ...baseRecord(), ...input }
      if (!input.active) return put('motorcycles', db.motorcycles, record)
      return db.transaction('rw', [db.motorcycles, db.syncQueue], async () => {
        const motorcycles = await db.motorcycles.filter((item) => !item.deletedAt).toArray()
        for (const motorcycle of motorcycles.filter((item) => item.active)) await update('motorcycles', db.motorcycles, motorcycle.id, { active: false })
        return put('motorcycles', db.motorcycles, record)
      })
    },
    async update(id: string, input: Partial<Motorcycle>) {
      if (input.active !== true) return update('motorcycles', db.motorcycles, id, input)
      return db.transaction('rw', [db.motorcycles, db.syncQueue], async () => {
        const target = await requireParent(db.motorcycles, id, 'Motorcycle')
        const motorcycles = await db.motorcycles.filter((item) => !item.deletedAt).toArray()
        for (const motorcycle of motorcycles.filter((item) => item.id !== id && item.active)) await update('motorcycles', db.motorcycles, motorcycle.id, { active: false })
        return update('motorcycles', db.motorcycles, target.id, input)
      })
    },
    async remove(id: string) {
      return db.transaction('rw', [db.motorcycles, db.syncQueue], async () => {
        const removed = await remove('motorcycles', db.motorcycles, id)
        const remaining = (await db.motorcycles.filter((item) => !item.deletedAt && item.id !== id).toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        const selected = remaining.find((item) => item.active) ?? remaining[0]
        if (removed.active && selected) {
          for (const motorcycle of remaining) {
            const shouldBeActive = motorcycle.id === selected.id
            if (motorcycle.active !== shouldBeActive) await update('motorcycles', db.motorcycles, motorcycle.id, { active: shouldBeActive })
          }
        }
        return removed
      })
    },
    async setActive(id: string) {
      await db.transaction('rw', [db.motorcycles, db.syncQueue], async () => {
        const motorcycles = await db.motorcycles.filter((item) => !item.deletedAt).toArray()
        if (!motorcycles.some((motorcycle) => motorcycle.id === id)) throw new Error('Motorcycle not found')
        const ordered = motorcycles.sort((a, b) => Number(a.id === id) - Number(b.id === id))
        for (const motorcycle of ordered) {
          const shouldBeActive = motorcycle.id === id
          if (motorcycle.active !== shouldBeActive) await update('motorcycles', db.motorcycles, motorcycle.id, { active: shouldBeActive })
        }
      })
    },
  },
  trips: {
    all: () => db.trips.filter((item) => !item.deletedAt).toArray(),
    get: (id: string) => db.trips.get(id),
    async create(input: Omit<Trip, keyof BaseRecord>) {
      if (input.motorcycleId) await requireParent(db.motorcycles, input.motorcycleId, 'Motorcycle')
      if (input.status !== 'Active') return put('trips', db.trips, { ...baseRecord(), ...input })
      return db.transaction('rw', [db.trips, db.syncQueue], async () => {
        await ensureSingleActiveTrip()
        return put('trips', db.trips, { ...baseRecord(), ...input })
      })
    },
    async createWithStops(input: TripWrite, stops: PlannedStopWrite[]) {
      return db.transaction('rw', [db.motorcycles, db.trips, db.plannedStops, db.syncQueue], async () => {
        if (input.motorcycleId) await requireParent(db.motorcycles, input.motorcycleId, 'Motorcycle')
        if (input.status === 'Active') await ensureSingleActiveTrip()
        const trip = await put('trips', db.trips, { ...baseRecord(), ...input })
        for (const stop of stops) {
          await put('plannedStops', db.plannedStops, { ...baseRecord(), ...plannedStopFields(stop), tripId: trip.id })
        }
        return trip
      })
    },
    async update(id: string, input: Partial<Trip>) {
      const existing = await db.trips.get(id)
      if (!existing) throw new Error('trips record not found')
      if (Object.prototype.hasOwnProperty.call(input, 'motorcycleId')) {
        if (input.motorcycleId && input.motorcycleId !== existing.motorcycleId) await requireParent(db.motorcycles, input.motorcycleId, 'Motorcycle')
        await requireCompatibleTripMotorcycleChange(id, existing.motorcycleId, input.motorcycleId)
      }
      if (input.status !== 'Active') return update('trips', db.trips, id, input)
      return db.transaction('rw', [db.trips, db.syncQueue], async () => {
        await ensureSingleActiveTrip(id)
        return update('trips', db.trips, id, input)
      })
    },
    async updateWithStops(id: string, input: Partial<Trip>, stops: PlannedStopWrite[]) {
      return db.transaction('rw', [db.motorcycles, db.trips, db.plannedStops, db.fuelLogs, db.expenseLogs, db.readinessChecks, db.syncQueue], async () => {
        const existing = await db.trips.get(id)
        if (!existing) throw new Error('trips record not found')
        if (Object.prototype.hasOwnProperty.call(input, 'motorcycleId')) {
          if (input.motorcycleId && input.motorcycleId !== existing.motorcycleId) await requireParent(db.motorcycles, input.motorcycleId, 'Motorcycle')
          await requireCompatibleTripMotorcycleChange(id, existing.motorcycleId, input.motorcycleId)
        }
        if (input.status === 'Active') await ensureSingleActiveTrip(id)
        const saved = await update('trips', db.trips, id, input)
        const oldStops = await db.plannedStops.where('tripId').equals(id).and((item) => !item.deletedAt).toArray()
        const oldStopIds = new Set(oldStops.map((stop) => stop.id))
        const retainedIds = new Set(stops.flatMap((stop) => stop.id && oldStopIds.has(stop.id) ? [stop.id] : []))

        for (const old of oldStops) {
          if (!retainedIds.has(old.id)) await remove('plannedStops', db.plannedStops, old.id)
        }
        for (const stop of stops) {
          const fields = plannedStopFields(stop)
          if (stop.id && oldStopIds.has(stop.id)) await update('plannedStops', db.plannedStops, stop.id, { ...fields, tripId: id })
          else await put('plannedStops', db.plannedStops, { ...baseRecord(), ...fields, tripId: id })
        }
        return saved
      })
    },
    remove: async (id: string) => {
      await db.transaction('rw', [db.trips, db.plannedStops, db.gpsPoints, db.rideEvents, db.weatherSnapshots, db.photos, db.readinessChecks, db.fuelLogs, db.expenseLogs, db.syncQueue], async () => {
        await remove('trips', db.trips, id)
        const owned = [
          ['plannedStops', db.plannedStops], ['gpsPoints', db.gpsPoints], ['rideEvents', db.rideEvents],
          ['weatherSnapshots', db.weatherSnapshots], ['photos', db.photos], ['readinessChecks', db.readinessChecks],
        ] as const
        for (const [entity, table] of owned) {
          const children = await table.where('tripId').equals(id).toArray()
          for (const child of children.filter((item) => !item.deletedAt)) await remove(entity, table as Table<BaseRecord, string>, child.id)
        }
        const fuel = await db.fuelLogs.where('tripId').equals(id).toArray()
        for (const item of fuel.filter((record) => !record.deletedAt)) await update('fuelLogs', db.fuelLogs, item.id, { tripId: undefined })
        const expenses = await db.expenseLogs.where('tripId').equals(id).toArray()
        for (const item of expenses.filter((record) => !record.deletedAt)) await update('expenseLogs', db.expenseLogs, item.id, { tripId: undefined })
      })
      return id
    },
  },
  plannedStops: {
    byTrip: (tripId: string) => db.plannedStops.where('tripId').equals(tripId).and((item) => !item.deletedAt).toArray(),
    async create(input: Omit<PlannedStop, keyof BaseRecord>) { await requireParent(db.trips, input.tripId, 'Trip'); return put('plannedStops', db.plannedStops, { ...baseRecord(), ...input }) },
    async update(id: string, input: Partial<PlannedStop>) { const existing = await db.plannedStops.get(id); if (!existing) throw new Error('plannedStops record not found'); if (input.tripId && input.tripId !== existing.tripId) await requireParent(db.trips, input.tripId, 'Trip'); return update('plannedStops', db.plannedStops, id, input) },
    remove: (id: string) => remove('plannedStops', db.plannedStops, id),
  },
  gpsPoints: {
    all: () => db.gpsPoints.filter((item) => !item.deletedAt).toArray(),
    byTrip: (tripId: string) => db.gpsPoints.where('tripId').equals(tripId).and((item) => !item.deletedAt).sortBy('timestamp'),
    async create(input: Omit<GpsPoint, keyof BaseRecord>) { await requireParent(db.trips, input.tripId, 'Trip'); return put('gpsPoints', db.gpsPoints, { ...baseRecord(), ...input }) },
  },
  rideEvents: {
    byTrip: (tripId: string) => db.rideEvents.where('tripId').equals(tripId).and((item) => !item.deletedAt).sortBy('timestamp'),
    async create(input: Omit<RideEvent, keyof BaseRecord>) { await requireParent(db.trips, input.tripId, 'Trip'); return put('rideEvents', db.rideEvents, { ...baseRecord(), ...input }) },
    async update(id: string, input: Partial<RideEvent>) { const existing = await db.rideEvents.get(id); if (!existing) throw new Error('rideEvents record not found'); if (input.tripId && input.tripId !== existing.tripId) { await requireParent(db.trips, input.tripId, 'Trip'); await requireCompatibleRideEventTripChange(id, existing.tripId, input.tripId) } return update('rideEvents', db.rideEvents, id, input) },
    remove: (id: string) => remove('rideEvents', db.rideEvents, id),
  },
  fuelLogs: {
    all: () => db.fuelLogs.filter((item) => !item.deletedAt).toArray(),
    byMotorcycle: (motorcycleId: string) => db.fuelLogs.where('motorcycleId').equals(motorcycleId).and((item) => !item.deletedAt).sortBy('dateTime'),
    byTrip: (tripId: string) => db.fuelLogs.where('tripId').equals(tripId).and((item) => !item.deletedAt).sortBy('dateTime'),
    async create(input: Omit<FuelLog, keyof BaseRecord>) { await requireParent(db.motorcycles, input.motorcycleId, 'Motorcycle'); if (input.tripId) await requireTripMotorcycle(input.tripId, input.motorcycleId); return put('fuelLogs', db.fuelLogs, { ...baseRecord(), ...input }) },
    async update(id: string, input: Partial<FuelLog>) { const existing = await db.fuelLogs.get(id); if (!existing) throw new Error('fuelLogs record not found'); const next = { ...existing, ...input }; await requireParent(db.motorcycles, next.motorcycleId, 'Motorcycle', next.motorcycleId === existing.motorcycleId); if (next.tripId) await requireTripMotorcycle(next.tripId, next.motorcycleId, next.tripId === existing.tripId); return update('fuelLogs', db.fuelLogs, id, input) },
    remove: (id: string) => remove('fuelLogs', db.fuelLogs, id),
  },
  expenses: {
    all: () => db.expenseLogs.filter((item) => !item.deletedAt).toArray(),
    byTrip: (tripId: string) => db.expenseLogs.where('tripId').equals(tripId).and((item) => !item.deletedAt).sortBy('date'),
    async create(input: Omit<ExpenseLog, keyof BaseRecord>) { const trip = input.tripId ? await requireParent(db.trips, input.tripId, 'Trip') : undefined; if (input.motorcycleId) await requireParent(db.motorcycles, input.motorcycleId, 'Motorcycle'); if (trip?.motorcycleId && input.motorcycleId && trip.motorcycleId !== input.motorcycleId) throw new Error('The motorcycle does not match this trip.'); return put('expenseLogs', db.expenseLogs, { ...baseRecord(), ...input }) },
    async update(id: string, input: Partial<ExpenseLog>) { const existing = await db.expenseLogs.get(id); if (!existing) throw new Error('expenseLogs record not found'); const next = { ...existing, ...input }; const trip = next.tripId ? await requireParent(db.trips, next.tripId, 'Trip', next.tripId === existing.tripId) : undefined; if (next.motorcycleId) await requireParent(db.motorcycles, next.motorcycleId, 'Motorcycle', next.motorcycleId === existing.motorcycleId); if (trip?.motorcycleId && next.motorcycleId && trip.motorcycleId !== next.motorcycleId) throw new Error('The motorcycle does not match this trip.'); return update('expenseLogs', db.expenseLogs, id, input) },
    remove: (id: string) => remove('expenseLogs', db.expenseLogs, id),
  },
  maintenance: {
    all: () => db.maintenanceLogs.filter((item) => !item.deletedAt).toArray(),
    byMotorcycle: (motorcycleId: string) => db.maintenanceLogs.where('motorcycleId').equals(motorcycleId).and((item) => !item.deletedAt).sortBy('date'),
    async create(input: Omit<MaintenanceLog, keyof BaseRecord>) { await requireParent(db.motorcycles, input.motorcycleId, 'Motorcycle'); return put('maintenanceLogs', db.maintenanceLogs, { ...baseRecord(), ...input }) },
    async update(id: string, input: Partial<MaintenanceLog>) { const existing = await db.maintenanceLogs.get(id); if (!existing) throw new Error('maintenanceLogs record not found'); if (input.motorcycleId && input.motorcycleId !== existing.motorcycleId) await requireParent(db.motorcycles, input.motorcycleId, 'Motorcycle'); return update('maintenanceLogs', db.maintenanceLogs, id, input) },
    remove: (id: string) => remove('maintenanceLogs', db.maintenanceLogs, id),
  },
  weather: {
    all: () => db.weatherSnapshots.filter((item) => !item.deletedAt).toArray(),
    byTrip: (tripId: string) => db.weatherSnapshots.where('tripId').equals(tripId).and((item) => !item.deletedAt).sortBy('timestamp'),
    async create(input: Omit<WeatherSnapshot, keyof BaseRecord>) { await requireParent(db.trips, input.tripId, 'Trip'); return put('weatherSnapshots', db.weatherSnapshots, { ...baseRecord(), ...input }) },
  },
  photos: {
    byTrip: (tripId: string) => db.photos.where('tripId').equals(tripId).and((item) => !item.deletedAt).sortBy('takenAt'),
    async create(input: Omit<TripPhoto, keyof BaseRecord>) { await requireParent(db.trips, input.tripId, 'Trip'); if (input.rideEventId) { const event = await requireParent(db.rideEvents, input.rideEventId, 'Ride event'); if (event.tripId !== input.tripId) throw new Error('The ride event does not belong to this trip.') } return put('photos', db.photos, { ...baseRecord(), ...input }) },
    async update(id: string, input: Partial<TripPhoto>) { const existing = await db.photos.get(id); if (!existing) throw new Error('photos record not found'); const next = { ...existing, ...input }; if (input.tripId && input.tripId !== existing.tripId) await requireParent(db.trips, input.tripId, 'Trip'); if (next.rideEventId) { const event = await requireParent(db.rideEvents, next.rideEventId, 'Ride event', next.rideEventId === existing.rideEventId); if (event.tripId !== next.tripId) throw new Error('The ride event does not belong to this trip.') } return update('photos', db.photos, id, input) },
    remove: (id: string) => remove('photos', db.photos, id),
  },
  emergencyContacts: {
    all: () => db.emergencyContacts.filter((item) => !item.deletedAt).toArray(),
    create: (input: Omit<EmergencyContact, keyof BaseRecord>) => put('emergencyContacts', db.emergencyContacts, { ...baseRecord(), ...input }),
    update: (id: string, input: Partial<EmergencyContact>) => update('emergencyContacts', db.emergencyContacts, id, input),
    remove: (id: string) => remove('emergencyContacts', db.emergencyContacts, id),
  },
  readinessChecks: {
    byScope: (tripId?: string, motorcycleId?: string) => db.readinessChecks.filter((item) => !item.deletedAt && item.tripId === tripId && item.motorcycleId === motorcycleId).toArray(),
    async set(scope: { tripId?: string; motorcycleId?: string }, item: string, checked: boolean) {
      const trip = scope.tripId ? await requireParent(db.trips, scope.tripId, 'Trip') : undefined
      if (scope.motorcycleId) await requireParent(db.motorcycles, scope.motorcycleId, 'Motorcycle')
      if (trip?.motorcycleId && scope.motorcycleId && trip.motorcycleId !== scope.motorcycleId) throw new Error('The motorcycle does not match this trip.')
      const existing = await db.readinessChecks.filter((record) => !record.deletedAt && record.tripId === scope.tripId && record.motorcycleId === scope.motorcycleId && record.item === item).first()
      const payload: Partial<ReadinessCheck> = { ...scope, item, checked, checkedAt: checked ? nowIso() : undefined }
      if (existing) return update('readinessChecks', db.readinessChecks, existing.id, payload)
      return put('readinessChecks', db.readinessChecks, { ...baseRecord(), ...scope, item, checked, checkedAt: checked ? nowIso() : undefined })
    },
  },
  syncQueue: {
    all: () => db.syncQueue.toArray(),
    pending: () => db.syncQueue.filter((item) => item.syncStatus === 'pending').toArray(),
    clear: () => db.syncQueue.clear(),
  },
}
