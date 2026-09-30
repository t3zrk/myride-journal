import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap } from 'react-leaflet'
import { Expand, Minimize, Pause, Play, Route } from 'lucide-react'
import { Button, ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { repository } from '../repositories/localRepository'
import type { FuelLog, GpsPoint, RideEvent, Trip, TripPhoto, WeatherSnapshot } from '../types/myride'
import { haversineKm } from '../utils/distance'
import { formatDate, formatDuration, formatFuelVolume, formatKm, formatSpeed, formatTemperature } from '../utils/record'

type TimelineItem = { id: string; at: string; title: string; detail?: string; imageUrl?: string; fullImageUrl?: string }

function eventLocation(event: RideEvent) {
  if (event.locationName) return event.locationName
  if (event.latitude !== undefined && event.longitude !== undefined) return `${event.latitude.toFixed(5)}, ${event.longitude.toFixed(5)}`
  return undefined
}

function ReplayCamera({ position, positions, follow, playing, fitCount }: { position: [number, number]; positions: [number, number][]; follow: boolean; playing: boolean; fitCount: number }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions, { padding: [24, 24], animate: false })
    else if (positions.length === 1) map.setView(positions[0], 12, { animate: false })
  }, [fitCount, map, positions])
  useEffect(() => { if (follow && playing) map.panTo(position, { animate: true }) }, [follow, map, playing, position])
  return null
}

export function ReplayPage() {
  const { tripId } = useParams()
  const [loadedTripId, setLoadedTripId] = useState<string>()
  const [trip, setTrip] = useState<Trip>()
  const [points, setPoints] = useState<GpsPoint[]>([])
  const [events, setEvents] = useState<RideEvent[]>([])
  const [fuel, setFuel] = useState<FuelLog[]>([])
  const [weather, setWeather] = useState<WeatherSnapshot[]>([])
  const [photos, setPhotos] = useState<TripPhoto[]>([])
  const [index, setIndex] = useState(0)
  const [speed, setSpeed] = useState(1)
  const [playing, setPlaying] = useState(false)
  const [follow, setFollow] = useState(true)
  const [fitCount, setFitCount] = useState(0)
  const [theater, setTheater] = useState(false)

  useEffect(() => {
    if (!tripId) return
    let cancelled = false
    Promise.all([repository.trips.get(tripId), repository.gpsPoints.byTrip(tripId), repository.rideEvents.byTrip(tripId), repository.fuelLogs.byTrip(tripId), repository.weather.byTrip(tripId), repository.photos.byTrip(tripId)]).then(([loadedTrip, loadedPoints, loadedEvents, loadedFuel, loadedWeather, loadedPhotos]) => {
      if (cancelled) return
      setTrip(loadedTrip && !loadedTrip.deletedAt ? loadedTrip : undefined)
      setPoints(loadedPoints)
      setEvents(loadedEvents)
      setFuel(loadedFuel)
      setWeather(loadedWeather)
      setPhotos(loadedPhotos)
      setIndex(0)
      setPlaying(false)
      setLoadedTripId(tripId)
    })
    return () => { cancelled = true }
  }, [tripId])

  const sampledIndices = useMemo(() => {
    const step = Math.max(1, Math.ceil(points.length / 1000))
    const indices: number[] = []
    for (let position = 0; position < points.length; position += step) indices.push(position)
    if (points.length && indices.at(-1) !== points.length - 1) indices.push(points.length - 1)
    return indices
  }, [points])
  const sampled = useMemo(() => sampledIndices.map((pointIndex) => points[pointIndex]), [points, sampledIndices])
  const cumulativeDistanceKm = useMemo(() => {
    const distances: number[] = []
    points.forEach((point, pointIndex) => {
      distances.push((distances.at(-1) ?? 0) + (pointIndex > 0 ? haversineKm(points[pointIndex - 1], point) : 0))
    })
    return distances
  }, [points])
  const positions = useMemo(() => sampled.map((point) => [point.latitude, point.longitude] as [number, number]), [sampled])
  const currentIndex = Math.min(index, Math.max(0, sampled.length - 1))
  const current = sampled[currentIndex]
  const currentDistanceKm = cumulativeDistanceKm[sampledIndices[currentIndex]] ?? 0
  const elapsedMinutes = current ? Math.max(0, Math.round((Date.parse(current.timestamp) - Date.parse(points[0].timestamp)) / 60000)) : 0
  const position = positions[currentIndex]
  const progress = useMemo(() => positions.slice(0, currentIndex + 1), [positions, currentIndex])
  const timeline: TimelineItem[] = useMemo(() => [
    ...(trip && (trip.status === 'Active' || trip.status === 'Completed') ? [{ id: `${trip.id}-started`, at: trip.startDate, title: 'Trip started', detail: trip.origin.label }] : []),
    ...events.map((event) => ({ id: event.id, at: event.timestamp, title: event.title, detail: eventLocation(event) })),
    ...fuel.map((log) => ({ id: log.id, at: log.dateTime, title: `Fuel: ${formatFuelVolume(log.litres)}`, detail: log.station })),
    ...weather.map((item) => ({ id: item.id, at: item.timestamp, title: 'Weather snapshot', detail: `${formatTemperature(item.temperatureC)}, ${item.precipitationMm ?? '-'} mm rain` })),
    ...photos.map((photo) => ({ id: photo.id, at: photo.takenAt, title: 'Photo', detail: photo.caption, imageUrl: photo.thumbnailDataUrl || photo.dataUrl, fullImageUrl: photo.dataUrl || photo.thumbnailDataUrl })),
    ...(trip?.status === 'Completed' && trip.endDate ? [{ id: `${trip.id}-completed`, at: trip.endDate, title: 'Trip completed', detail: trip.destination.label }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at)), [trip, events, fuel, weather, photos])
  const timelineCutoff = [
    current?.timestamp,
    trip && (trip.status === 'Active' || trip.status === 'Completed') ? trip.startDate : undefined,
    currentIndex === sampled.length - 1 ? trip?.endDate : undefined,
  ].filter((value): value is string => Boolean(value)).sort().at(-1)
  const visibleTimeline = timelineCutoff ? timeline.filter((item) => item.at <= timelineCutoff) : []

  useEffect(() => {
    if (!playing || sampled.length < 2) return
    const timer = window.setTimeout(() => {
      const next = Math.min(sampled.length - 1, index + speed)
      setIndex(next)
      if (next >= sampled.length - 1) setPlaying(false)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [playing, sampled.length, speed, index])

  if (tripId && loadedTripId !== tripId) return <div className="h-52 animate-pulse rounded-md bg-stone-200" aria-label="Loading replay" />
  if (!tripId || !trip) return <EmptyState title="REPLAY UNAVAILABLE"><p>The requested trip could not be loaded.</p><ButtonLink to="/trips" className="mt-5">Back to trips</ButtonLink></EmptyState>

  return <div className={theater ? 'fixed inset-0 z-50 overflow-auto bg-stone-50 p-4 md:p-8' : 'grid gap-6'}>
    <PageHeader eyebrow="Journey replay" title={trip.title} journalTitle actions={<><ButtonLink to={`/trips/${trip.id}`} variant="outline">Back to trip</ButtonLink><Button variant="outline" aria-label={theater ? 'Exit theater mode' : 'Theater mode'} onClick={() => setTheater((value) => !value)}>{theater ? <Minimize size={18} /> : <Expand size={18} />}</Button></>} />
    {position ? <Section title="Route Replay"><div className="overflow-hidden rounded-md border border-stone-200"><MapContainer center={position} zoom={12} className={theater ? 'h-[55vh] w-full' : 'h-[360px] w-full md:h-[480px]'}><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><Polyline positions={positions} pathOptions={{ color: '#9CA3AF', weight: 3 }} /><Polyline positions={progress} pathOptions={{ color: '#0F5B5F', weight: 5 }} /><CircleMarker center={position} radius={9} pathOptions={{ color: '#FFFFFF', weight: 3, fillColor: '#B45309', fillOpacity: 1 }} /><ReplayCamera position={position} positions={positions} follow={follow} playing={playing} fitCount={fitCount} /></MapContainer></div>
      <div className="mt-4 flex flex-wrap items-center gap-2"><Button disabled={sampled.length < 2} aria-label={playing ? 'Pause replay' : 'Play replay'} onClick={() => { if (currentIndex >= sampled.length - 1) setIndex(0); setPlaying((value) => !value) }}>{playing ? <Pause size={18} /> : <Play size={18} />}</Button><div className="flex rounded-md border border-stone-300" role="group" aria-label="Replay speed">{[1, 2, 5, 10, 20].map((value) => <button key={value} type="button" className={`min-h-12 min-w-12 px-2 text-sm font-semibold ${speed === value ? 'bg-teal-900 text-white' : 'text-stone-700'}`} aria-pressed={speed === value} onClick={() => setSpeed(value)}>{value}x</button>)}</div><Button variant="outline" onClick={() => setFollow((value) => !value)} aria-pressed={follow}>{follow ? 'Following' : 'Follow route'}</Button><Button variant="outline" onClick={() => { setFollow(false); setFitCount((value) => value + 1) }}><Route size={17} /> Fit route</Button></div>
      <label className="mt-4 grid gap-2 text-sm font-semibold"><span>Timeline position</span><input type="range" min="0" max={Math.max(0, sampled.length - 1)} value={currentIndex} onChange={(event) => { setIndex(Number(event.target.value)); setPlaying(false) }} className="w-full accent-teal-900" /></label>
      <dl className="mt-4 grid gap-4 border-t border-stone-200 pt-4 sm:grid-cols-2 lg:grid-cols-5"><div><dt className="text-xs uppercase text-stone-600">Time</dt><dd className="font-semibold">{formatDate(current.timestamp, true)}</dd></div><div><dt className="text-xs uppercase text-stone-600">Elapsed</dt><dd className="font-semibold">{formatDuration(elapsedMinutes)}</dd></div><div><dt className="text-xs uppercase text-stone-600">Distance</dt><dd className="font-semibold">{formatKm(currentDistanceKm)}</dd></div><div><dt className="text-xs uppercase text-stone-600">Speed</dt><dd className="font-semibold">{current.speed === null || current.speed === undefined ? 'Unavailable' : formatSpeed(current.speed * 3.6)}</dd></div><div><dt className="text-xs uppercase text-stone-600">Elevation</dt><dd className="font-semibold">{current.altitude === null || current.altitude === undefined ? 'Unavailable' : `${current.altitude.toFixed(0)} m`}</dd></div></dl>
    </Section> : <EmptyState title="NO RECORDED ROUTE">Record GPS points during a trip to replay the journey later.</EmptyState>}
    {position ? <Section title="Journal at This Point"><ol className="grid gap-2">{visibleTimeline.map((item) => <li key={item.id} className="border-b border-stone-200 py-2"><p className="font-semibold">{item.title}</p><p className="text-sm text-stone-600">{formatDate(item.at, true)}{item.detail ? ` | ${item.detail}` : ''}</p>{item.imageUrl ? <a href={item.fullImageUrl ?? item.imageUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block"><img src={item.imageUrl} alt={item.detail || 'Trip photo'} loading="lazy" className="h-32 w-40 rounded-md object-cover" /></a> : null}</li>)}{visibleTimeline.length === 0 ? <li className="text-stone-600">No journal entries yet at this point in the route.</li> : null}</ol></Section> : null}
  </div>
}
