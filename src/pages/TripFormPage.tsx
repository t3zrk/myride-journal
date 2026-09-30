import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { LocationSearchField } from '../components/LocationSearchField'
import { Button, ButtonLink } from '../components/ui/Button'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { useInvalidateMyRide, useMotorcycles } from '../hooks/useMyRideData'
import { repository } from '../repositories/localRepository'
import type { Trip, TripStatus } from '../types/myride'
import { toLocalDateTimeInput } from '../utils/record'

type StopForm = { id: string; label: string; latitude: string; longitude: string; plannedAt: string; notes: string }

function coordinate(value: string, min: number, max: number) {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`Coordinate must be between ${min} and ${max}.`)
  return parsed
}

function coordinatePair(latitudeValue: string, longitudeValue: string) {
  const latitude = coordinate(latitudeValue, -90, 90)
  const longitude = coordinate(longitudeValue, -180, 180)
  if ((latitude === undefined) !== (longitude === undefined)) throw new Error('Enter both latitude and longitude, or leave both blank.')
  return { latitude, longitude }
}

export function TripFormPage() {
  const { tripId } = useParams()
  const editing = Boolean(tripId)
  const navigate = useNavigate()
  const invalidate = useInvalidateMyRide()
  const { data: motorcycles = [] } = useMotorcycles()
  const [existing, setExisting] = useState<Trip | undefined>()
  const [missing, setMissing] = useState(false)
  const [loading, setLoading] = useState(editing)
  const [error, setError] = useState('')
  const [stops, setStops] = useState<StopForm[]>([])
  const [form, setForm] = useState({
    title: '',
    origin: '',
    originLatitude: '', originLongitude: '',
    destination: '',
    destinationLatitude: '', destinationLongitude: '',
    startDate: toLocalDateTimeInput(),
    endDate: '',
    motorcycleId: '',
    status: 'Planned' as TripStatus,
    notes: '',
  })

  useEffect(() => {
    if (!tripId) return
    Promise.all([repository.trips.get(tripId), repository.plannedStops.byTrip(tripId)]).then(([trip, plannedStops]) => {
      if (!trip || trip.deletedAt) {
        setMissing(true)
        setLoading(false)
        return
      }
      setExisting(trip)
      setStops(plannedStops.map((stop) => ({ id: stop.id, label: stop.label, latitude: stop.latitude === undefined ? '' : String(stop.latitude), longitude: stop.longitude === undefined ? '' : String(stop.longitude), plannedAt: stop.plannedAt ? toLocalDateTimeInput(stop.plannedAt) : '', notes: stop.notes ?? '' })))
      setForm({
        title: trip.title,
        origin: trip.origin.label,
        originLatitude: trip.origin.latitude === undefined ? '' : String(trip.origin.latitude),
        originLongitude: trip.origin.longitude === undefined ? '' : String(trip.origin.longitude),
        destination: trip.destination.label,
        destinationLatitude: trip.destination.latitude === undefined ? '' : String(trip.destination.latitude),
        destinationLongitude: trip.destination.longitude === undefined ? '' : String(trip.destination.longitude),
        startDate: toLocalDateTimeInput(trip.startDate),
        endDate: trip.endDate ? toLocalDateTimeInput(trip.endDate) : '',
        motorcycleId: trip.motorcycleId ?? '',
        status: trip.status,
        notes: trip.notes ?? '',
      })
      setLoading(false)
    })
  }, [tripId])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    if (!form.title.trim() || !form.origin.trim() || !form.destination.trim()) return

    setError('')
    try {
      const startDate = new Date(form.startDate)
      const endDate = form.endDate ? new Date(form.endDate) : undefined
      if (Number.isNaN(startDate.getTime()) || (endDate && Number.isNaN(endDate.getTime()))) throw new Error('Enter valid trip dates.')
      if (endDate && endDate < startDate) throw new Error('End date must be after the start date.')
      if (form.status === 'Completed' && !endDate) throw new Error('A completed trip needs an end date.')
      const durationMinutes = form.status === 'Completed' && endDate ? Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 60000)) : undefined
      const origin = { label: form.origin.trim(), ...coordinatePair(form.originLatitude, form.originLongitude) }
      const destination = { label: form.destination.trim(), ...coordinatePair(form.destinationLatitude, form.destinationLongitude) }
      if (stops.some((stop) => !stop.label.trim())) throw new Error('Every planned stop needs a name.')
      const validatedStops = stops.map((stop) => ({ id: stop.id, label: stop.label.trim(), ...coordinatePair(stop.latitude, stop.longitude), plannedAt: stop.plannedAt ? new Date(stop.plannedAt).toISOString() : undefined, notes: stop.notes.trim() }))
      const tripPayload = {
        title: form.title.trim(),
        origin,
        destination,
        startDate: startDate.toISOString(),
        endDate: endDate?.toISOString(),
        durationMinutes,
        motorcycleId: form.motorcycleId || undefined,
        status: form.status,
        notes: form.notes,
      }

      if (editing && existing) {
        await repository.trips.updateWithStops(existing.id, tripPayload, validatedStops)
        invalidate()
        navigate(`/trips/${existing.id}`)
        return
      }

      const created = await repository.trips.createWithStops(tripPayload, validatedStops)
      invalidate()
      navigate(`/trips/${created.id}`)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Trip could not be saved.')
    }
  }

  function addStop() {
    setStops((current) => [...current, { id: crypto.randomUUID(), label: '', latitude: '', longitude: '', plannedAt: '', notes: '' }])
  }

  function updateStop(id: string, updates: Partial<StopForm>) {
    setStops((current) => current.map((stop) => stop.id === id ? { ...stop, ...updates } : stop))
  }

  if (missing) {
    return (
      <div className="grid gap-4">
        <h1 className="font-serif text-4xl">Trip not found</h1>
        <p>MyRide will not load another trip as a fallback.</p>
        <ButtonLink to="/trips">Back to trips</ButtonLink>
      </div>
    )
  }

  if (loading) return <div className="h-52 animate-pulse rounded-md bg-stone-200" aria-label="Loading trip" />

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      <PageHeader eyebrow={editing ? 'Edit trip' : 'Create trip'} title={editing ? 'Edit Journey Details' : 'Record a New Journey'} />

      <form onSubmit={onSubmit} className="surface-panel grid gap-5 p-5 md:p-6">
        <Field label="Trip name">
          <Input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
        </Field>
        <div className="grid gap-5 md:grid-cols-2">
          <LocationSearchField label="Start location" searchLabel="Find origin" value={form.origin} onChange={(value) => setForm((current) => ({ ...current, origin: value, originLatitude: '', originLongitude: '' }))} onSelect={(location) => setForm((current) => ({ ...current, origin: location.label, originLatitude: String(location.latitude), originLongitude: String(location.longitude) }))} />
          <LocationSearchField label="Destination" searchLabel="Find arrival" value={form.destination} onChange={(value) => setForm((current) => ({ ...current, destination: value, destinationLatitude: '', destinationLongitude: '' }))} onSelect={(location) => setForm((current) => ({ ...current, destination: location.label, destinationLatitude: String(location.latitude), destinationLongitude: String(location.longitude) }))} />
        </div>
        <p className="text-xs text-stone-500">Place search data &copy; OpenStreetMap contributors, served by Nominatim.</p>
        <details className="border-b border-stone-200 pb-4"><summary className="cursor-pointer font-semibold">Manual coordinates</summary><div className="mt-4 grid gap-4 md:grid-cols-2"><Field label="Origin latitude"><Input type="number" min="-90" max="90" step="any" value={form.originLatitude} onChange={(e) => setForm({ ...form, originLatitude: e.target.value })} /></Field><Field label="Origin longitude"><Input type="number" min="-180" max="180" step="any" value={form.originLongitude} onChange={(e) => setForm({ ...form, originLongitude: e.target.value })} /></Field><Field label="Destination latitude"><Input type="number" min="-90" max="90" step="any" value={form.destinationLatitude} onChange={(e) => setForm({ ...form, destinationLatitude: e.target.value })} /></Field><Field label="Destination longitude"><Input type="number" min="-180" max="180" step="any" value={form.destinationLongitude} onChange={(e) => setForm({ ...form, destinationLongitude: e.target.value })} /></Field></div></details>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Start date">
            <Input type="datetime-local" required value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
          </Field>
          <Field label="End date">
            <Input type="datetime-local" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
          </Field>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          <Field label="Motorcycle">
            <Select value={form.motorcycleId} onChange={(event) => setForm({ ...form, motorcycleId: event.target.value })}>
              <option value="">No motorcycle selected</option>
              {motorcycles.map((motorcycle) => <option key={motorcycle.id} value={motorcycle.id}>{motorcycle.nickname || `${motorcycle.manufacturer} ${motorcycle.model}`}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as TripStatus })}>
              {['Planned', 'Active', 'Completed', 'Cancelled'].map((value) => <option key={value}>{value}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Notes">
          <Textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
        </Field>
        <div className="grid gap-3 border-t border-stone-200 pt-5"><div className="flex items-center justify-between gap-3"><h2 className="font-serif text-2xl">Planned Stops</h2><Button type="button" variant="outline" onClick={addStop}>Add stop</Button></div>{stops.map((stop, index) => <div key={stop.id} className="grid gap-3 border-b border-stone-200 pb-4"><div className="flex items-center justify-between"><p className="font-semibold">Stop {index + 1}</p><Button type="button" variant="ghost" onClick={() => setStops((current) => current.filter((item) => item.id !== stop.id))}>Remove</Button></div><LocationSearchField label="Location" searchLabel={`Find stop ${index + 1}`} value={stop.label} onChange={(value) => updateStop(stop.id, { label: value, latitude: '', longitude: '' })} onSelect={(location) => updateStop(stop.id, { label: location.label, latitude: String(location.latitude), longitude: String(location.longitude) })} /><div className="grid gap-3 md:grid-cols-3"><Field label="Planned arrival"><Input type="datetime-local" value={stop.plannedAt} onChange={(e) => updateStop(stop.id, { plannedAt: e.target.value })} /></Field><Field label="Latitude"><Input type="number" min="-90" max="90" step="any" value={stop.latitude} onChange={(e) => updateStop(stop.id, { latitude: e.target.value })} /></Field><Field label="Longitude"><Input type="number" min="-180" max="180" step="any" value={stop.longitude} onChange={(e) => updateStop(stop.id, { longitude: e.target.value })} /></Field></div><Field label="Notes"><Input value={stop.notes} onChange={(e) => updateStop(stop.id, { notes: e.target.value })} /></Field></div>)}</div>
        {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
        <div className="flex flex-wrap gap-3">
          <Button type="submit">{editing ? 'Save changes' : 'Create trip'}</Button>
          <ButtonLink to={editing && existing ? `/trips/${existing.id}` : '/trips'} variant="outline">Cancel</ButtonLink>
        </div>
      </form>
    </div>
  )
}
