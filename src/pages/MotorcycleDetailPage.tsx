import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Pencil, Trash2 } from 'lucide-react'
import { Button, ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input, Textarea } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { Stat } from '../components/ui/Stat'
import { useFuelLogs, useInvalidateMyRide, useSettings, useTrips } from '../hooks/useMyRideData'
import { repository } from '../repositories/localRepository'
import { estimateSafeRangeKm, fuelAnalytics } from '../services/fuel/calculations'
import { compressImageToDataUrl } from '../services/photos/images'
import { estimateServiceHealth, latestGeneralService, trackedComponents } from '../services/maintenance'
import type { MaintenanceLog, Motorcycle } from '../types/myride'
import { formatDate, formatKm, formatMileage, formatMoney, toLocalDateInput } from '../utils/record'

export function MotorcycleDetailPage() {
  const { motorcycleId } = useParams()
  const navigate = useNavigate()
  const invalidate = useInvalidateMyRide()
  const { data: fuelLogs = [] } = useFuelLogs()
  const { data: settings } = useSettings()
  const { data: trips = [] } = useTrips()
  const [motorcycle, setMotorcycle] = useState<Motorcycle>()
  const [loadedMotorcycleId, setLoadedMotorcycleId] = useState<string>()
  const [maintenance, setMaintenance] = useState<MaintenanceLog[]>([])
  const [form, setForm] = useState({ date: toLocalDateInput(), serviceType: '', component: '', odometerKm: '', workshop: '', cost: '', notes: '' })
  const [editingMaintenanceId, setEditingMaintenanceId] = useState<string>()
  const [editingMotorcycle, setEditingMotorcycle] = useState(false)
  const [bikeForm, setBikeForm] = useState({ manufacturer: '', model: '', variant: '', nickname: '', year: '', registration: '', engineCapacityCc: '', tankCapacityLitres: '', fuelType: '', currentOdometerKm: '', serviceIntervalKm: '', tyreInformation: '', notes: '' })
  const [bikePhoto, setBikePhoto] = useState<File>()
  const [bikeError, setBikeError] = useState('')
  const [maintenanceError, setMaintenanceError] = useState('')

  useEffect(() => {
    if (!motorcycleId) return
    let cancelled = false
    const refreshFromStore = () => {
      void Promise.all([repository.motorcycles.get(motorcycleId), repository.maintenance.byMotorcycle(motorcycleId)]).then(([bike, logs]) => {
        if (cancelled) return
        setMotorcycle(bike && !bike.deletedAt ? bike : undefined)
        if (bike && !bike.deletedAt && !editingMotorcycle) setBikeForm({ manufacturer: bike.manufacturer, model: bike.model, variant: bike.variant ?? '', nickname: bike.nickname ?? '', year: bike.year ? String(bike.year) : '', registration: bike.registration ?? '', engineCapacityCc: bike.engineCapacityCc ? String(bike.engineCapacityCc) : '', tankCapacityLitres: bike.tankCapacityLitres ? String(bike.tankCapacityLitres) : '', fuelType: bike.fuelType ?? '', currentOdometerKm: String(bike.currentOdometerKm), serviceIntervalKm: bike.serviceIntervalKm ? String(bike.serviceIntervalKm) : '', tyreInformation: bike.tyreInformation ?? '', notes: bike.notes ?? '' })
        setMaintenance(logs)
        setLoadedMotorcycleId(motorcycleId)
      })
    }
    refreshFromStore()
    window.addEventListener('myride:synced', refreshFromStore)
    return () => { cancelled = true; window.removeEventListener('myride:synced', refreshFromStore) }
  }, [motorcycleId, editingMotorcycle])

  if (motorcycleId && loadedMotorcycleId !== motorcycleId) return <div className="h-52 animate-pulse rounded-md bg-stone-200" aria-label="Loading motorcycle" />

  if (!motorcycleId || !motorcycle) {
    return (
      <EmptyState title="MOTORCYCLE NOT FOUND">
        <p>The requested motorcycle could not be loaded.</p>
        <ButtonLink to="/garage" className="mt-5">Back to garage</ButtonLink>
      </EmptyState>
    )
  }

  const currentMotorcycle = motorcycle

  const bikeFuel = fuelLogs.filter((log) => log.motorcycleId === motorcycle.id)
  const analytics = fuelAnalytics(bikeFuel)
  const bikeTrips = trips.filter((trip) => trip.motorcycleId === motorcycle.id)
  const range = estimateSafeRangeKm(motorcycle.tankCapacityLitres, analytics.recentAverageMileage, settings?.safeRangeReservePercent)
  const latestService = latestGeneralService(maintenance)
  const currentOdometer = Math.max(motorcycle.currentOdometerKm, ...bikeFuel.map((log) => log.odometerKm), ...maintenance.map((item) => item.odometerKm))
  const nextServiceKm = latestService && motorcycle.serviceIntervalKm ? latestService.odometerKm + motorcycle.serviceIntervalKm : undefined

  async function saveMotorcycle(event: FormEvent) {
    event.preventDefault()
    setBikeError('')
    try {
      const photoDataUrl = bikePhoto ? await compressImageToDataUrl(bikePhoto) : currentMotorcycle.photoDataUrl
      const saved = await repository.motorcycles.update(currentMotorcycle.id, {
        manufacturer: bikeForm.manufacturer.trim(), model: bikeForm.model.trim(), variant: bikeForm.variant.trim(), nickname: bikeForm.nickname.trim(),
        year: bikeForm.year ? Number(bikeForm.year) : undefined, registration: bikeForm.registration.trim(),
        engineCapacityCc: bikeForm.engineCapacityCc ? Number(bikeForm.engineCapacityCc) : undefined, fuelType: bikeForm.fuelType.trim(),
        tankCapacityLitres: bikeForm.tankCapacityLitres ? Number(bikeForm.tankCapacityLitres) : undefined,
        currentOdometerKm: Number(bikeForm.currentOdometerKm), serviceIntervalKm: bikeForm.serviceIntervalKm ? Number(bikeForm.serviceIntervalKm) : undefined,
        tyreInformation: bikeForm.tyreInformation.trim(), notes: bikeForm.notes.trim(), photoDataUrl,
      })
      setMotorcycle(saved)
      setEditingMotorcycle(false)
      setBikePhoto(undefined)
      invalidate()
    } catch (cause) {
      setBikeError(cause instanceof Error ? cause.message : 'Motorcycle could not be saved.')
    }
  }

  async function deleteMotorcycle() {
    if (!window.confirm('Delete this motorcycle from the garage? Historical trips keep their motorcycle ID, but this dossier will be hidden.')) return
    await repository.motorcycles.remove(currentMotorcycle.id)
    invalidate()
    navigate('/garage')
  }

  function editMaintenance(item: MaintenanceLog) {
    setMaintenanceError('')
    setEditingMaintenanceId(item.id)
    setForm({ date: toLocalDateInput(item.date), serviceType: item.serviceType, component: item.component, odometerKm: String(item.odometerKm), workshop: item.workshop ?? '', cost: item.cost === undefined ? '' : String(item.cost), notes: item.notes ?? '' })
  }

  async function addMaintenance(event: FormEvent) {
    event.preventDefault()
    setMaintenanceError('')
    const payload = {
      motorcycleId: currentMotorcycle.id,
      date: new Date(`${form.date}T12:00:00`).toISOString(),
      odometerKm: Number(form.odometerKm),
      serviceType: form.serviceType.trim(),
      component: form.component.trim(),
      workshop: form.workshop.trim(),
      cost: form.cost ? Number(form.cost) : undefined,
      notes: form.notes.trim(),
    }
    try {
      if (editingMaintenanceId) await repository.maintenance.update(editingMaintenanceId, payload)
      else await repository.maintenance.create(payload)
      setEditingMaintenanceId(undefined)
      setForm({ date: toLocalDateInput(), serviceType: '', component: '', odometerKm: '', workshop: '', cost: '', notes: '' })
      setMaintenance(await repository.maintenance.byMotorcycle(currentMotorcycle.id))
      invalidate()
    } catch (cause) {
      setMaintenanceError(cause instanceof Error ? cause.message : 'Service record could not be saved.')
    }
  }

  async function deleteMaintenance(item: MaintenanceLog) {
    if (!window.confirm(`Delete this ${item.component} service record?`)) return
    await repository.maintenance.remove(item.id)
    setMaintenance(await repository.maintenance.byMotorcycle(currentMotorcycle.id))
    invalidate()
  }

  return (
    <div className="grid gap-6 md:gap-8">
      <section>
        <PageHeader eyebrow="Motorcycle dossier" title={motorcycle.nickname || `${motorcycle.manufacturer} ${motorcycle.model}`} description={`${motorcycle.year || ''} ${motorcycle.registration || ''}`.trim()} actions={<><Button variant="outline" onClick={() => { setBikeError(''); setEditingMotorcycle((value) => !value) }}><Pencil size={17} /> Edit</Button><Button variant="destructive" onClick={deleteMotorcycle}><Trash2 size={17} /> Delete</Button></>} />
        {motorcycle.photoDataUrl ? <img src={motorcycle.photoDataUrl} alt={`${motorcycle.manufacturer} ${motorcycle.model}`} className="mt-5 max-h-80 w-full rounded-md object-cover" /> : null}
        <dl className="surface-panel mt-5 grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Odometer" value={formatKm(currentOdometer)} />
          <Stat label="Current mileage" value={formatMileage(analytics.recentAverageMileage)} />
          <Stat label="Lifetime mileage" value={formatMileage(analytics.averageMileage)} />
          <Stat label="Best mileage" value={formatMileage(analytics.bestMileage)} />
          <Stat label="Safe range" value={range ? `~${formatKm(range)}` : 'Not enough data'} />
          <Stat label="Next service estimate" value={nextServiceKm === undefined ? 'Unknown' : formatKm(nextServiceKm)} />
        </dl>
        <p className="mt-3 text-sm text-stone-600">Service distance is an estimate based on general or engine-oil service records. Other work does not reset it.</p>
      </section>

      <Section title="Component Health">
        <div className="grid gap-0 sm:grid-cols-2 sm:gap-x-8">
          {trackedComponents.map((component) => {
            const last = [...maintenance].filter((item) => item.component.toLowerCase() === component.toLowerCase()).sort((a, b) => b.odometerKm - a.odometerKm)[0]
            const health = component === 'Engine oil' ? estimateServiceHealth(currentOdometer, motorcycle.serviceIntervalKm, last?.odometerKm) : 'UNKNOWN'
            const tone = health === 'DUE' || health === 'OVERDUE' ? 'bg-red-50 text-red-800' : health === 'DUE SOON' ? 'bg-amber-50 text-amber-800' : health === 'GOOD' ? 'bg-green-50 text-green-800' : 'bg-stone-100 text-stone-600'
            return <div key={component} className="flex items-center justify-between gap-3 border-b border-stone-200 py-3"><div><p className="font-semibold">{component}</p><p className="text-xs text-stone-600">{last ? `Last recorded at ${formatKm(last.odometerKm)}` : 'No service record'}</p></div><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{health}</span></div>
          })}
        </div>
        <p className="mt-3 text-sm text-stone-600">Engine-oil status uses the motorcycle service interval as an estimate. Other components remain unknown without a specific schedule.</p>
      </Section>

      {editingMotorcycle ? <Section title="Edit Motorcycle"><form onSubmit={saveMotorcycle} className="surface-panel grid gap-4 p-5 md:p-6"><div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3"><Field label="Manufacturer"><Input required value={bikeForm.manufacturer} onChange={(e) => setBikeForm({ ...bikeForm, manufacturer: e.target.value })} /></Field><Field label="Model"><Input required value={bikeForm.model} onChange={(e) => setBikeForm({ ...bikeForm, model: e.target.value })} /></Field><Field label="Variant"><Input value={bikeForm.variant} onChange={(e) => setBikeForm({ ...bikeForm, variant: e.target.value })} /></Field><Field label="Nickname"><Input value={bikeForm.nickname} onChange={(e) => setBikeForm({ ...bikeForm, nickname: e.target.value })} /></Field><Field label="Year"><Input type="number" min="1885" max={new Date().getFullYear() + 1} value={bikeForm.year} onChange={(e) => setBikeForm({ ...bikeForm, year: e.target.value })} /></Field><Field label="Registration"><Input value={bikeForm.registration} onChange={(e) => setBikeForm({ ...bikeForm, registration: e.target.value })} /></Field><Field label="Engine capacity cc"><Input type="number" min="1" value={bikeForm.engineCapacityCc} onChange={(e) => setBikeForm({ ...bikeForm, engineCapacityCc: e.target.value })} /></Field><Field label="Tank capacity litres"><Input type="number" min="0.1" step="0.1" value={bikeForm.tankCapacityLitres} onChange={(e) => setBikeForm({ ...bikeForm, tankCapacityLitres: e.target.value })} /></Field><Field label="Fuel type"><Input value={bikeForm.fuelType} onChange={(e) => setBikeForm({ ...bikeForm, fuelType: e.target.value })} /></Field><Field label="Current odometer km"><Input required type="number" min="0" step="0.1" value={bikeForm.currentOdometerKm} onChange={(e) => setBikeForm({ ...bikeForm, currentOdometerKm: e.target.value })} /></Field><Field label="Service interval km"><Input type="number" min="1" value={bikeForm.serviceIntervalKm} onChange={(e) => setBikeForm({ ...bikeForm, serviceIntervalKm: e.target.value })} /></Field><Field label="Tyre information"><Input value={bikeForm.tyreInformation} onChange={(e) => setBikeForm({ ...bikeForm, tyreInformation: e.target.value })} /></Field><Field label="Motorcycle photo"><Input type="file" accept="image/*" onChange={(event) => { setBikePhoto(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></Field></div><Field label="Notes"><Textarea value={bikeForm.notes} onChange={(e) => setBikeForm({ ...bikeForm, notes: e.target.value })} /></Field>{bikeError ? <p role="alert" className="text-sm text-red-700">{bikeError}</p> : null}<div className="flex gap-3"><Button type="submit">Save changes</Button><Button type="button" variant="outline" onClick={() => { setEditingMotorcycle(false); setBikeError('') }}>Cancel</Button></div></form></Section> : null}

      <Section title="Trip History">
        <div className="grid gap-3">
          {bikeTrips.map((trip) => <Link key={trip.id} to={`/trips/${trip.id}`} className="surface-panel p-4 transition hover:border-teal-900 hover:shadow-sm">{trip.title} <span className="text-sm text-stone-500">- {trip.status}</span></Link>)}
          {bikeTrips.length === 0 ? <p className="text-stone-600">Trips assigned to this motorcycle will appear here.</p> : null}
        </div>
      </Section>

      <Section title="Fuel History"><ButtonLink to={`/fuel?motorcycleId=${motorcycle.id}`} variant="outline">Open fuel journal</ButtonLink><p className="mt-3 text-sm text-stone-600">{bikeFuel.length} fuel fills, {analytics.verifiedIntervals} verified intervals, {formatMoney(analytics.totalFuelCost)} recorded fuel cost.</p></Section>

      <Section title="Maintenance History">
        <div className="grid gap-3">
          {maintenance.map((item) => <article key={item.id} className="surface-panel flex flex-wrap items-start justify-between gap-3 p-4"><div><h3 className="font-semibold">{item.component} - {item.serviceType}</h3><p className="text-sm text-stone-600">{formatDate(item.date)} | {formatKm(item.odometerKm)} | {item.cost === undefined ? 'Cost not recorded' : formatMoney(item.cost)}</p><p className="text-sm text-stone-600">{item.notes}</p></div><div className="flex gap-1"><Button variant="ghost" aria-label={`Edit ${item.component} service`} onClick={() => editMaintenance(item)}><Pencil size={18} /></Button><Button variant="ghost" aria-label={`Delete ${item.component} service`} onClick={() => deleteMaintenance(item)}><Trash2 size={18} /></Button></div></article>)}
          {maintenance.length === 0 ? <p className="text-stone-600">No maintenance logged for this motorcycle.</p> : null}
        </div>
      </Section>

      <Section title={editingMaintenanceId ? 'Edit Service' : 'Log Service'}>
        <form onSubmit={addMaintenance} className="surface-panel grid gap-4 p-5 md:p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Date"><Input required type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
            <Field label="Service type"><Input required value={form.serviceType} onChange={(e) => setForm({ ...form, serviceType: e.target.value })} /></Field>
            <Field label="Component"><Input required value={form.component} onChange={(e) => setForm({ ...form, component: e.target.value })} /></Field>
            <Field label="Odometer km"><Input required type="number" min="0" step="0.1" value={form.odometerKm} onChange={(e) => setForm({ ...form, odometerKm: e.target.value })} /></Field>
            <Field label="Workshop"><Input value={form.workshop} onChange={(e) => setForm({ ...form, workshop: e.target.value })} /></Field>
            <Field label="Cost"><Input type="number" min="0" step="0.01" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></Field>
          </div>
          <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {maintenanceError ? <p role="alert" className="text-sm text-red-700">{maintenanceError}</p> : null}
          <div className="flex gap-3"><Button type="submit">{editingMaintenanceId ? 'Save changes' : 'Log service'}</Button>{editingMaintenanceId ? <Button type="button" variant="outline" onClick={() => { setEditingMaintenanceId(undefined); setMaintenanceError(''); setForm({ date: toLocalDateInput(), serviceType: '', component: '', odometerKm: '', workshop: '', cost: '', notes: '' }) }}>Cancel</Button> : null}</div>
        </form>
      </Section>
    </div>
  )
}
