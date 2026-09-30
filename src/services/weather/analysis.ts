import type { GpsPoint, WeatherSnapshot } from '../../types/myride'
import { haversineKm } from '../../utils/distance'

type TrackPoint = Pick<GpsPoint, 'timestamp' | 'latitude' | 'longitude'>
type Sample = Pick<WeatherSnapshot, 'timestamp' | 'precipitationMm' | 'weatherCode' | 'temperatureC' | 'windKph'>

export function isRainWeatherCode(code?: number) {
  return code !== undefined && [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(code)
}

export function analyzeWeatherExposure(points: TrackPoint[], samples: Sample[]) {
  const track = [...points].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  const weather = [...samples].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  let ridingMinutes = 0
  let coveredMinutes = 0
  let rainMinutes = 0
  let wetMinutes = 0
  let wetDistanceKm = 0
  let heatMinutes = 0
  let windMinutes = 0
  let wetRoadPeriods = 0
  let inWetPeriod = false
  const temperatures: number[] = []
  let sampleIndex = 0

  for (let index = 1; index < track.length; index += 1) {
    const previous = track[index - 1]
    const current = track[index]
    const start = Date.parse(previous.timestamp)
    const end = Date.parse(current.timestamp)
    const minutes = (end - start) / 60000
    const distanceKm = haversineKm(previous, current)
    if (!Number.isFinite(minutes) || minutes <= 0 || minutes > 30 || distanceKm < 0.02) { inWetPeriod = false; continue }
    ridingMinutes += minutes
    const midpoint = (start + end) / 2
    while (sampleIndex + 1 < weather.length && Date.parse(weather[sampleIndex + 1].timestamp) <= midpoint) sampleIndex += 1
    const closest = [weather[sampleIndex], weather[sampleIndex + 1]].filter((item): item is Sample => Boolean(item)).sort((a, b) => Math.abs(Date.parse(a.timestamp) - midpoint) - Math.abs(Date.parse(b.timestamp) - midpoint))[0]
    if (!closest || Math.abs(Date.parse(closest.timestamp) - midpoint) > 15 * 60000) { inWetPeriod = false; continue }
    coveredMinutes += minutes
    if (closest.temperatureC !== undefined) temperatures.push(closest.temperatureC)
    if ((closest.temperatureC ?? -Infinity) >= 35) heatMinutes += minutes
    if ((closest.windKph ?? -Infinity) >= 40) windMinutes += minutes
    const rainy = isRainWeatherCode(closest.weatherCode)
    const wet = rainy || (closest.precipitationMm ?? 0) > 0
    if (rainy) rainMinutes += minutes
    if (wet) {
      wetMinutes += minutes
      wetDistanceKm += distanceKm
      if (!inWetPeriod) wetRoadPeriods += 1
    }
    inWetPeriod = wet
  }

  return {
    sufficient: weather.length >= 2 && coveredMinutes >= 30 && coveredMinutes / Math.max(ridingMinutes, 1) >= 0.5,
    ridingMinutes,
    coveredMinutes,
    rainMinutes,
    wetMinutes,
    heatMinutes,
    windMinutes,
    wetRoadPeriods,
    wetAverageSpeedKph: wetMinutes > 0 ? wetDistanceKm / (wetMinutes / 60) : undefined,
    minimumTemperatureC: temperatures.length ? Math.min(...temperatures) : undefined,
    maximumTemperatureC: temperatures.length ? Math.max(...temperatures) : undefined,
  }
}
