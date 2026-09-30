export async function getCurrentWeather(latitude: number, longitude: number) {
  const key = `myride-weather-${latitude.toFixed(2)}-${longitude.toFixed(2)}`
  const cached = localStorage.getItem(key)
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { at?: unknown; result?: ReturnType<typeof weatherResult> }
      if (typeof parsed.at === 'number' && isWeatherResult(parsed.result) && Date.now() - parsed.at < 10 * 60 * 1000) return parsed.result
    } catch {
      localStorage.removeItem(key)
    }
  }
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), 15000)
  const response = await fetch(
    `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,precipitation,wind_speed_10m,relative_humidity_2m,weather_code`,
    { signal: controller.signal },
  ).finally(() => window.clearTimeout(timeout))
  if (!response.ok) throw new Error('Weather unavailable')
  const data = (await response.json()) as {
    current?: { temperature_2m?: number; precipitation?: number; wind_speed_10m?: number; relative_humidity_2m?: number; weather_code?: number }
  }
  const result = weatherResult(data.current)
  if ([result.temperatureC, result.precipitationMm, result.windKph, result.humidityPercent, result.weatherCode].every((value) => value === undefined)) throw new Error('Weather unavailable')
  try { localStorage.setItem(key, JSON.stringify({ at: Date.now(), result })) } catch { /* Weather remains usable when the cache is full. */ }
  return result
}

function isWeatherResult(value: unknown): value is ReturnType<typeof weatherResult> {
  if (!value || typeof value !== 'object') return false
  const result = value as Record<string, unknown>
  const fields = ['temperatureC', 'precipitationMm', 'windKph', 'humidityPercent', 'weatherCode']
  return typeof result.summary === 'string'
    && fields.every((field) => result[field] === undefined || (typeof result[field] === 'number' && Number.isFinite(result[field])))
    && fields.some((field) => result[field] !== undefined)
}

function weatherResult(current?: { temperature_2m?: number; precipitation?: number; wind_speed_10m?: number; relative_humidity_2m?: number; weather_code?: number }) {
  return { temperatureC: current?.temperature_2m, precipitationMm: current?.precipitation, windKph: current?.wind_speed_10m, humidityPercent: current?.relative_humidity_2m, weatherCode: current?.weather_code, summary: weatherCondition(current?.weather_code) }
}

export function weatherCondition(code?: number) {
  if (code === undefined) return 'Condition unavailable'
  if (code === 0) return 'Clear sky'
  if (code === 1) return 'Mainly clear'
  if (code === 2) return 'Partly cloudy'
  if (code === 3) return 'Overcast'
  if (code === 45 || code === 48) return 'Fog'
  if ([51, 53, 55, 56, 57].includes(code)) return 'Drizzle'
  if ([61, 63, 65, 66, 67].includes(code)) return 'Rain'
  if ([71, 73, 75, 77, 85, 86].includes(code)) return 'Snow'
  if ([80, 81, 82].includes(code)) return 'Rain showers'
  if ([95, 96, 99].includes(code)) return 'Thunderstorm'
  return 'Condition unavailable'
}
