import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { Button, ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input, Select, Textarea } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { Stat } from '../components/ui/Stat'
import { useFuelLogs, useInvalidateMyRide, useMotorcycles, useSettings, useTrips } from '../hooks/useMyRideData'
import { repository } from '../repositories/localRepository'
import { fuelAnalytics } from '../services/fuel/calculations'
import type { FuelLog } from '../types/myride'
import { formatDate, formatFuelVolume, formatKm, formatMileage, formatMoney, toLocalDateTimeInput } from '../utils/record'

const emptyForm = {
  motorcycleId: '', tripId: '', dateTime: toLocalDateTimeInput(),
  odometerKm: '', litres: '', pricePerLitre: '', totalCost: '', station: '', fullTank: true, notes: '',
}

export function FuelPage() {
  const [params, setParams] = useSearchParams()
  const { data: motorcycles = [] } = useMotorcycles()
  const { data: trips = [] } = useTrips()
  const { data: logs = [] } = useFuelLogs()
  useSettings()
  const invalidate = useInvalidateMyRide()
  const [editingId, setEditingId] = useState<string>()
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const requestedMotorcycleId = params.get('motorcycleId')
  const selectedMotorcycleId = motorcycles.some((bike) => bike.id === requestedMotorcycleId) ? requestedMotorcycleId! : motorcycles.find((bike) => bike.active)?.id ?? ''
  const selectedLogs = useMemo(() => logs.filter((log) => log.motorcycleId === selectedMotorcycleId).sort((a, b) => b.odometerKm - a.odometerKm), [logs, selectedMotorcycleId])
  const analytics = useMemo(() => fuelAnalytics(selectedLogs), [selectedLogs])
  const effectiveMotorcycleId = form.motorcycleId || selectedMotorcycleId
  const selectedTrips = trips.filter((trip) => trip.motorcycleId === effectiveMotorcycleId)

  function selectMotorcycle(id: string) {
    setParams(id ? { motorcycleId: id } : {})
    setEditingId(undefined)
    setForm({ ...emptyForm, dateTime: toLocalDateTimeInput(), motorcycleId: id })
  }

  function edit(log: FuelLog) {
    setEditingId(log.id)
    setForm({
      motorcycleId: log.motorcycleId, tripId: log.tripId ?? '',
      dateTime: toLocalDateTimeInput(log.dateTime), odometerKm: String(log.odometerKm),
      litres: String(log.litres), pricePerLitre: log.pricePerLitre === undefined ? '' : String(log.pricePerLitre),
      totalCost: log.totalCost === undefined ? '' : String(log.totalCost),
      station: log.station ?? '', fullTank: log.fullTank, notes: log.notes ?? '',
    })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function save(event: FormEvent) {
    event.preventDefault()
    if (saving) return
    setError('')
    const odometerKm = Number(form.odometerKm)
    const litres = Number(form.litres)
    const pricePerLitre = form.pricePerLitre ? Number(form.pricePerLitre) : undefined
    const enteredTotalCost = form.totalCost === '' ? undefined : Number(form.totalCost)
    if (!effectiveMotorcycleId || !Number.isFinite(odometerKm) || odometerKm < 0 || !Number.isFinite(litres) || litres <= 0) {
      setError('Choose a motorcycle and enter a valid odometer and fuel quantity.')
      return
    }
    if ((pricePerLitre !== undefined && (!Number.isFinite(pricePerLitre) || pricePerLitre < 0)) || (enteredTotalCost !== undefined && (!Number.isFinite(enteredTotalCost) || enteredTotalCost < 0))) {
      setError('Enter a valid price and total cost.')
      return
    }
    if (form.tripId && !trips.some((trip) => trip.id === form.tripId && trip.motorcycleId === effectiveMotorcycleId)) {
      setError('The selected trip belongs to a different motorcycle.')
      return
    }
    const date = new Date(form.dateTime)
    if (Number.isNaN(date.getTime())) { setError('Enter a valid fuel date and time.'); return }
    const payload = {
      motorcycleId: effectiveMotorcycleId, tripId: form.tripId || undefined,
      dateTime: date.toISOString(), odometerKm, litres,
      pricePerLitre, totalCost: enteredTotalCost ?? (pricePerLitre === undefined ? undefined : pricePerLitre * litres),
      station: form.station.trim(), fullTank: form.fullTank, notes: form.notes.trim(),
    }
    setSaving(true)
    try {
      if (editingId) await repository.fuelLogs.update(editingId, payload)
      else await repository.fuelLogs.create(payload)
      setEditingId(undefined)
      setForm({ ...emptyForm, dateTime: toLocalDateTimeInput(), motorcycleId: selectedMotorcycleId })
      await invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Fuel fill could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(log: FuelLog) {
    if (!window.confirm(`Delete the ${log.litres} L fuel fill at ${formatKm(log.odometerKm)}? Mileage will recalculate.`)) return
    setError('')
    try {
      await repository.fuelLogs.remove(log.id)
      await invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Fuel fill could not be deleted.')
    }
  }

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader eyebrow="Garage / Fuel" title="Fuel Journal" actions={<ButtonLink to="/garage" variant="outline">Back to garage</ButtonLink>} />

      {motorcycles.length ? <Field label="Motorcycle"><Select value={selectedMotorcycleId} onChange={(event) => selectMotorcycle(event.target.value)}><option value="">Select a motorcycle</option>{motorcycles.map((bike) => <option key={bike.id} value={bike.id}>{bike.nickname || `${bike.manufacturer} ${bike.model}`}</option>)}</Select></Field> : <EmptyState title="ADD A MOTORCYCLE FIRST"><p>Fuel history belongs to a specific motorcycle.</p><ButtonLink to="/garage" className="mt-4">Add motorcycle</ButtonLink></EmptyState>}

      {motorcycles.length ? <>
        <dl className="grid gap-5 border-y border-stone-200 py-5 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Recent mileage" value={formatMileage(analytics.recentAverageMileage)} detail={`${analytics.verifiedIntervals} verified intervals`} />
          <Stat label="Lifetime average" value={formatMileage(analytics.averageMileage)} />
          <Stat label="Best" value={formatMileage(analytics.bestMileage)} />
          <Stat label="Lowest" value={formatMileage(analytics.lowestMileage)} />
          <Stat label="Fuel consumed" value={formatFuelVolume(analytics.totalLitres)} />
          <Stat label="Fuel cost" value={formatMoney(analytics.totalFuelCost)} />
        </dl>
        <p className="text-sm text-stone-600">{analytics.averageFuelPrice === undefined ? 'Average fuel price unavailable' : `Average fuel price: ${formatMoney(analytics.averageFuelPrice, undefined, 2)} per litre`}. {analytics.costPerKm === undefined ? 'Verified cost per km unavailable.' : `Verified cost: ${formatMoney(analytics.costPerKm, undefined, 2)} per km.`}</p>
        <Section title={editingId ? 'Edit Fuel Fill' : 'Log Fuel'}>
          <form onSubmit={save} className="surface-panel grid gap-4 p-5 md:p-6">
            <fieldset disabled={saving} className="grid gap-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <Field label="Date and time"><Input required type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} /></Field>
              <Field label="Odometer km"><Input required type="number" min="0" step="0.1" value={form.odometerKm} onChange={(e) => setForm({ ...form, odometerKm: e.target.value })} /></Field>
              <Field label="Litres"><Input required type="number" min="0.01" step="0.01" value={form.litres} onChange={(e) => setForm({ ...form, litres: e.target.value, totalCost: form.pricePerLitre ? '' : form.totalCost })} /></Field>
              <Field label="Price per litre"><Input type="number" min="0" step="0.01" value={form.pricePerLitre} onChange={(e) => setForm({ ...form, pricePerLitre: e.target.value, totalCost: '' })} /></Field>
              <Field label="Total cost"><Input type="number" min="0" step="0.01" value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: e.target.value })} /></Field>
              <Field label="Station"><Input value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} /></Field>
              <Field label="Trip"><Select value={form.tripId} onChange={(e) => setForm({ ...form, tripId: e.target.value })}><option value="">No trip</option>{selectedTrips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</Select></Field>
            </div>
            <label className="flex min-h-12 items-center gap-3 text-sm font-semibold"><input type="checkbox" className="size-5 accent-teal-900" checked={form.fullTank} onChange={(e) => setForm({ ...form, fullTank: e.target.checked })} /> Full tank</label>
            <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
            {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
            <div className="flex gap-3"><Button type="submit">{saving ? 'Saving...' : editingId ? 'Save changes' : 'Log fuel'}</Button>{editingId ? <Button type="button" variant="outline" onClick={() => { setEditingId(undefined); setForm({ ...emptyForm, motorcycleId: selectedMotorcycleId }) }}>Cancel</Button> : null}</div>
            </fieldset>
          </form>
        </Section>
        <Section title="Fuel History">
          {selectedLogs.length ? <div className="grid gap-2">{selectedLogs.map((log) => <article key={log.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 py-3"><div><p className="font-semibold">{formatKm(log.odometerKm)} | {formatFuelVolume(log.litres)} {log.fullTank ? '| Full tank' : '| Partial fill'}</p><p className="text-sm text-stone-600">{formatDate(log.dateTime, true)} | {log.station || 'Station not recorded'} | {log.totalCost === undefined ? 'Cost unavailable' : formatMoney(log.totalCost)}</p></div><div className="flex gap-2"><Button variant="ghost" aria-label={`Edit fuel fill at ${formatKm(log.odometerKm)}`} onClick={() => edit(log)}><Pencil size={18} /></Button><Button variant="ghost" aria-label={`Delete fuel fill at ${formatKm(log.odometerKm)}`} onClick={() => remove(log)}><Trash2 size={18} /></Button></div></article>)}</div> : <EmptyState title="NO FUEL RECORDS">Record two full-tank fills to calculate verified mileage. Partial fills are included only when the next full tank is recorded.</EmptyState>}
        </Section>
        <Section title="Verified Mileage Intervals">
          {analytics.intervals.length ? <div className="grid gap-2">{[...analytics.intervals].reverse().map((interval) => <article key={`${interval.startFuelId}-${interval.endFuelId}`} className="grid gap-1 border-b border-stone-200 py-3 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-4"><div><p className="font-semibold">{formatKm(interval.startOdometerKm)} to {formatKm(interval.endOdometerKm)}</p><p className="text-sm text-stone-600">{formatKm(interval.distanceKm)} travelled using {formatFuelVolume(interval.litres)}</p></div><p className="font-serif text-2xl text-teal-900">{formatMileage(interval.mileageKmPerLitre)}</p></article>)}</div> : <p className="text-sm text-stone-600">Mileage remains unavailable until a full-tank fill is followed by another full-tank fill. Partial fuel added between them will be included.</p>}
        </Section>
      </> : null}
    </div>
  )
}
