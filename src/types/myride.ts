export type TripStatus = 'Planned' | 'Active' | 'Completed' | 'Cancelled'
export type ComponentHealth = 'GOOD' | 'DUE SOON' | 'DUE' | 'OVERDUE' | 'UNKNOWN'
export type SyncStatus = 'pending' | 'synced' | 'error'

export interface BaseRecord {
  id: string
  userId: string
  createdAt: string
  updatedAt: string
  deletedAt?: string
  syncStatus: SyncStatus
}

export interface Profile extends BaseRecord {
  name: string
  bio?: string
  ridingStyle?: string
  photoDataUrl?: string
  homeBase?: string
  bloodGroup?: string
  allergies?: string
  medicalNotes?: string
  aiSensitiveAccess: boolean
}

export interface UserSettings extends BaseRecord {
  distanceUnit: 'km' | 'mi'
  fuelUnit: 'litre' | 'gallon'
  temperatureUnit: 'C' | 'F'
  dateFormat: 'local' | 'iso'
  currency: string
  gpsIntervalSeconds: 30 | 60 | 120
  safeRangeReservePercent: number
  aiEnabled: boolean
  aiProvider: 'local' | 'openai'
  maintenanceRemindersEnabled: boolean
}

export interface Motorcycle extends BaseRecord {
  manufacturer: string
  model: string
  variant?: string
  year?: number
  registration?: string
  nickname?: string
  engineCapacityCc?: number
  tankCapacityLitres?: number
  fuelType?: string
  currentOdometerKm: number
  serviceIntervalKm?: number
  tyreInformation?: string
  photoDataUrl?: string
  notes?: string
  active: boolean
}

export interface LocationInput {
  label: string
  latitude?: number
  longitude?: number
}

export interface PlannedStop extends BaseRecord {
  tripId: string
  label: string
  latitude?: number
  longitude?: number
  plannedAt?: string
  notes?: string
}

export interface Trip extends BaseRecord {
  title: string
  startDate: string
  endDate?: string
  origin: LocationInput
  destination: LocationInput
  motorcycleId?: string
  status: TripStatus
  notes?: string
  distanceKm?: number
  durationMinutes?: number
}

export interface GpsPoint extends BaseRecord {
  tripId: string
  latitude: number
  longitude: number
  timestamp: string
  accuracy?: number
  altitude?: number | null
  speed?: number | null
  heading?: number | null
}

export interface RideEvent extends BaseRecord {
  tripId: string
  type: 'checkpoint' | 'stop' | 'event'
  title: string
  notes?: string
  timestamp: string
  latitude?: number
  longitude?: number
  locationName?: string
  distanceFromStartKm?: number
  distanceFromPreviousKm?: number
}

export interface FuelLog extends BaseRecord {
  motorcycleId: string
  tripId?: string
  dateTime: string
  odometerKm: number
  litres: number
  pricePerLitre?: number
  totalCost?: number
  station?: string
  fullTank: boolean
  notes?: string
}

export interface ExpenseLog extends BaseRecord {
  amount: number
  currency: string
  date: string
  category:
    | 'fuel'
    | 'stay'
    | 'food'
    | 'tea'
    | 'snacks'
    | 'tolls'
    | 'parking'
    | 'maintenance'
    | 'accessories'
    | 'repairs'
    | 'other'
  tripId?: string
  motorcycleId?: string
  paymentMethod: 'UPI' | 'Cash' | 'Card' | 'Other'
  notes?: string
}

export interface MaintenanceLog extends BaseRecord {
  motorcycleId: string
  date: string
  odometerKm: number
  serviceType: string
  component: string
  workshop?: string
  cost?: number
  notes?: string
}

export interface WeatherSnapshot extends BaseRecord {
  tripId: string
  timestamp: string
  latitude: number
  longitude: number
  temperatureC?: number
  precipitationMm?: number
  windKph?: number
  humidityPercent?: number
  weatherCode?: number
  summary?: string
}

export interface TripPhoto extends BaseRecord {
  tripId: string
  rideEventId?: string
  dataUrl?: string
  thumbnailDataUrl?: string
  storagePath?: string
  caption?: string
  takenAt: string
  latitude?: number
  longitude?: number
  locationSource?: 'exif' | 'trip-gps' | 'manual'
}

export interface EmergencyContact extends BaseRecord {
  name: string
  relationship?: string
  phone: string
  notes?: string
}

export interface ReadinessCheck extends BaseRecord {
  tripId?: string
  motorcycleId?: string
  item: string
  checked: boolean
  checkedAt?: string
}

export interface SyncQueueItem extends BaseRecord {
  entity: string
  entityId: string
  operation: 'upsert' | 'delete'
  payload: unknown
  error?: string
}

export interface MileageInterval {
  startFuelId: string
  endFuelId: string
  motorcycleId: string
  distanceKm: number
  litres: number
  mileageKmPerLitre: number
  startOdometerKm: number
  endOdometerKm: number
}

export interface RidingStats {
  tripCount: number
  activeTripCount: number
  completedTripCount: number
  totalDistanceKm: number
  totalDurationMinutes: number
  totalFuelLitres: number
  totalFuelCost: number
  lifetimeMileageKmPerLitre?: number
  totalExpenses: number
}
