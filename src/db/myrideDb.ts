import Dexie, { type Table } from 'dexie'
import type {
  EmergencyContact,
  ReadinessCheck,
  ExpenseLog,
  FuelLog,
  GpsPoint,
  MaintenanceLog,
  Motorcycle,
  PlannedStop,
  Profile,
  RideEvent,
  SyncQueueItem,
  Trip,
  TripPhoto,
  UserSettings,
  WeatherSnapshot,
} from '../types/myride'

export class MyRideDb extends Dexie {
  profiles!: Table<Profile, string>
  settings!: Table<UserSettings, string>
  motorcycles!: Table<Motorcycle, string>
  trips!: Table<Trip, string>
  plannedStops!: Table<PlannedStop, string>
  gpsPoints!: Table<GpsPoint, string>
  fuelLogs!: Table<FuelLog, string>
  expenseLogs!: Table<ExpenseLog, string>
  rideEvents!: Table<RideEvent, string>
  maintenanceLogs!: Table<MaintenanceLog, string>
  weatherSnapshots!: Table<WeatherSnapshot, string>
  photos!: Table<TripPhoto, string>
  emergencyContacts!: Table<EmergencyContact, string>
  readinessChecks!: Table<ReadinessCheck, string>
  syncQueue!: Table<SyncQueueItem, string>

  constructor() {
    super('myride-journal')
    this.version(1).stores({
      profiles: 'id, userId, updatedAt',
      settings: 'id, userId, updatedAt',
      motorcycles: 'id, userId, active, updatedAt',
      trips: 'id, userId, motorcycleId, status, startDate, updatedAt',
      plannedStops: 'id, userId, tripId, updatedAt',
      gpsPoints: 'id, userId, tripId, timestamp',
      fuelLogs: 'id, userId, motorcycleId, tripId, dateTime, odometerKm',
      expenseLogs: 'id, userId, tripId, motorcycleId, category, date',
      rideEvents: 'id, userId, tripId, timestamp, type',
      maintenanceLogs: 'id, userId, motorcycleId, date, odometerKm',
      weatherSnapshots: 'id, userId, tripId, timestamp',
      photos: 'id, userId, tripId, takenAt',
      emergencyContacts: 'id, userId, updatedAt',
      syncQueue: 'id, userId, entity, entityId, operation, syncStatus',
    })
    this.version(2).stores({ readinessChecks: 'id, userId, tripId, motorcycleId, item' })
    this.version(3).upgrade((transaction) => transaction.table('settings').toCollection().modify({ temperatureUnit: 'C', dateFormat: 'local' }))
    this.version(4).upgrade((transaction) => transaction.table('settings').toCollection().modify({ maintenanceRemindersEnabled: false }))
    this.version(5).upgrade((transaction) => transaction.table('settings').toCollection().modify({ aiProvider: 'local' }))
    this.version(6).stores({ photos: 'id, userId, tripId, rideEventId, takenAt' })
  }
}

export const db = new MyRideDb()
