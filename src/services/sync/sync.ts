import type { Table } from 'dexie'
import { db } from '../../db/myrideDb'
import { supabase } from '../../lib/supabase'
import { useUiStore } from '../../stores/uiStore'
import type { BaseRecord, SyncQueueItem, TripPhoto } from '../../types/myride'
import type { UserSettings } from '../../types/myride'
import { cacheDisplaySettings } from '../../utils/record'
import { validateDomainRecord } from '../domainValidation'

const entityTables = [
  ['profiles', 'profiles'], ['settings', 'user_settings'], ['motorcycles', 'motorcycles'],
  ['trips', 'trips'], ['plannedStops', 'planned_stops'], ['gpsPoints', 'gps_points'],
  ['fuelLogs', 'fuel_logs'], ['expenseLogs', 'expense_logs'], ['rideEvents', 'ride_events'],
  ['maintenanceLogs', 'maintenance_logs'], ['weatherSnapshots', 'weather_snapshots'],
  ['photos', 'photos'], ['emergencyContacts', 'emergency_contacts'], ['readinessChecks', 'readiness_checks'],
] as const

type Entity = (typeof entityTables)[number][0]
const remoteByEntity = new Map<string, string>(entityTables)
let running: Promise<void> | undefined

function localTable(entity: Entity): Table<BaseRecord, string> {
  return db.table<BaseRecord, string>(entity)
}

function snakeCase(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)
}

function camelCase(key: string) {
  return key.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase())
}

function toRemote(record: BaseRecord, userId: string) {
  const row: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(record)) {
    if (key === 'syncStatus' || key === 'dataUrl') continue
    row[snakeCase(key)] = value === undefined ? null : value
  }
  row.user_id = userId
  return row
}

function toLocal(row: Record<string, unknown>): BaseRecord {
  const record: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) record[camelCase(key)] = value === null ? undefined : value
  record.syncStatus = 'synced'
  return record as unknown as BaseRecord
}

function activationRank(item: SyncQueueItem) {
  const payload = item.payload as Record<string, unknown> | undefined
  if (item.entity === 'motorcycles') return payload?.active === true ? 1 : 0
  if (item.entity === 'trips') return payload?.status === 'Active' ? 1 : 0
  return 0
}

function deleteQueuedRecord(entity: Entity, entityId: string) {
  return db.syncQueue.where('entityId').equals(entityId).and((item) => item.entity === entity).delete()
}

async function photoUpload(record: TripPhoto, userId: string) {
  if (record.storagePath?.startsWith(`${userId}/`)) return record.storagePath
  if (!supabase || !record.dataUrl) throw new Error('Photo has no image data to upload')
  const blob = await fetch(record.dataUrl).then((response) => response.blob())
  const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/jpeg' ? 'jpg' : 'webp'
  const path = `${userId}/${record.tripId}/${record.id}.${extension}`
  const { error } = await supabase.storage.from('trip-photos').upload(path, blob, { contentType: blob.type || 'image/webp', upsert: true })
  if (error) throw error
  return path
}

async function photoDownload(path: string) {
  if (!supabase) throw new Error('Cloud photo storage is unavailable')
  const { data, error } = await supabase.storage.from('trip-photos').download(path)
  if (error) throw error
  if (!data) throw new Error('Cloud photo could not be downloaded')
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(data)
  })
}

async function pushItem(item: SyncQueueItem, userId: string) {
  if (!supabase) return
  if (!await db.syncQueue.get(item.id)) return
  const entity = item.entity as Entity
  const remote = remoteByEntity.get(entity)
  if (!remote) return
  const table = localTable(entity)
  const record = await table.get(item.entityId)
  if (!record) { await db.syncQueue.delete(item.id); return }

  const { data: existing, error: readError } = await supabase.from(remote).select('updated_at').eq('id', record.id).maybeSingle()
  if (readError) throw readError
  if (existing?.updated_at && Date.parse(existing.updated_at) > Date.parse(record.updatedAt)) {
    await deleteQueuedRecord(entity, record.id)
    return
  }

  const row = toRemote(record, userId)
  if (entity === 'photos') {
    const photo = record as TripPhoto
    row.storage_path = photo.deletedAt ? photo.storagePath ?? null : await photoUpload(photo, userId)
  }
  const { error } = await supabase.from(remote).upsert(row, { onConflict: 'id' })
  if (error) throw error
  if (entity === 'photos' && record.deletedAt && (record as TripPhoto).storagePath) {
    const { error: storageError } = await supabase.storage.from('trip-photos').remove([(record as TripPhoto).storagePath!])
    if (storageError) throw storageError
  }
  await db.transaction('rw', table, db.syncQueue, async () => {
    const current = await table.get(record.id)
    if (current?.updatedAt === record.updatedAt) {
      await table.put({ ...current, ...(entity === 'photos' ? { storagePath: row.storage_path } : {}), userId, syncStatus: 'synced' })
      await deleteQueuedRecord(entity, record.id)
    } else {
      await db.syncQueue.delete(item.id)
    }
  })
}

async function pullEntity(entity: Entity, remote: string, userId: string) {
  if (!supabase) return
  const table = localTable(entity)
  let start = 0
  while (true) {
    const { data, error } = await supabase.from(remote).select('*').eq('user_id', userId).order('created_at').order('id').range(start, start + 499)
    if (error) throw error
    for (const row of data ?? []) {
      const remoteRecord = toLocal(row)
      const local = await table.get(remoteRecord.id)
      if (local?.syncStatus === 'pending' && Date.parse(local.updatedAt) >= Date.parse(remoteRecord.updatedAt)) continue
      if (entity === 'photos' && !remoteRecord.deletedAt && !row.storage_path && !local?.['dataUrl' as keyof BaseRecord]) throw new Error('Cloud photo has no image data')
      if (entity === 'photos' && !remoteRecord.deletedAt && row.storage_path && !local?.['dataUrl' as keyof BaseRecord]) {
        ;(remoteRecord as TripPhoto).dataUrl = await photoDownload(String(row.storage_path))
      } else if (entity === 'photos' && !remoteRecord.deletedAt && local?.['dataUrl' as keyof BaseRecord]) {
        ;(remoteRecord as TripPhoto).dataUrl = String(local['dataUrl' as keyof BaseRecord])
      }
      validateDomainRecord(entity, remoteRecord)
      await table.put(remoteRecord)
      if (entity === 'settings') cacheDisplaySettings(remoteRecord as UserSettings)
      await deleteQueuedRecord(entity, remoteRecord.id)
    }
    if (!data || data.length < 500) break
    start += 500
  }
}

async function runSync() {
  if (!supabase || !navigator.onLine) return
  const setStatus = useUiStore.getState().setSyncMessage
  setStatus('Syncing...')
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) throw error
    if (!user) throw new Error('Sign in is required to sync')
    const pending = await db.syncQueue.toArray()
    const priority = new Map(entityTables.map(([entity], index) => [entity, index]))
    pending.sort((a, b) => (priority.get(a.entity as Entity) ?? 99) - (priority.get(b.entity as Entity) ?? 99) || activationRank(a) - activationRank(b) || a.createdAt.localeCompare(b.createdAt))
    for (const item of pending) await pushItem(item, user.id)
    for (const [entity, remote] of entityTables) await pullEntity(entity, remote, user.id)
    setStatus('Synced')
    window.dispatchEvent(new Event('myride:synced'))
  } catch (cause) {
    setStatus('Sync error')
    throw cause
  }
}

export function syncNow() {
  if (!running) running = runSync().finally(() => { running = undefined })
  return running
}
