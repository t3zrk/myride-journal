import type { FuelLog, GpsPoint, MaintenanceLog, Trip, WeatherSnapshot } from '../types/myride'
import { formatKm, formatMileage } from '../utils/record'
import { fuelAnalytics } from './fuel/calculations'
import { isRainWeatherCode } from './weather/analysis'

export type MilestoneCategory = 'Distance & Endurance' | 'Terrain & High Altitude' | 'Weather & Elements' | 'Motorcycle Discipline' | 'Exploration & Journey'

export interface Milestone {
  label: string
  category: MilestoneCategory
  unlockedAt: string
  detail: string
}

export const lifetimeDistanceThresholds = [1000, 5000, 10000] as const

interface MilestoneData {
  trips: Trip[]
  fuelLogs: FuelLog[]
  weather: WeatherSnapshot[]
  maintenance: MaintenanceLog[]
  gpsPoints?: GpsPoint[]
}

export function deriveMilestones({ trips, fuelLogs, weather, maintenance, gpsPoints = [] }: MilestoneData) {
  const completed = [...trips]
    .filter((trip) => trip.status === 'Completed')
    .sort((a, b) => (a.endDate ?? a.startDate).localeCompare(b.endDate ?? b.startDate))
  const milestones: Milestone[] = []
  const first = completed[0]
  if (first) milestones.push({ label: 'First completed trip', category: 'Exploration & Journey', unlockedAt: first.endDate ?? first.startDate, detail: first.title })

  let cumulativeKm = 0
  const crossed = new Set<number>()
  for (const trip of completed) {
    cumulativeKm += trip.distanceKm ?? 0
    for (const threshold of lifetimeDistanceThresholds) {
      if (cumulativeKm >= threshold && !crossed.has(threshold)) {
        crossed.add(threshold)
        milestones.push({ label: `${threshold.toLocaleString()} km lifetime`, category: 'Distance & Endurance', unlockedAt: trip.endDate ?? trip.startDate, detail: `${trip.title} brought the record to ${formatKm(cumulativeKm)}` })
      }
    }
  }

  const longDay = completed.find((trip) => (trip.distanceKm ?? 0) >= 500 && trip.endDate && Date.parse(trip.endDate) - Date.parse(trip.startDate) <= 24 * 60 * 60 * 1000)
  if (longDay) milestones.push({ label: '500 km day', category: 'Distance & Endurance', unlockedAt: longDay.endDate!, detail: `${longDay.title}: ${formatKm(longDay.distanceKm)}` })
  const longest = [...completed].sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))[0]
  if ((longest?.distanceKm ?? 0) > 0) milestones.push({ label: 'Longest trip', category: 'Distance & Endurance', unlockedAt: longest.endDate ?? longest.startDate, detail: `${longest.title}: ${formatKm(longest.distanceKm)}` })
  const multiDay = completed.find((trip) => trip.endDate && Date.parse(trip.endDate) - Date.parse(trip.startDate) > 24 * 60 * 60 * 1000)
  if (multiDay) milestones.push({ label: 'Multi-day journey', category: 'Exploration & Journey', unlockedAt: multiDay.endDate!, detail: multiDay.title })
  const dawn = completed.find((trip) => { const hour = new Date(trip.startDate).getHours(); return hour >= 4 && hour < 7 })
  if (dawn) milestones.push({ label: 'Dawn ride', category: 'Exploration & Journey', unlockedAt: dawn.endDate ?? dawn.startDate, detail: dawn.title })
  const night = completed.find((trip) => { const hour = new Date(trip.startDate).getHours(); return hour >= 20 || hour < 4 })
  if (night) milestones.push({ label: 'Night ride', category: 'Exploration & Journey', unlockedAt: night.endDate ?? night.startDate, detail: night.title })

  const wet = [...weather].filter((item) => isRainWeatherCode(item.weatherCode)).sort((a, b) => a.timestamp.localeCompare(b.timestamp))[0]
  if (wet) milestones.push({ label: 'Rain recorded', category: 'Weather & Elements', unlockedAt: wet.timestamp, detail: wet.precipitationMm === undefined ? 'Rain conditions reported in a trip snapshot' : `${wet.precipitationMm} mm precipitation in a trip snapshot` })
  const highest = [...gpsPoints].filter((point) => point.altitude !== null && point.altitude !== undefined).sort((a, b) => (b.altitude ?? 0) - (a.altitude ?? 0))[0]
  if (highest?.altitude !== undefined && highest.altitude !== null) {
    milestones.push({ label: 'Highest recorded elevation', category: 'Terrain & High Altitude', unlockedAt: highest.timestamp, detail: `${highest.altitude.toFixed(0)} m from GPS` })
    if (highest.altitude >= 2500) milestones.push({ label: 'High altitude ride', category: 'Terrain & High Altitude', unlockedAt: highest.timestamp, detail: `${highest.altitude.toFixed(0)} m recorded by GPS` })
  }

  const analytics = fuelAnalytics(fuelLogs)
  if (analytics.verifiedIntervals) {
    const firstVerified = analytics.intervals
      .map((interval) => fuelLogs.find((log) => log.id === interval.endFuelId))
      .filter((log): log is FuelLog => log !== undefined)
      .sort((a, b) => a.dateTime.localeCompare(b.dateTime))[0]
    if (firstVerified) milestones.push({ label: 'Verified mileage', category: 'Motorcycle Discipline', unlockedAt: firstVerified.dateTime, detail: `${analytics.verifiedIntervals} intervals, ${formatMileage(analytics.averageMileage)}` })
  }
  const firstService = [...maintenance].sort((a, b) => a.date.localeCompare(b.date))[0]
  if (firstService) milestones.push({ label: 'First recorded service', category: 'Motorcycle Discipline', unlockedAt: firstService.date, detail: firstService.component })

  return milestones
}

export function completedDistanceKm(trips: Trip[]) {
  return trips.filter((trip) => trip.status === 'Completed').reduce((sum, trip) => sum + (trip.distanceKm ?? 0), 0)
}
