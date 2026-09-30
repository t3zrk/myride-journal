import type { BaseRecord, UserSettings } from '../types/myride'

const LOCAL_USER_ID = 'local-rider'

function preference(key: string) {
  return typeof localStorage === 'undefined' ? null : localStorage.getItem(key)
}

export function nowIso() {
  return new Date().toISOString()
}

export function createId() {
  return crypto.randomUUID()
}

export function baseRecord(): Pick<BaseRecord, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'syncStatus'> {
  const timestamp = nowIso()
  return {
    id: createId(),
    userId: LOCAL_USER_ID,
    createdAt: timestamp,
    updatedAt: timestamp,
    syncStatus: 'pending',
  }
}

export function touchRecord<T extends BaseRecord>(record: T): T {
  const nextTimestamp = new Date(Math.max(Date.now(), Date.parse(record.updatedAt) + 1)).toISOString()
  return { ...record, updatedAt: nextTimestamp, syncStatus: 'pending' }
}

export function formatKm(value?: number) {
  const miles = preference('myride-distance-unit') === 'mi'
  if (value === undefined || Number.isNaN(value)) return 'Not recorded'
  const distance = miles ? value * 0.621371 : value
  return `${distance.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${miles ? 'mi' : 'km'}`
}

export function formatDuration(minutes?: number) {
  if (minutes === undefined || Number.isNaN(minutes)) return 'Not recorded'
  const hours = Math.floor(minutes / 60)
  const remainder = Math.round(minutes % 60)
  return hours ? `${hours} h ${remainder} min` : `${remainder} min`
}

export function formatSpeed(kph?: number) {
  if (kph === undefined || !Number.isFinite(kph)) return 'Unavailable'
  const miles = preference('myride-distance-unit') === 'mi'
  return `${(miles ? kph * 0.621371 : kph).toFixed(1)} ${miles ? 'mph' : 'km/h'}`
}

export function formatMoney(value: number, currency = preference('myride-currency') || 'INR', fractionDigits = 0) {
  return `${currency} ${value.toLocaleString(undefined, { minimumFractionDigits: fractionDigits, maximumFractionDigits: Math.max(2, fractionDigits) })}`
}

export function formatMileage(value?: number) {
  if (!value || Number.isNaN(value)) return 'Not enough data'
  const miles = preference('myride-distance-unit') === 'mi'
  const gallons = preference('myride-fuel-unit') === 'gallon'
  const converted = value * (miles ? 0.621371 : 1) * (gallons ? 3.78541 : 1)
  return `${converted.toFixed(1)} ${miles ? 'mi' : 'km'}/${gallons ? 'gal' : 'L'}`
}

export function formatFuelVolume(litres: number) {
  const gallons = preference('myride-fuel-unit') === 'gallon'
  return `${(gallons ? litres / 3.78541 : litres).toFixed(1)} ${gallons ? 'gal' : 'L'}`
}

export function formatTemperature(celsius?: number) {
  if (celsius === undefined) return 'Unavailable'
  const fahrenheit = preference('myride-temperature-unit') === 'F'
  return `${Math.round(fahrenheit ? celsius * 9 / 5 + 32 : celsius)} ${fahrenheit ? 'F' : 'C'}`
}

export function formatDate(value: string, withTime = false) {
  const date = new Date(value)
  if (preference('myride-date-format') === 'iso') return withTime ? date.toISOString().slice(0, 16).replace('T', ' ') : date.toISOString().slice(0, 10)
  return withTime ? date.toLocaleString() : date.toLocaleDateString()
}

export function toLocalDateTimeInput(value: string | Date = new Date()) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const part = (number: number) => String(number).padStart(2, '0')
  return `${date.getFullYear()}-${part(date.getMonth() + 1)}-${part(date.getDate())}T${part(date.getHours())}:${part(date.getMinutes())}`
}

export function toLocalDateInput(value: string | Date = new Date()) {
  return toLocalDateTimeInput(value).slice(0, 10)
}

export function cacheDisplaySettings(settings: UserSettings) {
  localStorage.setItem('myride-currency', settings.currency)
  localStorage.setItem('myride-distance-unit', settings.distanceUnit)
  localStorage.setItem('myride-fuel-unit', settings.fuelUnit)
  localStorage.setItem('myride-temperature-unit', settings.temperatureUnit)
  localStorage.setItem('myride-date-format', settings.dateFormat)
}
