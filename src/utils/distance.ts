import type { GpsPoint, RideEvent } from '../types/myride'

const EARTH_RADIUS_KM = 6371

export function haversineKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const dLat = toRad(b.latitude - a.latitude)
  const dLon = toRad(b.longitude - a.longitude)
  const lat1 = toRad(a.latitude)
  const lat2 = toRad(b.latitude)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h))
}

export function routeDistanceKm(points: Array<Pick<GpsPoint, 'latitude' | 'longitude'>>) {
  return points.reduce((total, point, index) => {
    if (index === 0) return 0
    return total + haversineKm(points[index - 1], point)
  }, 0)
}

export function distanceFromPreviousEvent(events: RideEvent[], next: { latitude: number; longitude: number }) {
  const previous = [...events]
    .filter((event) => event.latitude !== undefined && event.longitude !== undefined)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp))
    .at(-1)
  if (previous?.latitude === undefined || previous.longitude === undefined) return undefined
  return haversineKm({ latitude: previous.latitude, longitude: previous.longitude }, next)
}

function toRad(value: number) {
  return (value * Math.PI) / 180
}
