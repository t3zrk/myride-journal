import { haversineKm } from '../../utils/distance'

interface OverpassElement {
  lat?: number
  lon?: number
  center?: { lat: number; lon: number }
  tags?: { name?: string; opening_hours?: string }
}

interface FuelStation {
  latitude: number
  longitude: number
  name?: string
  openingHours?: string
  distanceKm: number
}

function cachedStation(key: string) {
  const cached = localStorage.getItem(key)
  if (!cached) return undefined
  try {
    const parsed = JSON.parse(cached) as { at?: unknown; station?: FuelStation | null }
    if (typeof parsed.at !== 'number' || Date.now() - parsed.at >= 24 * 60 * 60 * 1000) return undefined
    if (parsed.station === null) return null
    if (parsed.station && Number.isFinite(parsed.station.latitude) && Number.isFinite(parsed.station.longitude) && Number.isFinite(parsed.station.distanceKm)) return parsed.station
  } catch {
    localStorage.removeItem(key)
  }
  return undefined
}

export async function nearestFuelStation(latitude: number, longitude: number) {
  const key = `myride-fuel-station-${latitude.toFixed(2)}-${longitude.toFixed(2)}`
  const cached = cachedStation(key)
  if (cached !== undefined) return cached ?? undefined
  const query = `[out:json][timeout:20];(node(around:15000,${latitude},${longitude})[amenity=fuel];way(around:15000,${latitude},${longitude})[amenity=fuel];);out center 100;`
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 25000)
  const response = await fetch(`https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`, { headers: { Accept: 'application/json' }, signal: controller.signal }).finally(() => window.clearTimeout(timeout))
  if (!response.ok) throw new Error('Fuel station information unavailable.')
  const data = await response.json() as { elements?: OverpassElement[] }
  const stations = (data.elements ?? []).map((item) => ({
    latitude: item.lat ?? item.center?.lat,
    longitude: item.lon ?? item.center?.lon,
    name: item.tags?.name,
    openingHours: item.tags?.opening_hours,
  })).filter((item): item is { latitude: number; longitude: number; name: string | undefined; openingHours: string | undefined } => Number.isFinite(item.latitude) && Number.isFinite(item.longitude) && item.latitude! >= -90 && item.latitude! <= 90 && item.longitude! >= -180 && item.longitude! <= 180)
  const station = stations.map((item) => ({ ...item, distanceKm: haversineKm({ latitude, longitude }, item) })).sort((a, b) => a.distanceKm - b.distanceKm)[0]
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), station: station ?? null })) } catch { /* Nearby lookup remains usable when the cache is full. */ }
  return station
}
