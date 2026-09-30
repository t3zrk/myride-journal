import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { CircleMarker, MapContainer, Polyline, TileLayer, useMap, useMapEvents } from 'react-leaflet'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Camera, CircleDollarSign, CloudSun, Download, Fuel, MapPin, Navigation, Pencil, Trash2 } from 'lucide-react'
import { Button, ButtonLink, ExternalButtonLink } from '../components/ui/Button'
import { ReadinessChecklist } from '../components/ReadinessChecklist'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { Stat } from '../components/ui/Stat'
import { useAllMotorcycles, useInvalidateMyRide, useSettings } from '../hooks/useMyRideData'
import { repository } from '../repositories/localRepository'
import { exportTrip } from '../services/backup'
import { calculateTripCost, tripCostGroups } from '../services/expenses/calculations'
import { getCurrentGpsPosition } from '../services/gps/geolocation'
import { reverseGeocode } from '../services/geocoding/nominatim'
import { getCurrentWeather, weatherCondition } from '../services/weather/openMeteo'
import { analyzeWeatherExposure } from '../services/weather/analysis'
import { compressImageToDataUrl, readPhotoMetadata } from '../services/photos/images'
import { nearestFuelStation } from '../services/fuel/stations'
import type { ExpenseLog, FuelLog, GpsPoint, PlannedStop, RideEvent, Trip, TripPhoto, WeatherSnapshot } from '../types/myride'
import { distanceFromPreviousEvent, routeDistanceKm } from '../utils/distance'
import { formatDate, formatDuration, formatFuelVolume, formatKm, formatMoney, formatSpeed, formatTemperature, nowIso } from '../utils/record'

const tripTabs = [
  ['overview', 'Overview'], ['gps', 'GPS Track'], ['journal', 'Journal'], ['fuel', 'Fuel'],
  ['expenses', 'Expenses'], ['weather', 'Weather'], ['photos', 'Photos'], ['readiness', 'Readiness'],
] as const

const tripCostLabels = { fuel: 'Fuel', stay: 'Stay', food: 'Food', tea: 'Tea', snacks: 'Snacks', tolls: 'Tolls', other: 'Other' } as const

function FitRouteBounds({ positions }: { positions: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    if (positions.length > 1) map.fitBounds(positions, { padding: [24, 24], animate: false })
    else if (positions.length === 1) map.setView(positions[0], 12, { animate: false })
  }, [map, positions])
  return null
}

function PhotoMapClick({ onChoose }: { onChoose: (position: [number, number]) => void }) {
  useMapEvents({ click: ({ latlng }) => onChoose([latlng.lat, latlng.lng]) })
  return null
}

function eventLocation(item: RideEvent) {
  if (item.locationName) return item.locationName
  if (item.latitude !== undefined && item.longitude !== undefined) return `${item.latitude.toFixed(5)}, ${item.longitude.toFixed(5)}`
  return 'Location not recorded'
}

export function TripDetailPage() {
  const { tripId } = useParams()
  const [searchParams] = useSearchParams()
  const requestedTab = searchParams.get('tab')
  const tab = tripTabs.some(([id]) => id === requestedTab) ? requestedTab : 'overview'
  const navigate = useNavigate()
  const invalidate = useInvalidateMyRide()
  const { data: motorcycles = [] } = useAllMotorcycles()
  const { data: settings } = useSettings()
  const [trip, setTrip] = useState<Trip | undefined>()
  const [loadedTripId, setLoadedTripId] = useState<string>()
  const loadRequestRef = useRef(0)
  const [plannedStops, setPlannedStops] = useState<PlannedStop[]>([])
  const [gpsPoints, setGpsPoints] = useState<GpsPoint[]>([])
  const [events, setEvents] = useState<RideEvent[]>([])
  const [fuelLogs, setFuelLogs] = useState<FuelLog[]>([])
  const [expenses, setExpenses] = useState<ExpenseLog[]>([])
  const [photos, setPhotos] = useState<TripPhoto[]>([])
  const [weather, setWeather] = useState<WeatherSnapshot[]>([])
  const [message, setMessage] = useState('')
  const [expense, setExpense] = useState({ amount: '', category: 'food', paymentMethod: 'UPI', notes: '' })
  const [editingExpenseId, setEditingExpenseId] = useState<string>()
  const [fuel, setFuel] = useState({ odometerKm: '', litres: '', pricePerLitre: '', totalCost: '', station: '', fullTank: true })
  const [editingFuelId, setEditingFuelId] = useState<string>()
  const [fuelSaving, setFuelSaving] = useState(false)
  const [expenseSaving, setExpenseSaving] = useState(false)
  const [showEventForm, setShowEventForm] = useState(false)
  const [eventForm, setEventForm] = useState({ title: '', notes: '' })
  const [eventSaving, setEventSaving] = useState(false)
  const [station, setStation] = useState<Awaited<ReturnType<typeof nearestFuelStation>>>()
  const [stationMessage, setStationMessage] = useState('')
  const [photoSaving, setPhotoSaving] = useState(false)
  const [placingPhotoId, setPlacingPhotoId] = useState<string>()
  const [photoLocation, setPhotoLocation] = useState<[number, number]>()

  const loadTrip = useCallback(async (id: string, request = loadRequestRef.current) => {
    const loaded = await repository.trips.get(id)
    if (!loaded || loaded.deletedAt) {
      if (request !== loadRequestRef.current) return
      setTrip(undefined)
      setLoadedTripId(id)
      return
    }
    const [points, loadedEvents, loadedFuel, loadedExpenses, loadedPhotos, loadedWeather, loadedStops] = await Promise.all([
      repository.gpsPoints.byTrip(id),
      repository.rideEvents.byTrip(id),
      repository.fuelLogs.byTrip(id),
      repository.expenses.byTrip(id),
      repository.photos.byTrip(id),
      repository.weather.byTrip(id),
      repository.plannedStops.byTrip(id),
    ])
    if (request !== loadRequestRef.current) return
    setTrip(loaded)
    setGpsPoints(points)
    setEvents(loadedEvents)
    setFuelLogs(loadedFuel)
    setExpenses(loadedExpenses)
    setPhotos(loadedPhotos)
    setWeather(loadedWeather)
    setPlannedStops(loadedStops)
    setLoadedTripId(id)
  }, [])

  useEffect(() => {
    if (!tripId) return
    const request = ++loadRequestRef.current
    void loadTrip(tripId, request)
    return () => { loadRequestRef.current += 1 }
  }, [tripId, loadTrip])

  useEffect(() => {
    if (!tripId) return
    const refreshFromCloud = () => { void loadTrip(tripId) }
    const refreshFromTracking = (event: Event) => {
      if ((event as CustomEvent<{ tripId: string }>).detail?.tripId === tripId) void loadTrip(tripId)
    }
    window.addEventListener('myride:synced', refreshFromCloud)
    window.addEventListener('myride:tracked', refreshFromTracking)
    return () => { window.removeEventListener('myride:synced', refreshFromCloud); window.removeEventListener('myride:tracked', refreshFromTracking) }
  }, [tripId, loadTrip])

  const routeDistance = useMemo(() => routeDistanceKm(gpsPoints), [gpsPoints])
  const tripCost = useMemo(() => calculateTripCost(expenses, fuelLogs), [expenses, fuelLogs])
  const motorcycle = motorcycles.find((item) => item.id === trip?.motorcycleId)
  const mapStep = Math.max(1, Math.ceil(gpsPoints.length / 1000))
  const mapPositions = useMemo(() => gpsPoints.filter((_, index) => index % mapStep === 0 || index === gpsPoints.length - 1).map((point) => [point.latitude, point.longitude] as [number, number]), [gpsPoints, mapStep])
  const photoBeingPlaced = photos.find((photo) => photo.id === placingPhotoId)
  const photoReference = photoBeingPlaced?.latitude !== undefined && photoBeingPlaced.longitude !== undefined ? [photoBeingPlaced.latitude, photoBeingPlaced.longitude] as [number, number] : gpsPoints.length ? [gpsPoints.at(-1)!.latitude, gpsPoints.at(-1)!.longitude] as [number, number] : trip?.origin.latitude !== undefined && trip.origin.longitude !== undefined ? [trip.origin.latitude, trip.origin.longitude] as [number, number] : undefined
  const elevation = gpsPoints.filter((point) => point.altitude !== null && point.altitude !== undefined).filter((_, index) => index % mapStep === 0 || index === gpsPoints.length - 1).map((point) => ({ time: formatDate(point.timestamp, true), metres: Math.round(point.altitude!) }))
  const weatherAnalysis = useMemo(() => analyzeWeatherExposure(gpsPoints, weather), [gpsPoints, weather])
  const journalEntries = useMemo(() => [
    ...(trip && (trip.status === 'Active' || trip.status === 'Completed') ? [{ id: `${trip.id}-started`, at: trip.startDate, kind: 'trip', title: 'Trip started', detail: trip.origin.label, notes: undefined, event: undefined }] : []),
    ...events.map((item) => ({ id: item.id, at: item.timestamp, kind: item.type, title: item.title, detail: eventLocation(item), notes: item.notes, event: item })),
    ...fuelLogs.map((item) => ({ id: item.id, at: item.dateTime, kind: 'fuel', title: `${formatFuelVolume(item.litres)} fuel fill`, detail: `${item.station || 'Station not recorded'} | ${formatKm(item.odometerKm)}`, notes: undefined, event: undefined })),
    ...expenses.map((item) => ({ id: item.id, at: item.date, kind: 'expense', title: `${item.category} expense`, detail: formatMoney(item.amount, item.currency), notes: item.notes, event: undefined })),
    ...photos.map((item) => {
      const linkedEvent = events.find((event) => event.id === item.rideEventId)
      const location = item.locationSource ? `Location from ${item.locationSource === 'exif' ? 'photo GPS' : item.locationSource === 'manual' ? 'manual placement' : 'trip GPS'}` : 'Location not recorded'
      return { id: item.id, at: item.takenAt, kind: 'photo', title: item.caption || 'Trip photo', detail: linkedEvent ? `${location} | Linked to ${linkedEvent.title}` : location, notes: undefined, event: undefined }
    }),
    ...weather.map((item) => ({ id: item.id, at: item.timestamp, kind: 'weather', title: 'Weather snapshot', detail: `${formatTemperature(item.temperatureC)} | ${item.precipitationMm ?? '-'} mm rain`, notes: undefined, event: undefined })),
    ...(trip?.status === 'Completed' && trip.endDate ? [{ id: `${trip.id}-completed`, at: trip.endDate, kind: 'trip', title: 'Trip completed', detail: trip.destination.label, notes: undefined, event: undefined }] : []),
  ].sort((a, b) => a.at.localeCompare(b.at)), [trip, events, fuelLogs, expenses, photos, weather])

  if (tripId && loadedTripId !== tripId) return <div className="h-52 animate-pulse rounded-md bg-stone-200" aria-label="Loading trip" />

  if (!tripId || !trip) {
    return (
      <EmptyState title="TRIP COULD NOT BE LOADED">
        <p>The requested trip could not be found. MyRide does not load another trip as a fallback.</p>
        <ButtonLink to="/trips" className="mt-5">Back to trips</ButtonLink>
      </EmptyState>
    )
  }

  const currentTrip = trip
  const destinationQuery = trip.destination.latitude !== undefined && trip.destination.longitude !== undefined
    ? `${trip.destination.latitude},${trip.destination.longitude}`
    : trip.destination.label

  async function refresh() {
    if (tripId) await loadTrip(tripId)
    invalidate()
  }

  async function recordLocation(kind: 'checkpoint' | 'stop' | 'event') {
    setMessage('Checking location...')
    try {
      const position = await getCurrentGpsPosition()
      await repository.gpsPoints.create({ ...position, tripId: currentTrip.id })
      let locationName: string | undefined
      try {
        locationName = await reverseGeocode(position.latitude, position.longitude)
      } catch {
        locationName = `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}`
      }
      const distanceFromStartKm = gpsPoints.length ? routeDistanceKm([...gpsPoints, position]) : 0
      await repository.rideEvents.create({
        tripId: currentTrip.id,
        type: kind,
        title: kind === 'checkpoint' ? 'Reached here' : kind === 'stop' ? 'Stop recorded' : 'Ride event',
        timestamp: nowIso(),
        latitude: position.latitude,
        longitude: position.longitude,
        locationName,
        distanceFromStartKm,
        distanceFromPreviousKm: distanceFromPreviousEvent(events, position),
      })
      await repository.trips.update(currentTrip.id, { distanceKm: distanceFromStartKm || routeDistance })
      setMessage(`REACHED: ${locationName}`)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'LOCATION UNAVAILABLE')
    }
  }

  async function checkLocation() {
    setMessage('Checking location...')
    try {
      const position = await getCurrentGpsPosition()
      let label: string
      try { label = await reverseGeocode(position.latitude, position.longitude) }
      catch { label = `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` }
      setMessage(`CURRENT LOCATION: ${label}. This check was not saved.`)
    } catch {
      setMessage('LOCATION UNAVAILABLE')
    }
  }

  async function startTrip() {
    setMessage('')
    try {
      const startedAt = nowIso()
      await repository.trips.update(currentTrip.id, { status: 'Active', startDate: startedAt, endDate: currentTrip.endDate && currentTrip.endDate >= startedAt ? currentTrip.endDate : undefined, durationMinutes: undefined })
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Trip could not be started.')
    }
  }

  async function endTrip() {
    setMessage('')
    try {
      const start = new Date(currentTrip.startDate).getTime()
      const durationMinutes = Math.max(0, Math.round((Date.now() - start) / 60000))
      const allPoints = await repository.gpsPoints.byTrip(currentTrip.id)
      await repository.trips.update(currentTrip.id, { status: 'Completed', endDate: nowIso(), distanceKm: routeDistanceKm(allPoints), durationMinutes })
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Trip could not be ended.')
    }
  }

  async function deleteTrip() {
    if (!confirm('Delete this trip and its route, stops, events, photos, weather, and readiness checks? Fuel fills and expenses will remain in your history without this trip link.')) return
    try {
      await repository.trips.remove(currentTrip.id)
      invalidate()
      navigate('/trips')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Trip could not be deleted.')
    }
  }

  async function addFuel(event: FormEvent) {
    event.preventDefault()
    if (fuelSaving) return
    const original = fuelLogs.find((item) => item.id === editingFuelId)
    if (editingFuelId && !original) { setMessage('This fuel fill is no longer available.'); return }
    if (!currentTrip.motorcycleId && !original) {
      setMessage('Assign a motorcycle before logging fuel.')
      return
    }
    const litres = Number(fuel.litres)
    const odometerKm = Number(fuel.odometerKm)
    const price = fuel.pricePerLitre === '' ? undefined : Number(fuel.pricePerLitre)
    const enteredTotalCost = fuel.totalCost === '' ? undefined : Number(fuel.totalCost)
    if (!Number.isFinite(odometerKm) || odometerKm < 0 || !Number.isFinite(litres) || litres <= 0 || (price !== undefined && (!Number.isFinite(price) || price < 0)) || (enteredTotalCost !== undefined && (!Number.isFinite(enteredTotalCost) || enteredTotalCost < 0))) { setMessage('Enter a valid odometer, fuel quantity, price, and total cost.'); return }
    const payload = {
      motorcycleId: original?.motorcycleId ?? currentTrip.motorcycleId!,
      tripId: currentTrip.id,
      dateTime: original?.dateTime ?? nowIso(),
      odometerKm,
      litres,
      pricePerLitre: price,
      totalCost: enteredTotalCost ?? (price === undefined ? undefined : price * litres),
      station: fuel.station,
      fullTank: fuel.fullTank,
    }
    setFuelSaving(true)
    try {
      if (original) await repository.fuelLogs.update(original.id, payload)
      else await repository.fuelLogs.create(payload)
      setEditingFuelId(undefined)
      setFuel({ odometerKm: '', litres: '', pricePerLitre: '', totalCost: '', station: '', fullTank: true })
      setMessage('Fuel fill saved.')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Fuel fill could not be saved.')
    } finally {
      setFuelSaving(false)
    }
  }

  function editFuelLog(log: FuelLog) {
    setEditingFuelId(log.id)
    setFuel({ odometerKm: String(log.odometerKm), litres: String(log.litres), pricePerLitre: log.pricePerLitre === undefined ? '' : String(log.pricePerLitre), totalCost: log.totalCost === undefined ? '' : String(log.totalCost), station: log.station ?? '', fullTank: log.fullTank })
  }

  async function deleteFuelLog(log: FuelLog) {
    if (!window.confirm(`Delete the fuel fill at ${formatKm(log.odometerKm)}? Mileage will recalculate.`)) return
    try {
      await repository.fuelLogs.remove(log.id)
      if (editingFuelId === log.id) { setEditingFuelId(undefined); setFuel({ odometerKm: '', litres: '', pricePerLitre: '', totalCost: '', station: '', fullTank: true }) }
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Fuel fill could not be deleted.')
    }
  }

  async function addExpense(event: FormEvent) {
    event.preventDefault()
    if (expenseSaving) return
    const amount = Number(expense.amount)
    if (!Number.isFinite(amount) || amount <= 0) { setMessage('Enter an expense amount greater than zero.'); return }
    const original = expenses.find((item) => item.id === editingExpenseId)
    if (editingExpenseId && !original) { setMessage('This expense is no longer available.'); return }
    const payload = {
      amount,
      currency: original?.currency ?? settings?.currency ?? 'INR',
      date: original?.date ?? nowIso(),
      category: expense.category as ExpenseLog['category'],
      paymentMethod: expense.paymentMethod as ExpenseLog['paymentMethod'],
      tripId: currentTrip.id,
      motorcycleId: original?.motorcycleId ?? currentTrip.motorcycleId,
      notes: expense.notes,
    }
    setExpenseSaving(true)
    try {
      if (original) await repository.expenses.update(original.id, payload)
      else await repository.expenses.create(payload)
      setEditingExpenseId(undefined)
      setExpense({ amount: '', category: 'food', paymentMethod: 'UPI', notes: '' })
      setMessage('Expense saved.')
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Expense could not be saved.')
    } finally {
      setExpenseSaving(false)
    }
  }

  function editTripExpense(item: ExpenseLog) {
    setEditingExpenseId(item.id)
    setExpense({ amount: String(item.amount), category: item.category, paymentMethod: item.paymentMethod, notes: item.notes ?? '' })
  }

  async function deleteTripExpense(item: ExpenseLog) {
    if (!window.confirm(`Delete this ${formatMoney(item.amount, item.currency)} expense?`)) return
    try {
      await repository.expenses.remove(item.id)
      if (editingExpenseId === item.id) { setEditingExpenseId(undefined); setExpense({ amount: '', category: 'food', paymentMethod: 'UPI', notes: '' }) }
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Expense could not be deleted.')
    }
  }

  async function addPhoto(file?: File) {
    if (!file || photoSaving) return
    setPhotoSaving(true)
    try {
      const metadata = await readPhotoMetadata(file)
      const [dataUrl, thumbnailDataUrl] = await Promise.all([compressImageToDataUrl(file), compressImageToDataUrl(file, true)])
      const nearestPoint = [...gpsPoints].sort((a, b) => Math.abs(Date.parse(a.timestamp) - Date.parse(metadata.takenAt)) - Math.abs(Date.parse(b.timestamp) - Date.parse(metadata.takenAt)))[0]
      const correlated = nearestPoint && Math.abs(Date.parse(nearestPoint.timestamp) - Date.parse(metadata.takenAt)) <= 15 * 60 * 1000 ? nearestPoint : undefined
      const latitude = metadata.latitude ?? correlated?.latitude
      const longitude = metadata.longitude ?? correlated?.longitude
      await repository.photos.create({ tripId: currentTrip.id, dataUrl, thumbnailDataUrl, takenAt: metadata.takenAt, latitude, longitude, locationSource: metadata.latitude !== undefined ? 'exif' : correlated ? 'trip-gps' : undefined })
      await refresh()
      setMessage('Photo added to this trip.')
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Photo could not be added.')
    } finally {
      setPhotoSaving(false)
    }
  }

  async function deletePhoto(photo: TripPhoto) {
    if (!window.confirm('Delete this photo from the trip?')) return
    try {
      await repository.photos.remove(photo.id)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Photo could not be deleted.')
    }
  }

  async function savePhotoLocation() {
    if (!placingPhotoId || !photoLocation) return
    try {
      await repository.photos.update(placingPhotoId, { latitude: photoLocation[0], longitude: photoLocation[1], locationSource: 'manual' })
      setPlacingPhotoId(undefined)
      setPhotoLocation(undefined)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Photo location could not be saved.')
    }
  }

  async function updatePhoto(photoId: string, updates: Partial<TripPhoto>, fallbackMessage: string) {
    try {
      await repository.photos.update(photoId, updates)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : fallbackMessage)
    }
  }

  async function findFuelStation() {
    setStationMessage('Looking for a nearby fuel station...')
    try {
      const position = gpsPoints.at(-1) ?? await getCurrentGpsPosition()
      const found = await nearestFuelStation(position.latitude, position.longitude)
      setStation(found)
      setStationMessage(found ? '' : 'Fuel station information unavailable.')
    } catch {
      setStation(undefined)
      setStationMessage('Fuel station information unavailable.')
    }
  }

  async function snapshotWeather() {
    const latest = gpsPoints.at(-1)
    if (!latest) {
      setMessage('Record a location before weather snapshot.')
      return
    }
    try {
      const snapshot = await getCurrentWeather(latest.latitude, latest.longitude)
      await repository.weather.create({ tripId: currentTrip.id, timestamp: nowIso(), latitude: latest.latitude, longitude: latest.longitude, ...snapshot })
      await refresh()
    } catch {
      setMessage('Weather unavailable.')
    }
  }

  async function addEvent(event: FormEvent) {
    event.preventDefault()
    if (eventSaving) return
    if (!eventForm.title.trim()) { setMessage('Enter an event title.'); return }
    setEventSaving(true)
    let position: Awaited<ReturnType<typeof getCurrentGpsPosition>> | undefined
    try { position = await getCurrentGpsPosition() } catch { setMessage('Event saved without location; GPS was unavailable.') }
    try {
      let locationName: string | undefined
      if (position) {
        try { locationName = await reverseGeocode(position.latitude, position.longitude) }
        catch { locationName = `${position.latitude.toFixed(5)}, ${position.longitude.toFixed(5)}` }
      }
      await repository.rideEvents.create({
        tripId: currentTrip.id, type: 'event', title: eventForm.title.trim(), notes: eventForm.notes.trim(), timestamp: nowIso(),
        latitude: position?.latitude, longitude: position?.longitude, locationName,
        distanceFromStartKm: position ? routeDistanceKm([...gpsPoints, position]) : undefined,
        distanceFromPreviousKm: position ? distanceFromPreviousEvent(events, position) : undefined,
      })
      setEventForm({ title: '', notes: '' })
      setShowEventForm(false)
      await refresh()
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Event could not be saved.')
    } finally {
      setEventSaving(false)
    }
  }

  return (
    <div className="grid gap-6 md:gap-8">
      <section>
        <PageHeader
          eyebrow={trip.status}
          title={trip.title}
          journalTitle
          description={<><p>{trip.origin.label} to {trip.destination.label}</p><p>{formatDate(trip.startDate, true)}{trip.endDate ? ` to ${formatDate(trip.endDate, true)}` : ''}</p></>}
          actions={<>
            <ButtonLink to={`/trips/${trip.id}/edit`} variant="outline"><Pencil size={17} /> Edit trip</ButtonLink>
            <ButtonLink to={`/trips/${trip.id}/replay`} variant="outline">Replay</ButtonLink>
            <Button variant="outline" onClick={() => void exportTrip(trip.id)}><Download size={17} /> Export</Button>
            <ExternalButtonLink href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinationQuery)}`} target="_blank" rel="noreferrer" variant="outline"><Navigation size={17} /> Open in Google Maps</ExternalButtonLink>
            <Button variant="destructive" onClick={deleteTrip}><Trash2 size={17} /> Delete</Button>
          </>}
        />
        {message ? <p role="status" className="mt-4 rounded-md border border-teal-100 bg-teal-50 px-4 py-3 text-sm text-teal-900">{message}</p> : null}
        <dl className="surface-panel mt-5 grid grid-cols-2 gap-5 p-5 lg:grid-cols-6">
          <Stat label="Motorcycle" value={motorcycle?.nickname || motorcycle?.model || 'Unassigned'} />
          <Stat label="GPS distance" value={formatKm(routeDistance || trip.distanceKm)} />
          <Stat label="Duration" value={formatDuration(trip.durationMinutes)} />
          <Stat label="Stops/events" value={`${events.length}`} />
          <Stat label="Fuel fills" value={`${fuelLogs.length}`} />
          <Stat label="Recorded cost" value={formatMoney(tripCost.total)} detail="Fuel fills and expense entries included" />
        </dl>
      </section>

      <nav aria-label="Trip sections" className="sticky top-16 z-10 -mt-2 overflow-x-auto border-y border-stone-200 bg-stone-50/95 py-2 backdrop-blur">
        <div className="flex min-w-max gap-1">
          {tripTabs.map(([id, label]) => <Link key={id} to={`?tab=${id}`} aria-current={tab === id ? 'page' : undefined} className={`inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800 ${tab === id ? 'bg-white text-teal-900 shadow-sm' : 'text-stone-600 hover:bg-white/70 hover:text-stone-900'}`}>{label}</Link>)}
          <Link to={`/trips/${trip.id}/replay`} className="inline-flex min-h-10 items-center rounded-md px-3 text-sm font-semibold text-stone-600 transition hover:bg-white/70 hover:text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal-800">Replay</Link>
        </div>
      </nav>

      {tab === 'overview' ? <Section title="Journey at a Glance"><dl className="grid grid-cols-2 gap-5 lg:grid-cols-4"><Stat label="Fuel used" value={formatFuelVolume(fuelLogs.reduce((sum, log) => sum + log.litres, 0))} /><Stat label="Trip cost" value={formatMoney(tripCost.total)} /><Stat label="Photos" value={`${photos.length}`} /><Stat label="Weather snapshots" value={`${weather.length}`} /></dl>{trip.notes ? <p className="mt-5 whitespace-pre-wrap border-t border-stone-200 pt-4 text-stone-700">{trip.notes}</p> : null}</Section> : null}

      {tab === 'overview' && events.length ? <Section title="Key Events"><ol className="grid gap-2">{events.slice(-5).map((item) => <li key={item.id} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-stone-200 py-2"><span className="font-semibold">{item.title}</span><span className="text-sm text-stone-600">{formatDate(item.timestamp, true)}{item.locationName ? ` | ${item.locationName}` : ''}</span></li>)}</ol></Section> : null}

      {tab === 'overview' && (trip.status === 'Planned' || trip.status === 'Active') ? <Section title="Active Trip Controls">
        <div className="flex flex-wrap gap-3">
          <Button disabled={trip.status !== 'Planned'} onClick={startTrip}>Start trip</Button>
          <Button disabled={trip.status !== 'Active'} variant="outline" onClick={() => recordLocation('checkpoint')}><MapPin size={17} /> Record location</Button>
          <Button disabled={trip.status !== 'Active'} variant="outline" onClick={checkLocation}>Check location</Button>
          <Button disabled={trip.status !== 'Active'} variant="outline" onClick={() => recordLocation('stop')}>Add stop</Button>
          <Button disabled={trip.status !== 'Active'} variant="outline" onClick={() => setShowEventForm((value) => !value)}>Add event</Button>
          {trip.status === 'Active' ? <ButtonLink to="?tab=fuel" variant="outline"><Fuel size={17} /> Log fuel</ButtonLink> : null}
          {trip.status === 'Active' ? <ButtonLink to="?tab=expenses" variant="outline"><CircleDollarSign size={17} /> Add expense</ButtonLink> : null}
          {trip.status === 'Active' ? <ButtonLink to="?tab=photos" variant="outline"><Camera size={17} /> Add photo</ButtonLink> : null}
          <Button disabled={trip.status !== 'Active'} variant="outline" onClick={snapshotWeather}><CloudSun size={17} /> Weather</Button>
          <Button disabled={trip.status !== 'Active'} variant="outline" onClick={findFuelStation}><Fuel size={17} /> Nearby fuel</Button>
          <Button variant="secondary" disabled={trip.status !== 'Active'} onClick={endTrip}>End trip</Button>
        </div>
        {showEventForm ? <form onSubmit={addEvent} className="surface-panel mt-4 grid max-w-xl gap-3 p-4"><Field label="Event title"><Input required value={eventForm.title} onChange={(e) => setEventForm({ ...eventForm, title: e.target.value })} /></Field><Field label="Notes"><Textarea value={eventForm.notes} onChange={(e) => setEventForm({ ...eventForm, notes: e.target.value })} /></Field><Button type="submit" disabled={eventSaving}>{eventSaving ? 'Saving...' : 'Save event'}</Button></form> : null}
        {trip.status === 'Active' ? <p className="mt-3 text-sm text-stone-600">GPS records at the interval in Settings while MyRide is open. Background browser tracking may pause when the app is closed.</p> : null}
        {station ? <p className="mt-3 text-sm"><span className="font-semibold">Nearest fuel station:</span> {station.name || 'Unnamed station'} | {formatKm(station.distanceKm)}{station.openingHours ? ` | ${station.openingHours}` : ''} | <a className="font-semibold text-teal-900 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${station.latitude},${station.longitude}`}>Open in Google Maps</a></p> : stationMessage ? <p role="status" className="mt-3 text-sm text-stone-600">{stationMessage}</p> : null}
      </Section> : null}

      {tab === 'journal' && plannedStops.length ? <Section title="Planned Stops"><ol className="grid gap-2">{plannedStops.map((stop) => <li key={stop.id} className="border-b border-stone-200 py-2"><p className="font-semibold">{stop.label}</p>{stop.plannedAt ? <p className="text-sm text-stone-600">Planned arrival: {formatDate(stop.plannedAt, true)}</p> : null}</li>)}</ol></Section> : null}

      {tab === 'readiness' ? <Section title="Readiness"><ReadinessChecklist tripId={trip.id} motorcycleId={trip.motorcycleId} /></Section> : null}

      {tab === 'overview' || tab === 'gps' ? <Section title="Route">
        {mapPositions.length > 0 ? (
          <div className="overflow-hidden rounded-md border border-stone-200">
            <MapContainer center={mapPositions[0]} zoom={12} className="h-[360px] w-full">
              <TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Polyline positions={mapPositions} pathOptions={{ color: '#0F5B5F', weight: 5 }} />
              <FitRouteBounds positions={mapPositions} />
            </MapContainer>
          </div>
        ) : (
          <EmptyState title="NO GPS POINTS">
            <p>Record location checkpoints during a ride to build the route. Coordinates are never fabricated.</p>
          </EmptyState>
        )}
      </Section> : null}

      {tab === 'gps' && elevation.length > 1 ? <Section title="Elevation Profile"><div className="h-56 w-full" role="img" aria-label={`Recorded elevation from ${Math.min(...elevation.map((point) => point.metres))} to ${Math.max(...elevation.map((point) => point.metres))} metres`}><ResponsiveContainer width="100%" height="100%"><AreaChart data={elevation}><CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" /><XAxis dataKey="time" hide /><YAxis unit=" m" width={60} /><Tooltip formatter={(value) => `${value} m`} /><Area dataKey="metres" type="monotone" stroke="#0F5B5F" fill="#D7E7E4" strokeWidth={2} /></AreaChart></ResponsiveContainer></div><p className="mt-2 text-sm text-stone-600">Only GPS points with recorded altitude are included.</p></Section> : null}

      {(tab === 'fuel' || tab === 'expenses') ? <section className="grid gap-6">
        {tab === 'fuel' ? <Section title={editingFuelId ? 'Edit Fuel Fill' : 'Log Fuel'}>
          <form onSubmit={addFuel} className="surface-panel grid gap-3 p-4 md:p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Odometer km"><Input required type="number" min="0" value={fuel.odometerKm} onChange={(e) => setFuel({ ...fuel, odometerKm: e.target.value })} /></Field>
              <Field label="Litres"><Input required type="number" min="0.01" step="0.01" value={fuel.litres} onChange={(e) => setFuel({ ...fuel, litres: e.target.value, totalCost: fuel.pricePerLitre ? '' : fuel.totalCost })} /></Field>
              <Field label="Price / litre"><Input type="number" min="0" step="0.01" value={fuel.pricePerLitre} onChange={(e) => setFuel({ ...fuel, pricePerLitre: e.target.value, totalCost: '' })} /></Field>
              <Field label="Total cost"><Input type="number" min="0" step="0.01" value={fuel.totalCost} onChange={(e) => setFuel({ ...fuel, totalCost: e.target.value })} /></Field>
              <Field label="Station"><Input value={fuel.station} onChange={(e) => setFuel({ ...fuel, station: e.target.value })} /></Field>
            </div>
            <label className="flex min-h-12 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5 accent-teal-900" checked={fuel.fullTank} onChange={(e) => setFuel({ ...fuel, fullTank: e.target.checked })} /> Full tank</label>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={fuelSaving || (!trip.motorcycleId && !editingFuelId)}><Fuel size={17} /> {fuelSaving ? 'Saving...' : editingFuelId ? 'Save changes' : 'Log fuel'}</Button>{editingFuelId ? <Button type="button" variant="outline" disabled={fuelSaving} onClick={() => { setEditingFuelId(undefined); setFuel({ odometerKm: '', litres: '', pricePerLitre: '', totalCost: '', station: '', fullTank: true }) }}>Cancel</Button> : null}</div>
          </form>
        </Section> : null}

        {tab === 'expenses' ? <Section title="Trip Cost">
          <dl className="grid grid-cols-2 gap-5 border-y border-stone-200 py-5 sm:grid-cols-4">
            {tripCostGroups.map((group) => <Stat key={group} label={tripCostLabels[group]} value={formatMoney(tripCost.values[group])} />)}
            <Stat label="Total" value={formatMoney(tripCost.total)} />
          </dl>
          {tripCost.fuelFillCost > 0 && tripCost.fuelExpenseCost > 0 ? <p className="mt-3 text-sm text-amber-800">Fuel includes both priced fuel fills and fuel-category expense entries. Remove any duplicate entry if the same purchase was recorded twice.</p> : null}
        </Section> : null}

        {tab === 'expenses' ? <Section title={editingExpenseId ? 'Edit Expense' : 'Add Expense'}>
          <form onSubmit={addExpense} className="surface-panel grid gap-3 p-4 md:p-5">
            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Amount"><Input required type="number" min="0.01" step="0.01" value={expense.amount} onChange={(e) => setExpense({ ...expense, amount: e.target.value })} /></Field>
              <Field label="Category"><Select value={expense.category} onChange={(e) => setExpense({ ...expense, category: e.target.value })}>{['fuel','stay','food','tea','snacks','tolls','parking','maintenance','accessories','repairs','other'].map((value) => <option key={value}>{value}</option>)}</Select></Field>
              <Field label="Payment method"><Select value={expense.paymentMethod} onChange={(e) => setExpense({ ...expense, paymentMethod: e.target.value })}>{['UPI','Cash','Card','Other'].map((value) => <option key={value}>{value}</option>)}</Select></Field>
              <Field label="Notes"><Input value={expense.notes} onChange={(e) => setExpense({ ...expense, notes: e.target.value })} /></Field>
            </div>
            <div className="flex flex-wrap gap-2"><Button type="submit" disabled={expenseSaving}>{expenseSaving ? 'Saving...' : editingExpenseId ? 'Save changes' : 'Add expense'}</Button>{editingExpenseId ? <Button type="button" variant="outline" disabled={expenseSaving} onClick={() => { setEditingExpenseId(undefined); setExpense({ amount: '', category: 'food', paymentMethod: 'UPI', notes: '' }) }}>Cancel</Button> : null}</div>
          </form>
        </Section> : null}
      </section> : null}

      {tab === 'fuel' ? <Section title="Fuel Fills">
        <div className="grid gap-2">{fuelLogs.map((log) => <div key={log.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 py-2 text-sm"><div><span className="font-semibold">{formatFuelVolume(log.litres)} at {formatKm(log.odometerKm)}</span> | {log.totalCost === undefined ? 'Cost unavailable' : formatMoney(log.totalCost)}</div><div className="flex gap-1"><Button variant="ghost" aria-label={`Edit fuel fill at ${formatKm(log.odometerKm)}`} onClick={() => editFuelLog(log)}><Pencil size={17} /></Button><Button variant="ghost" aria-label={`Delete fuel fill at ${formatKm(log.odometerKm)}`} onClick={() => deleteFuelLog(log)}><Trash2 size={17} /></Button></div></div>)}{fuelLogs.length === 0 ? <p className="text-stone-600">No fuel recorded for this trip.</p> : null}</div>
        {trip.motorcycleId ? <ButtonLink to={`/fuel?motorcycleId=${trip.motorcycleId}`} className="mt-3" variant="outline">Open fuel journal</ButtonLink> : null}
      </Section> : null}
      {tab === 'expenses' ? <Section title="Trip Expenses">
        <p className="mb-3 font-serif text-2xl">{formatMoney(expenses.reduce((sum, item) => sum + item.amount, 0))} in expense entries</p>
        <div className="grid gap-2">{expenses.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 py-2 text-sm"><div><span className="font-semibold">{item.category}</span> | {formatMoney(item.amount, item.currency)} | {formatDate(item.date)}</div><div className="flex gap-1"><Button variant="ghost" aria-label={`Edit ${item.category} expense`} onClick={() => editTripExpense(item)}><Pencil size={17} /></Button><Button variant="ghost" aria-label={`Delete ${item.category} expense`} onClick={() => deleteTripExpense(item)}><Trash2 size={17} /></Button></div></div>)}{expenses.length === 0 ? <p className="text-stone-600">No expenses recorded for this trip.</p> : null}</div>
        <ButtonLink to="/expenses" className="mt-3" variant="outline">Open expenses</ButtonLink>
      </Section> : null}

      {tab === 'journal' ? <Section title="Timeline">
        <div className="grid gap-3">
          {journalEntries.map((item) => (
            <article key={item.id} className="surface-panel p-4 transition hover:border-stone-300 hover:shadow-sm">
              <p className="text-xs font-semibold uppercase text-teal-900">{item.kind} | {formatDate(item.at, true)}</p>
              <h3 className="font-serif text-xl">{item.title}</h3>
              <p className="text-sm text-stone-600">{item.detail}</p>
              {item.event ? <p className="mt-2 text-sm text-stone-600">From start: {formatKm(item.event.distanceFromStartKm)} | From previous: {formatKm(item.event.distanceFromPreviousKm)}</p> : null}
              {item.notes ? <p className="mt-2 text-sm">{item.notes}</p> : null}
            </article>
          ))}
          {journalEntries.length === 0 ? <p className="text-stone-600">Stops, checkpoints, fuel, expenses, photos, and weather will appear here.</p> : null}
        </div>
      </Section> : null}

      {tab === 'photos' ? <Section title="Photos" action={<label className={`inline-flex ${photoSaving ? 'pointer-events-none opacity-50' : ''}`}><input type="file" accept="image/*" disabled={photoSaving} className="sr-only" onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; void addPhoto(file) }} /><span className="inline-flex min-h-12 cursor-pointer items-center gap-2 rounded-md border border-stone-300 px-4 text-sm font-semibold"><Camera size={17} /> {photoSaving ? 'Adding...' : 'Add photo'}</span></label>}>
        {photos.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {photos.map((photo) => <figure key={photo.id} className="grid gap-2 border-b border-stone-200 pb-3">
              <a href={photo.dataUrl} target="_blank" rel="noreferrer"><img src={photo.thumbnailDataUrl || photo.dataUrl} alt={photo.caption || 'Trip photo'} className="aspect-[4/3] w-full rounded-md object-cover" /></a>
              <figcaption className="text-xs text-stone-600">{formatDate(photo.takenAt, true)}{photo.locationSource ? ` | Location: ${photo.locationSource === 'exif' ? 'photo GPS' : photo.locationSource === 'manual' ? 'manual placement' : 'matched trip GPS'}` : ''}</figcaption>
              <Field label="Caption"><Input defaultValue={photo.caption ?? ''} onBlur={(event) => { if (event.target.value !== (photo.caption ?? '')) void updatePhoto(photo.id, { caption: event.target.value.trim() }, 'Photo caption could not be saved.') }} /></Field>
              <Field label="Linked event"><Select value={photo.rideEventId ?? ''} onChange={(event) => void updatePhoto(photo.id, { rideEventId: event.target.value || undefined }, 'Photo event link could not be saved.')}><option value="">No event</option>{events.map((item) => <option key={item.id} value={item.id}>{item.title} | {formatDate(item.timestamp, true)}</option>)}</Select></Field>
              <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => { setPlacingPhotoId(photo.id); setPhotoLocation(photo.latitude !== undefined && photo.longitude !== undefined ? [photo.latitude, photo.longitude] : undefined) }}><MapPin size={17} /> Place on map</Button><Button variant="ghost" onClick={() => deletePhoto(photo)}><Trash2 size={17} /> Delete photo</Button></div>
            </figure>)}
          </div>
        ) : <EmptyState title="NO PHOTOS">Photos added here remain associated with this exact trip ID.</EmptyState>}
        {photoBeingPlaced ? <div className="mt-6 border-t border-stone-200 pt-5"><h3 className="font-serif text-2xl">Place photo on map</h3><p className="mt-1 text-sm text-stone-600">Tap the recorded location. No coordinates are saved until you confirm.</p><div className="mt-4 overflow-hidden rounded-md border border-stone-200"><MapContainer key={photoBeingPlaced.id} center={photoReference ?? [0, 0]} zoom={photoReference ? 12 : 2} className="h-72 w-full"><TileLayer attribution="&copy; OpenStreetMap contributors" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" /><PhotoMapClick onChoose={setPhotoLocation} />{photoLocation ? <CircleMarker center={photoLocation} radius={8} pathOptions={{ color: '#FFFFFF', weight: 3, fillColor: '#B45309', fillOpacity: 1 }} /> : null}</MapContainer></div><p className="mt-2 text-sm text-stone-600">{photoLocation ? `${photoLocation[0].toFixed(5)}, ${photoLocation[1].toFixed(5)}` : 'No location selected.'}</p><div className="mt-4 flex flex-wrap gap-2"><Button disabled={!photoLocation} onClick={savePhotoLocation}>Save location</Button><Button variant="outline" onClick={() => { setPlacingPhotoId(undefined); setPhotoLocation(undefined) }}>Cancel</Button>{photoBeingPlaced.latitude !== undefined ? <Button variant="ghost" onClick={() => void updatePhoto(photoBeingPlaced.id, { latitude: undefined, longitude: undefined, locationSource: undefined }, 'Photo location could not be removed.').then(() => { setPlacingPhotoId(undefined); setPhotoLocation(undefined) })}>Remove location</Button> : null}</div></div> : null}
      </Section> : null}

      {tab === 'weather' ? <Section title="Weather Snapshots" action={trip.status === 'Active' ? <Button variant="outline" onClick={snapshotWeather}><CloudSun size={17} /> Capture weather</Button> : undefined}>
        {weather.length ? (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {weather.map((item) => <article key={item.id} className="surface-panel p-4">
              <p className="font-semibold">{formatDate(item.timestamp, true)}</p>
              <p className="mt-1 text-sm text-stone-600">{item.summary && item.summary !== 'Open-Meteo observation' ? item.summary : weatherCondition(item.weatherCode)} | {formatTemperature(item.temperatureC)}</p>
              <p className="text-sm text-stone-600">Precipitation {item.precipitationMm ?? '-'} mm, wind {item.windKph ?? '-'} kph, humidity {item.humidityPercent ?? '-'}%</p>
              {(item.precipitationMm ?? 0) >= 2 ? <p className="mt-2 text-sm font-semibold text-amber-800">Rainfall recorded near this snapshot.</p> : null}
              {(item.windKph ?? 0) >= 40 ? <p className="mt-2 text-sm font-semibold text-amber-800">Strong wind recorded during this section.</p> : null}
              {(item.temperatureC ?? 0) >= 35 ? <p className="mt-2 text-sm font-semibold text-amber-800">High heat recorded during this section.</p> : null}
              {(item.humidityPercent ?? 0) >= 85 ? <p className="mt-2 text-sm font-semibold text-amber-800">High humidity recorded during this section.</p> : null}
              {[45, 48].includes(item.weatherCode ?? -1) ? <p className="mt-2 text-sm font-semibold text-amber-800">Fog indicated; visibility may have been reduced.</p> : null}
            </article>)}
          </div>
        ) : <p className="text-stone-600">Weather snapshots are captured from Open-Meteo at recorded trip locations.</p>}
        {weather.length ? <p className="mt-4 text-sm text-stone-600">Conditions recorded during these sections of the journey are informational and are not a safety guarantee.</p> : null}
        {weather.length ? <div className="mt-6 border-t border-stone-200 pt-5"><h3 className="font-serif text-2xl">Exposure Estimate</h3>{weatherAnalysis.sufficient ? <><dl className="mt-4 grid grid-cols-2 gap-5 lg:grid-cols-4"><Stat label="Sampled rain riding" value={formatDuration(weatherAnalysis.rainMinutes)} /><Stat label="Wet-condition speed" value={formatSpeed(weatherAnalysis.wetAverageSpeedKph)} /><Stat label="High heat" value={formatDuration(weatherAnalysis.heatMinutes)} /><Stat label="Strong wind" value={formatDuration(weatherAnalysis.windMinutes)} /><Stat label="Wet periods" value={`${weatherAnalysis.wetRoadPeriods}`} /><Stat label="Temperature range" value={`${formatTemperature(weatherAnalysis.minimumTemperatureC)} to ${formatTemperature(weatherAnalysis.maximumTemperatureC)}`} /></dl><p className="mt-4 text-sm text-stone-600">Estimated from weather samples within 15 minutes of moving GPS segments. {Math.round(weatherAnalysis.coveredMinutes / Math.max(weatherAnalysis.ridingMinutes, 1) * 100)}% of eligible recorded riding time was sampled; conditions may differ between points.</p></> : <p className="mt-3 text-sm text-stone-600">Not enough paired GPS and weather records to estimate riding hours in rain, heat, or wind.</p>}</div> : null}
      </Section> : null}
    </div>
  )
}
