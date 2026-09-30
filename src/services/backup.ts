import { db } from '../db/myrideDb'
import type { BaseRecord, SyncQueueItem } from '../types/myride'
import { baseRecord } from '../utils/record'
import { validateArchiveRelationships, type ArchiveRecords } from './archiveIntegrity'
import { validateDomainRecord } from './domainValidation'

const tables = [
  'profiles', 'settings', 'motorcycles', 'trips', 'plannedStops', 'gpsPoints',
  'fuelLogs', 'expenseLogs', 'rideEvents', 'maintenanceLogs', 'weatherSnapshots',
  'photos', 'emergencyContacts', 'readinessChecks',
] as const

type ArchiveTable = (typeof tables)[number]
type Archive = { format: 'myride-archive'; version: 1; exportedAt: string; records: ArchiveRecords }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isValidDate(value: unknown) {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value))
}

function incomingIsNewer(existing: BaseRecord | undefined, incoming: BaseRecord) {
  return !existing || Date.parse(incoming.updatedAt) > Date.parse(existing.updatedAt)
}

function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function exportArchive() {
  const records = {} as Archive['records']
  for (const name of tables) (records as Record<ArchiveTable, BaseRecord[]>)[name] = await db.table<BaseRecord, string>(name).toArray()
  const archive: Archive = { format: 'myride-archive', version: 1, exportedAt: new Date().toISOString(), records }
  downloadJson(`myride-backup-${new Date().toISOString().slice(0, 10)}.json`, archive)
}

export async function exportTrip(tripId: string) {
  const trip = await db.trips.get(tripId)
  if (!trip || trip.deletedAt) throw new Error('Trip not found')
  const [motorcycle, plannedStops, gpsPoints, rideEvents, fuelLogs, expenses, weatherSnapshots, photos, readinessChecks] = await Promise.all([
    trip.motorcycleId ? db.motorcycles.get(trip.motorcycleId) : undefined,
    db.plannedStops.where('tripId').equals(tripId).filter((record) => !record.deletedAt).toArray(),
    db.gpsPoints.where('tripId').equals(tripId).filter((record) => !record.deletedAt).toArray(),
    db.rideEvents.where('tripId').equals(tripId).filter((record) => !record.deletedAt).toArray(),
    db.fuelLogs.where('tripId').equals(tripId).filter((record) => !record.deletedAt).toArray(),
    db.expenseLogs.where('tripId').equals(tripId).filter((record) => !record.deletedAt).toArray(),
    db.weatherSnapshots.where('tripId').equals(tripId).filter((record) => !record.deletedAt).toArray(),
    db.photos.where('tripId').equals(tripId).filter((record) => !record.deletedAt).toArray(),
    db.readinessChecks.where('tripId').equals(tripId).filter((record) => !record.deletedAt).toArray(),
  ])
  downloadJson(`myride-trip-${trip.id}.json`, {
    format: 'myride-trip', version: 1, exportedAt: new Date().toISOString(),
    trip, motorcycle, plannedStops, gpsPoints, rideEvents, fuelLogs, expenses, weatherSnapshots, photos, readinessChecks,
  })
}

export async function importArchive(file: File) {
  const parsed: unknown = JSON.parse(await file.text())
  if (!parsed || typeof parsed !== 'object' || !('format' in parsed) || parsed.format !== 'myride-archive' || !('version' in parsed) || parsed.version !== 1 || !('records' in parsed) || !parsed.records || typeof parsed.records !== 'object') throw new Error('This is not a MyRide backup file.')
  const archive = parsed as Archive
  for (const name of tables) {
    if (!Array.isArray(archive.records[name])) throw new Error(`Backup is missing ${name}.`)
    const ids = new Set<string>()
    for (const record of archive.records[name]) {
      if (!record || typeof record !== 'object' || !UUID_PATTERN.test(record.id) || typeof record.userId !== 'string' || !record.userId || !isValidDate(record.createdAt) || !isValidDate(record.updatedAt) || (record.deletedAt !== undefined && !isValidDate(record.deletedAt)) || ids.has(record.id)) throw new Error(`Invalid record in ${name}.`)
      validateDomainRecord(name, record)
      ids.add(record.id)
    }
  }

  let imported = 0
  await db.transaction('rw', [...tables.map((name) => db.table(name)), db.syncQueue], async () => {
    const effective = {} as ArchiveRecords
    for (const name of tables) {
      const merged = new Map((await db.table<BaseRecord, string>(name).toArray()).map((record) => [record.id, record]))
      for (const record of archive.records[name]) {
        if (incomingIsNewer(merged.get(record.id), record)) merged.set(record.id, record)
      }
      ;(effective as Record<ArchiveTable, BaseRecord[]>)[name] = [...merged.values()]
    }
    validateArchiveRelationships(effective)

    for (const name of tables) {
      const table = db.table<BaseRecord, string>(name)
      for (const record of archive.records[name]) {
        const existing = await table.get(record.id)
        if (!incomingIsNewer(existing, record)) continue
        const next = { ...record, syncStatus: 'pending' as const }
        await table.put(next)
        const queueItem: SyncQueueItem = { ...baseRecord(), entity: name, entityId: next.id, operation: next.deletedAt ? 'delete' : 'upsert', payload: next }
        await db.syncQueue.put(queueItem)
        imported += 1
      }
    }
  })
  return imported
}

export async function clearLocalArchive() {
  await db.transaction('rw', [...tables.map((name) => db.table(name)), db.syncQueue], async () => {
    for (const name of tables) await db.table(name).clear()
    await db.syncQueue.clear()
  })
  const myRideKeys = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index)).filter((key): key is string => Boolean(key?.startsWith('myride-')))
  for (const key of myRideKeys) localStorage.removeItem(key)
}
