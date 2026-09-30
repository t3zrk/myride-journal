const defaultBaseUrl = 'https://nominatim.openstreetmap.org'
const configuredBaseUrl = (import.meta.env.VITE_NOMINATIM_URL as string | undefined)?.trim()
const baseUrl = (configuredBaseUrl || defaultBaseUrl).replace(/\/$/, '')
let requestQueue: Promise<void> = Promise.resolve()
let lastRequestAt = 0

export interface LocationSuggestion {
  label: string
  latitude: number
  longitude: number
}

async function throttledFetch(url: string) {
  let response: Response | undefined
  const request = requestQueue.then(async () => {
    const wait = Math.max(0, 1000 - (Date.now() - lastRequestAt))
    if (wait) await new Promise((resolve) => window.setTimeout(resolve, wait))
    lastRequestAt = Date.now()
    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal }).finally(() => window.clearTimeout(timeout))
  })
  requestQueue = request.catch(() => undefined)
  await request
  return response!
}

function cachedSuggestions(key: string) {
  const cached = localStorage.getItem(key)
  if (!cached) return undefined
  try {
    const parsed = JSON.parse(cached) as LocationSuggestion[]
    if (Array.isArray(parsed) && parsed.every((item) => typeof item.label === 'string' && Number.isFinite(item.latitude) && Number.isFinite(item.longitude))) return parsed
  } catch {
    localStorage.removeItem(key)
  }
  return undefined
}

export async function searchLocations(query: string): Promise<LocationSuggestion[]> {
  const normalized = query.trim().replace(/\s+/g, ' ')
  if (normalized.length < 2) return []
  const key = `myride-geocode-${normalized.toLocaleLowerCase()}`
  const cached = cachedSuggestions(key)
  if (cached) return cached

  const parameters = new URLSearchParams({ format: 'jsonv2', q: normalized, limit: '5' })
  const response = await throttledFetch(`${baseUrl}/search?${parameters}`)
  if (!response.ok) throw new Error('Location search unavailable')
  const data = (await response.json()) as Array<{ display_name?: unknown; lat?: unknown; lon?: unknown }>
  const results = Array.isArray(data) ? data.flatMap((item) => {
    const latitude = Number(item.lat)
    const longitude = Number(item.lon)
    if (typeof item.display_name !== 'string' || !Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return []
    return [{ label: item.display_name, latitude, longitude }]
  }) : []
  try { localStorage.setItem(key, JSON.stringify(results)) } catch { /* Search remains usable when the cache is full. */ }
  return results
}

export async function reverseGeocode(latitude: number, longitude: number) {
  const key = `myride-reverse-${latitude.toFixed(4)}-${longitude.toFixed(4)}`
  const cached = localStorage.getItem(key)
  if (cached) return cached

  const response = await throttledFetch(`${baseUrl}/reverse?format=jsonv2&lat=${latitude}&lon=${longitude}`)
  if (!response.ok) throw new Error('Reverse geocoding unavailable')
  const data = (await response.json()) as { display_name?: string }
  const label = data.display_name ?? `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`
  try { localStorage.setItem(key, label) } catch { /* Reverse geocoding remains usable when the cache is full. */ }
  return label
}
