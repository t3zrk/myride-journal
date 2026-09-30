import type {
  BaseRecord,
  EmergencyContact,
  ExpenseLog,
  FuelLog,
  GpsPoint,
  MaintenanceLog,
  Motorcycle,
  PlannedStop,
  Profile,
  ReadinessCheck,
  RideEvent,
  Trip,
  TripPhoto,
  UserSettings,
  WeatherSnapshot,
} from '../types/myride'

export interface ArchiveRecords {
  profiles: Profile[]
  settings: UserSettings[]
  motorcycles: Motorcycle[]
  trips: Trip[]
  plannedStops: PlannedStop[]
  gpsPoints: GpsPoint[]
  fuelLogs: FuelLog[]
  expenseLogs: ExpenseLog[]
  rideEvents: RideEvent[]
  maintenanceLogs: MaintenanceLog[]
  weatherSnapshots: WeatherSnapshot[]
  photos: TripPhoto[]
  emergencyContacts: EmergencyContact[]
  readinessChecks: ReadinessCheck[]
}

type RecordWithReferences = BaseRecord & Record<string, unknown>

function relationshipError(table: keyof ArchiveRecords, record: BaseRecord, message: string): never {
  throw new Error(`Backup relationship error in ${table} record ${record.id}: ${message}.`)
}

function reference(
  table: keyof ArchiveRecords,
  record: BaseRecord,
  key: string,
  required: boolean,
) {
  const value = (record as RecordWithReferences)[key]
  if (value === undefined || value === null || value === '') {
    if (required) relationshipError(table, record, `${key} is missing`)
    return undefined
  }
  if (typeof value !== 'string') relationshipError(table, record, `${key} is invalid`)
  return value
}

function requireParent<T extends BaseRecord>(
  table: keyof ArchiveRecords,
  record: BaseRecord,
  key: string,
  parents: Map<string, T>,
  label: string,
) {
  const id = reference(table, record, key, true)!
  const parent = parents.get(id)
  if (!parent) relationshipError(table, record, `${label} ${id} does not exist`)
  return parent
}

function optionalParent<T extends BaseRecord>(
  table: keyof ArchiveRecords,
  record: BaseRecord,
  key: string,
  parents: Map<string, T>,
  label: string,
) {
  const id = reference(table, record, key, false)
  if (!id) return undefined
  const parent = parents.get(id)
  if (!parent) relationshipError(table, record, `${label} ${id} does not exist`)
  return parent
}

export function validateArchiveRelationships(records: ArchiveRecords) {
  const motorcycles = new Map(records.motorcycles.map((record) => [record.id, record]))
  const trips = new Map(records.trips.map((record) => [record.id, record]))
  const rideEvents = new Map(records.rideEvents.map((record) => [record.id, record]))

  const activeMotorcycles = records.motorcycles.filter((record) => !record.deletedAt && record.active)
  if (activeMotorcycles.length > 1) throw new Error('Backup invariant error: more than one motorcycle is active.')
  const activeTrips = records.trips.filter((record) => !record.deletedAt && record.status === 'Active')
  if (activeTrips.length > 1) throw new Error('Backup invariant error: more than one trip is active.')

  for (const [table, values] of [['profiles', records.profiles], ['settings', records.settings]] as const) {
    if (values.filter((item) => !item.deletedAt).length > 1) throw new Error(`Backup invariant error: this single-rider journal has more than one live ${table} record.`)
  }

  for (const trip of records.trips) optionalParent('trips', trip, 'motorcycleId', motorcycles, 'motorcycle')
  for (const stop of records.plannedStops) requireParent('plannedStops', stop, 'tripId', trips, 'trip')
  for (const point of records.gpsPoints) requireParent('gpsPoints', point, 'tripId', trips, 'trip')
  for (const event of records.rideEvents) requireParent('rideEvents', event, 'tripId', trips, 'trip')
  for (const weather of records.weatherSnapshots) requireParent('weatherSnapshots', weather, 'tripId', trips, 'trip')
  for (const maintenance of records.maintenanceLogs) requireParent('maintenanceLogs', maintenance, 'motorcycleId', motorcycles, 'motorcycle')

  for (const fuel of records.fuelLogs) {
    const motorcycle = requireParent('fuelLogs', fuel, 'motorcycleId', motorcycles, 'motorcycle')
    const trip = optionalParent('fuelLogs', fuel, 'tripId', trips, 'trip')
    if (trip && trip.motorcycleId !== motorcycle.id) relationshipError('fuelLogs', fuel, 'motorcycle does not match its trip')
  }

  for (const expense of records.expenseLogs) {
    const motorcycle = optionalParent('expenseLogs', expense, 'motorcycleId', motorcycles, 'motorcycle')
    const trip = optionalParent('expenseLogs', expense, 'tripId', trips, 'trip')
    if (trip?.motorcycleId && motorcycle && trip.motorcycleId !== motorcycle.id) relationshipError('expenseLogs', expense, 'motorcycle does not match its trip')
  }

  for (const photo of records.photos) {
    const trip = requireParent('photos', photo, 'tripId', trips, 'trip')
    const event = optionalParent('photos', photo, 'rideEventId', rideEvents, 'ride event')
    if (event && event.tripId !== trip.id) relationshipError('photos', photo, 'ride event does not belong to its trip')
  }

  for (const check of records.readinessChecks) {
    const motorcycle = optionalParent('readinessChecks', check, 'motorcycleId', motorcycles, 'motorcycle')
    const trip = optionalParent('readinessChecks', check, 'tripId', trips, 'trip')
    if (trip?.motorcycleId && motorcycle && trip.motorcycleId !== motorcycle.id) relationshipError('readinessChecks', check, 'motorcycle does not match its trip')
  }
}
