import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Calculator, Check, Gauge, Pencil, Trash2 } from 'lucide-react'
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
  const selectedMotorcycle = motorcycles.find((bike) => bike.id === selectedMotorcycleId)

  function selectMotorcycle(id: string) {
    setParams(id ? { motorcycleId: id } : {})
    setEditingId(undefined)
    setForm({ ...emptyForm, dateTime: toLocalDateTimeInput(), motorcycleId: id })
  }

  function edit(log: FuelLog) {
    setEditingId(log.id)
    setForm({ motorcycleId: log.motorcycleId, tripId: log.tripId ?? '', dateTime: toLocalDateTimeInput(log.dateTime), odometerKm: String(log.odometerKm), litres: String(log.litres), pricePerLitre: log.pricePerLitre === undefined ? '' : String(log.pricePerLitre), totalCost: log.totalCost === undefined ? '' : String(log.totalCost), station: log.station ?? '', fullTank: log.fullTank, notes: log.notes ?? '' })
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
    if (!effectiveMotorcycleId || !Number.isFinite(odometerKm) || odometerKm < 0 || !Number.isFinite(litres) || litres <= 0) { setError('Choose a motorcycle and enter a valid odometer and fuel quantity.'); return }
    if ((pricePerLitre !== undefined && (!Number.isFinite(pricePerLitre) || pricePerLitre < 0)) || (enteredTotalCost !== undefined && (!Number.isFinite(enteredTotalCost) || enteredTotalCost < 0))) { setError('Enter a valid price and total cost.'); return }
    if (form.tripId && !trips.some((trip) => trip.id === form.tripId && trip.motorcycleId === effectiveMotorcycleId)) { setError('The selected trip belongs to a different motorcycle.'); return }
    const date = new Date(form.dateTime)
    if (Number.isNaN(date.getTime())) { setError('Enter a valid fuel date and time.'); return }
    const payload = { motorcycleId: effectiveMotorcycleId, tripId: form.tripId || undefined, dateTime: date.toISOString(), odometerKm, litres, pricePerLitre, totalCost: enteredTotalCost ?? (pricePerLitre === undefined ? undefined : pricePerLitre * litres), station: form.station.trim(), fullTank: form.fullTank, notes: form.notes.trim() }
    setSaving(true)
    try {
      if (editingId) await repository.fuelLogs.update(editingId, payload)
      else await repository.fuelLogs.create(payload)
      setEditingId(undefined)
      setForm({ ...emptyForm, dateTime: toLocalDateTimeInput(), motorcycleId: selectedMotorcycleId })
      await invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Fuel fill could not be saved.')
    } finally { setSaving(false) }
  }

  async function remove(log: FuelLog) {
    if (!window.confirm(`Delete the ${log.litres} L fuel fill at ${formatKm(log.odometerKm)}? Mileage will recalculate.`)) return
    setError('')
    try { await repository.fuelLogs.remove(log.id); await invalidate() }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Fuel fill could not be deleted.') }
  }

  return (
    <div className="grid gap-8 md:gap-10">
      <PageHeader eyebrow="Garage / Fuel" title="Fuel Journal" description="Record what actually happened at the pump. MyRide derives mileage from odometer movement and fuel added—there is no mileage field to maintain." actions={<ButtonLink to="/garage" variant="outline">Back to garage</ButtonLink>} />

      {motorcycles.length ? <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="surface-ink p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal-100/60">Current fuel record</p><h2 className="font-serif mt-2 text-3xl text-white sm:text-4xl">{selectedMotorcycle?.nickname || (selectedMotorcycle ? `${selectedMotorcycle.manufacturer} ${selectedMotorcycle.model}` : 'Select motorcycle')}</h2></div>
            <div className="min-w-[13rem]"><Field label="Motorcycle"><Select value={selectedMotorcycleId} onChange={(event) => selectMotorcycle(event.target.value)}><option value="">Select a motorcycle</option>{motorcycles.map((bike) => <option key={bike.id} value={bike.id}>{bike.nickname || `${bike.manufacturer} ${bike.model}`}</option>)}</Select></Field></div>
          </div>
          <dl className="mt-8 grid gap-5 sm:grid-cols-3">
            <div><dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/60">Recent mileage</dt><dd className="metric-number mt-2 text-3xl font-semibold text-white">{formatMileage(analytics.recentAverageMileage)}</dd><p className="mt-1 text-xs text-teal-50/55">{analytics.verifiedIntervals} verified intervals</p></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/60">Fuel consumed</dt><dd className="metric-number mt-2 text-3xl font-semibold text-white">{formatFuelVolume(analytics.totalLitres)}</dd></div>
            <div><dt className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/60">Fuel cost</dt><dd className="metric-number mt-2 text-3xl font-semibold text-white">{formatMoney(analytics.totalFuelCost)}</dd></div>
          </dl>
        </div>

        <aside className="surface-panel p-5 sm:p-6">
          <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-full bg-teal-50 text-teal-900"><Calculator size={19} /></span><div><p className="text-[11px] font-bold uppercase tracking-[0.13em] text-stone-500">Automatic mileage</p><h2 className="font-serif text-2xl">How it works</h2></div></div>
          <div className="mt-5 grid gap-4 text-sm leading-6 text-stone-600">
            <div className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-bold text-stone-700">1</span><p>Record a <strong className="text-stone-900">full tank</strong> and its odometer.</p></div>
            <div className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-bold text-stone-700">2</span><p>Ride normally. Partial fills can be recorded in between.</p></div>
            <div className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-teal-100 text-xs font-bold text-teal-900">3</span><p>The next full tank closes the interval. MyRide calculates <strong className="text-stone-900">distance ÷ fuel used</strong>.</p></div>
          </div>
        </aside>
      </section> : <EmptyState title="ADD A MOTORCYCLE FIRST"><p>Fuel history belongs to a specific motorcycle.</p><ButtonLink to="/garage" className="mt-4">Add motorcycle</ButtonLink></EmptyState>}

      {motorcycles.length ? <>
        <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Recent mileage" value={formatMileage(analytics.recentAverageMileage)} detail={`${analytics.verifiedIntervals} verified intervals`} />
          <Stat label="Lifetime average" value={formatMileage(analytics.averageMileage)} />
          <Stat label="Best" value={formatMileage(analytics.bestMileage)} />
          <Stat label="Lowest" value={formatMileage(analytics.lowestMileage)} />
          <Stat label="Cost per km" value={analytics.costPerKm === undefined ? '—' : formatMoney(analytics.costPerKm, undefined, 2)} />
        </dl>
        <p className="text-sm text-stone-600">{analytics.averageFuelPrice === undefined ? 'Average fuel price unavailable.' : `Average fuel price: ${formatMoney(analytics.averageFuelPrice, undefined, 2)} per litre.`}</p>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
          <Section title={editingId ? 'Edit Fuel Fill' : 'Log Fuel'}>
            <form onSubmit={save} className="surface-panel grid gap-4 p-5 md:p-6">
              <fieldset disabled={saving} className="grid gap-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Date and time"><Input required type="datetime-local" value={form.dateTime} onChange={(e) => setForm({ ...form, dateTime: e.target.value })} /></Field>
                  <Field label="Odometer km"><Input required type="number" min="0" step="0.1" value={form.odometerKm} onChange={(e) => setForm({ ...form, odometerKm: e.target.value })} /></Field>
                  <Field label="Litres"><Input required type="number" min="0.01" step="0.01" value={form.litres} onChange={(e) => setForm({ ...form, litres: e.target.value, totalCost: form.pricePerLitre ? '' : form.totalCost })} /></Field>
                  <Field label="Price per litre"><Input type="number" min="0" step="0.01" value={form.pricePerLitre} onChange={(e) => setForm({ ...form, pricePerLitre: e.target.value, totalCost: '' })} /></Field>
                  <Field label="Total cost"><Input type="number" min="0" step="0.01" value={form.totalCost} onChange={(e) => setForm({ ...form, totalCost: e.target.value })} /></Field>
                  <Field label="Station"><Input value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} /></Field>
                  <Field label="Trip"><Select value={form.tripId} onChange={(e) => setForm({ ...form, tripId: e.target.value })}><option value="">No trip</option>{selectedTrips.map((trip) => <option key={trip.id} value={trip.id}>{trip.title}</option>)}</Select></Field>
                </div>
                <label className={`flex min-h-14 items-center gap-3 rounded-xl border px-4 text-sm font-semibold transition ${form.fullTank ? 'border-teal-200 bg-teal-50 text-teal-950' : 'border-stone-200 bg-stone-50 text-stone-700'}`}><input type="checkbox" className="size-5 accent-teal-900" checked={form.fullTank} onChange={(e) => setForm({ ...form, fullTank: e.target.checked })} /><span className="grid size-7 place-items-center rounded-full bg-white">{form.fullTank ? <Check size={15} /> : <Gauge size={15} />}</span> Full tank — use this fill for verified mileage</label>
                <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
                <div className="flex flex-wrap gap-3"><Button type="submit">{saving ? 'Saving...' : editingId ? 'Save changes' : 'Log fuel'}</Button>{editingId ? <Button type="button" variant="outline" onClick={() => { setEditingId(undefined); setForm({ ...emptyForm, motorcycleId: selectedMotorcycleId }) }}>Cancel</Button> : null}</div>
              </fieldset>
            </form>
          </Section>

          <Section title="Fuel History">
            {selectedLogs.length ? <div className="divide-y divide-stone-200 border-y border-stone-200">{selectedLogs.map((log) => <article key={log.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{formatFuelVolume(log.litres)} at {formatKm(log.odometerKm)}</p><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] ${log.fullTank ? 'bg-teal-50 text-teal-900' : 'bg-stone-100 text-stone-600'}`}>{log.fullTank ? 'Full tank' : 'Partial'}</span></div><p className="mt-1 text-sm text-stone-600">{formatDate(log.dateTime, true)} · {log.station || 'Station not recorded'} · {log.totalCost === undefined ? 'Cost unavailable' : formatMoney(log.totalCost)}</p></div><div className="flex gap-1"><Button variant="ghost" aria-label={`Edit fuel fill at ${formatKm(log.odometerKm)}`} onClick={() => edit(log)}><Pencil size={17} /></Button><Button variant="ghost" aria-label={`Delete fuel fill at ${formatKm(log.odometerKm)}`} onClick={() => remove(log)}><Trash2 size={17} /></Button></div></article>)}</div> : <EmptyState title="NO FUEL RECORDS">Record two full-tank fills to calculate verified mileage. Partial fills are included only when the next full tank is recorded.</EmptyState>}
          </Section>
        </section>

        <Section title="Verified Mileage Intervals">
          {analytics.intervals.length ? <div className="surface-panel overflow-hidden"><div className="divide-y divide-stone-200">{[...analytics.intervals].reverse().map((interval) => <article key={`${interval.startFuelId}-${interval.endFuelId}`} className="grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center sm:px-6"><div><p className="font-semibold">{formatKm(interval.startOdometerKm)} → {formatKm(interval.endOdometerKm)}</p><p className="mt-1 text-sm text-stone-600">{formatKm(interval.distanceKm)} travelled · {formatFuelVolume(interval.litres)} used</p></div><p className="font-serif text-3xl text-teal-900">{formatMileage(interval.mileageKmPerLitre)}</p></article>)}</div></div> : <div className="surface-muted p-5 text-sm leading-6 text-stone-600">Mileage remains unavailable until a full-tank fill is followed by another full-tank fill. Partial fuel added between them will be included.</div>}
        </Section>
      </> : null}
    </div>
  )
}
