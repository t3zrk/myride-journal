import type { BaseRecord } from '../types/myride'

export type DomainEntity =
  | 'profiles'
  | 'settings'
  | 'motorcycles'
  | 'trips'
  | 'plannedStops'
  | 'gpsPoints'
  | 'fuelLogs'
  | 'expenseLogs'
  | 'rideEvents'
  | 'maintenanceLogs'
  | 'weatherSnapshots'
  | 'photos'
  | 'emergencyContacts'
  | 'readinessChecks'

type RuntimeRecord = BaseRecord & Record<string, unknown>

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const tripStatuses = ['Planned', 'Active', 'Completed', 'Cancelled'] as const
const expenseCategories = ['fuel', 'stay', 'food', 'tea', 'snacks', 'tolls', 'parking', 'maintenance', 'accessories', 'repairs', 'other'] as const
const paymentMethods = ['UPI', 'Cash', 'Card', 'Other'] as const

function invalid(entity: DomainEntity, message: string): never {
  throw new Error(`Invalid ${entity} record: ${message}.`)
}

function text(entity: DomainEntity, record: RuntimeRecord, field: string) {
  const value = record[field]
  if (typeof value !== 'string' || !value.trim()) invalid(entity, `${field} is required`)
  return value
}

function optionalText(entity: DomainEntity, record: RuntimeRecord, field: string) {
  const value = record[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') invalid(entity, `${field} must be text`)
  return value
}

function uuid(entity: DomainEntity, record: RuntimeRecord, field: string) {
  const value = text(entity, record, field)
  if (!uuidPattern.test(value)) invalid(entity, `${field} must be a UUID`)
  return value
}

function optionalUuid(entity: DomainEntity, record: RuntimeRecord, field: string) {
  const value = record[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string' || !uuidPattern.test(value)) invalid(entity, `${field} must be a UUID`)
  return value
}

function boolean(entity: DomainEntity, record: RuntimeRecord, field: string) {
  const value = record[field]
  if (typeof value !== 'boolean') invalid(entity, `${field} must be true or false`)
  return value
}

function date(entity: DomainEntity, record: RuntimeRecord, field: string) {
  const value = record[field]
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) invalid(entity, `${field} must be a valid date`)
  return value
}

function optionalDate(entity: DomainEntity, record: RuntimeRecord, field: string) {
  const value = record[field]
  if (value === undefined || value === null || value === '') return undefined
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) invalid(entity, `${field} must be a valid date`)
  return value
}

function number(entity: DomainEntity, record: RuntimeRecord, field: string) {
  const value = record[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(entity, `${field} must be a finite number`)
  return value
}

function optionalNumber(entity: DomainEntity, record: RuntimeRecord, field: string) {
  const value = record[field]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) invalid(entity, `${field} must be a finite number`)
  return value
}

function minimum(entity: DomainEntity, record: RuntimeRecord, field: string, minimumValue: number, required = false) {
  const value = required ? number(entity, record, field) : optionalNumber(entity, record, field)
  if (value !== undefined && value < minimumValue) invalid(entity, `${field} must be at least ${minimumValue}`)
  return value
}

function range(entity: DomainEntity, record: RuntimeRecord, field: string, minimumValue: number, maximumValue: number, required = false) {
  const value = required ? number(entity, record, field) : optionalNumber(entity, record, field)
  if (value !== undefined && (value < minimumValue || value > maximumValue)) invalid(entity, `${field} must be between ${minimumValue} and ${maximumValue}`)
  return value
}

function oneOf(entity: DomainEntity, record: RuntimeRecord, field: string, values: readonly string[]) {
  const value = record[field]
  if (typeof value !== 'string' || !values.includes(value)) invalid(entity, `${field} is not supported`)
  return value
}

function coordinates(entity: DomainEntity, record: RuntimeRecord, latitudeField = 'latitude', longitudeField = 'longitude', required = false) {
  const latitude = optionalNumber(entity, record, latitudeField)
  const longitude = optionalNumber(entity, record, longitudeField)
  if (required && (latitude === undefined || longitude === undefined)) invalid(entity, 'latitude and longitude are required')
  if ((latitude === undefined) !== (longitude === undefined)) invalid(entity, 'latitude and longitude must be provided together')
  if (latitude !== undefined && (latitude < -90 || latitude > 90)) invalid(entity, `${latitudeField} must be between -90 and 90`)
  if (longitude !== undefined && (longitude < -180 || longitude > 180)) invalid(entity, `${longitudeField} must be between -180 and 180`)
}

function location(entity: DomainEntity, record: RuntimeRecord, field: string) {
  const value = record[field]
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(entity, `${field} is required`)
  const place = value as Record<string, unknown>
  if (typeof place.label !== 'string' || !place.label.trim()) invalid(entity, `${field}.label is required`)
  const latitude = place.latitude
  const longitude = place.longitude
  const latitudeMissing = latitude === undefined || latitude === null
  const longitudeMissing = longitude === undefined || longitude === null
  if (latitudeMissing !== longitudeMissing) invalid(entity, `${field} coordinates must be provided together`)
  if (!latitudeMissing && (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90)) invalid(entity, `${field}.latitude must be between -90 and 90`)
  if (!longitudeMissing && (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180)) invalid(entity, `${field}.longitude must be between -180 and 180`)
}

function validateBase(entity: DomainEntity, record: RuntimeRecord) {
  uuid(entity, record, 'id')
  text(entity, record, 'userId')
  const createdAt = date(entity, record, 'createdAt')
  const updatedAt = date(entity, record, 'updatedAt')
  const deletedAt = optionalDate(entity, record, 'deletedAt')
  if (Date.parse(updatedAt) < Date.parse(createdAt)) invalid(entity, 'updatedAt cannot be earlier than createdAt')
  if (deletedAt && (Date.parse(deletedAt) < Date.parse(createdAt) || Date.parse(deletedAt) > Date.parse(updatedAt))) invalid(entity, 'deletedAt must be between createdAt and updatedAt')
  oneOf(entity, record, 'syncStatus', ['pending', 'synced', 'error'])
}

export function validateDomainRecord(entity: DomainEntity, value: BaseRecord) {
  const record = value as RuntimeRecord
  validateBase(entity, record)

  switch (entity) {
    case 'profiles':
      text(entity, record, 'name')
      for (const field of ['bio', 'ridingStyle', 'photoDataUrl', 'homeBase', 'bloodGroup', 'allergies', 'medicalNotes']) optionalText(entity, record, field)
      boolean(entity, record, 'aiSensitiveAccess')
      break
    case 'settings': {
      oneOf(entity, record, 'distanceUnit', ['km', 'mi'])
      oneOf(entity, record, 'fuelUnit', ['litre', 'gallon'])
      oneOf(entity, record, 'temperatureUnit', ['C', 'F'])
      oneOf(entity, record, 'dateFormat', ['local', 'iso'])
      oneOf(entity, record, 'aiProvider', ['local', 'openai', 'gemini', 'anthropic', 'xai', 'openrouter', 'custom'])
      const currency = text(entity, record, 'currency')
      if (!/^[A-Z]{3}$/.test(currency)) invalid(entity, 'currency must be a three-letter uppercase code')
      const interval = number(entity, record, 'gpsIntervalSeconds')
      if (![30, 60, 120].includes(interval)) invalid(entity, 'gpsIntervalSeconds must be 30, 60, or 120')
      range(entity, record, 'safeRangeReservePercent', 0, 50, true)
      boolean(entity, record, 'aiEnabled')
      boolean(entity, record, 'maintenanceRemindersEnabled')
      break
    }
    case 'motorcycles': {
      text(entity, record, 'manufacturer')
      text(entity, record, 'model')
      minimum(entity, record, 'currentOdometerKm', 0, true)
      minimum(entity, record, 'engineCapacityCc', 1)
      minimum(entity, record, 'tankCapacityLitres', 0.1)
      minimum(entity, record, 'serviceIntervalKm', 1)
      for (const field of ['variant', 'registration', 'nickname', 'fuelType', 'tyreInformation', 'photoDataUrl', 'notes']) optionalText(entity, record, field)
      const year = optionalNumber(entity, record, 'year')
      if (year !== undefined && (!Number.isInteger(year) || year < 1885 || year > new Date().getFullYear() + 1)) invalid(entity, 'year is outside the supported range')
      boolean(entity, record, 'active')
      break
    }
    case 'trips': {
      text(entity, record, 'title')
      const start = date(entity, record, 'startDate')
      const end = optionalDate(entity, record, 'endDate')
      const status = oneOf(entity, record, 'status', tripStatuses)
      location(entity, record, 'origin')
      location(entity, record, 'destination')
      optionalUuid(entity, record, 'motorcycleId')
      optionalText(entity, record, 'notes')
      minimum(entity, record, 'distanceKm', 0)
      minimum(entity, record, 'durationMinutes', 0)
      if (end && Date.parse(end) < Date.parse(start)) invalid(entity, 'endDate cannot be earlier than startDate')
      if (status === 'Completed' && !end) invalid(entity, 'completed trips require an endDate')
      break
    }
    case 'plannedStops':
      uuid(entity, record, 'tripId')
      text(entity, record, 'label')
      coordinates(entity, record)
      optionalDate(entity, record, 'plannedAt')
      optionalText(entity, record, 'notes')
      break
    case 'gpsPoints':
      uuid(entity, record, 'tripId')
      coordinates(entity, record, 'latitude', 'longitude', true)
      date(entity, record, 'timestamp')
      minimum(entity, record, 'accuracy', 0)
      minimum(entity, record, 'speed', 0)
      range(entity, record, 'heading', 0, 360)
      optionalNumber(entity, record, 'altitude')
      break
    case 'fuelLogs':
      uuid(entity, record, 'motorcycleId')
      optionalUuid(entity, record, 'tripId')
      date(entity, record, 'dateTime')
      minimum(entity, record, 'odometerKm', 0, true)
      minimum(entity, record, 'litres', Number.EPSILON, true)
      minimum(entity, record, 'pricePerLitre', 0)
      minimum(entity, record, 'totalCost', 0)
      optionalText(entity, record, 'station')
      optionalText(entity, record, 'notes')
      boolean(entity, record, 'fullTank')
      break
    case 'expenseLogs': {
      minimum(entity, record, 'amount', Number.EPSILON, true)
      const currency = text(entity, record, 'currency')
      if (!/^[A-Z]{3}$/.test(currency)) invalid(entity, 'currency must be a three-letter uppercase code')
      date(entity, record, 'date')
      optionalUuid(entity, record, 'tripId')
      optionalUuid(entity, record, 'motorcycleId')
      oneOf(entity, record, 'category', expenseCategories)
      oneOf(entity, record, 'paymentMethod', paymentMethods)
      optionalText(entity, record, 'notes')
      break
    }
    case 'rideEvents':
      uuid(entity, record, 'tripId')
      oneOf(entity, record, 'type', ['checkpoint', 'stop', 'event'])
      text(entity, record, 'title')
      date(entity, record, 'timestamp')
      coordinates(entity, record)
      optionalText(entity, record, 'notes')
      optionalText(entity, record, 'locationName')
      minimum(entity, record, 'distanceFromStartKm', 0)
      minimum(entity, record, 'distanceFromPreviousKm', 0)
      break
    case 'maintenanceLogs':
      uuid(entity, record, 'motorcycleId')
      date(entity, record, 'date')
      minimum(entity, record, 'odometerKm', 0, true)
      text(entity, record, 'serviceType')
      text(entity, record, 'component')
      minimum(entity, record, 'cost', 0)
      optionalText(entity, record, 'workshop')
      optionalText(entity, record, 'notes')
      break
    case 'weatherSnapshots':
      uuid(entity, record, 'tripId')
      date(entity, record, 'timestamp')
      coordinates(entity, record, 'latitude', 'longitude', true)
      optionalNumber(entity, record, 'temperatureC')
      minimum(entity, record, 'precipitationMm', 0)
      minimum(entity, record, 'windKph', 0)
      range(entity, record, 'humidityPercent', 0, 100)
      optionalText(entity, record, 'summary')
      break
    case 'photos':
      uuid(entity, record, 'tripId')
      optionalUuid(entity, record, 'rideEventId')
      date(entity, record, 'takenAt')
      coordinates(entity, record)
      for (const field of ['dataUrl', 'thumbnailDataUrl', 'storagePath', 'caption']) optionalText(entity, record, field)
      if (record.locationSource !== undefined && record.locationSource !== null) oneOf(entity, record, 'locationSource', ['exif', 'trip-gps', 'manual'])
      if (record.locationSource && (record.latitude === undefined || record.longitude === undefined)) invalid(entity, 'locationSource requires coordinates')
      break
    case 'emergencyContacts':
      text(entity, record, 'name')
      text(entity, record, 'phone')
      optionalText(entity, record, 'relationship')
      optionalText(entity, record, 'notes')
      break
    case 'readinessChecks':
      if (!record.tripId && !record.motorcycleId) invalid(entity, 'a tripId or motorcycleId is required')
      optionalUuid(entity, record, 'tripId')
      optionalUuid(entity, record, 'motorcycleId')
      text(entity, record, 'item')
      if (boolean(entity, record, 'checked') && !optionalDate(entity, record, 'checkedAt')) invalid(entity, 'checkedAt is required when checked')
      else optionalDate(entity, record, 'checkedAt')
      break
  }
}
