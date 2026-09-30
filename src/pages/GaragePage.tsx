import { useState } from 'react'
import type { FormEvent } from 'react'
import { Button, ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input, Textarea } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { Stat } from '../components/ui/Stat'
import { useFuelLogs, useInvalidateMyRide, useMaintenanceLogs, useMotorcycles, useSettings } from '../hooks/useMyRideData'
import { repository } from '../repositories/localRepository'
import { fuelAnalytics, estimateSafeRangeKm } from '../services/fuel/calculations'
import { compressImageToDataUrl } from '../services/photos/images'
import { formatKm, formatMileage } from '../utils/record'

export function GaragePage() {
  const { data: motorcycles = [] } = useMotorcycles()
  const { data: fuelLogs = [] } = useFuelLogs()
  const { data: maintenanceLogs = [] } = useMaintenanceLogs()
  const { data: settings } = useSettings()
  const invalidate = useInvalidateMyRide()
  const [form, setForm] = useState({ manufacturer: '', model: '', variant: '', nickname: '', year: '', registration: '', engineCapacityCc: '', tankCapacityLitres: '', fuelType: '', currentOdometerKm: '', serviceIntervalKm: '', tyreInformation: '', notes: '' })
  const [photo, setPhoto] = useState<File>()
  const [error, setError] = useState('')

  async function addMotorcycle(event: FormEvent) {
    event.preventDefault()
    setError('')
    try {
      const photoDataUrl = photo ? await compressImageToDataUrl(photo) : undefined
      await repository.motorcycles.create({
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
        variant: form.variant.trim(),
        nickname: form.nickname.trim(),
        year: form.year ? Number(form.year) : undefined,
        registration: form.registration.trim(),
        engineCapacityCc: form.engineCapacityCc ? Number(form.engineCapacityCc) : undefined,
        tankCapacityLitres: form.tankCapacityLitres ? Number(form.tankCapacityLitres) : undefined,
        fuelType: form.fuelType.trim(),
        currentOdometerKm: Number(form.currentOdometerKm || 0),
        serviceIntervalKm: form.serviceIntervalKm ? Number(form.serviceIntervalKm) : undefined,
        tyreInformation: form.tyreInformation.trim(),
        photoDataUrl,
        notes: form.notes.trim(),
        active: motorcycles.length === 0,
      })
      setForm({ manufacturer: '', model: '', variant: '', nickname: '', year: '', registration: '', engineCapacityCc: '', tankCapacityLitres: '', fuelType: '', currentOdometerKm: '', serviceIntervalKm: '', tyreInformation: '', notes: '' })
      setPhoto(undefined)
      invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Motorcycle could not be saved.')
    }
  }

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader eyebrow="Garage" title="Motorcycle Dossier" actions={<ButtonLink to="/fuel" variant="outline">Fuel journal</ButtonLink>} />

      {motorcycles.length === 0 ? (
        <EmptyState title="NO MOTORCYCLES">
          <p>Add your motorcycle to track trips, fuel, service status, and mileage history. Mileage is calculated from fuel logs, never manually entered.</p>
        </EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {motorcycles.map((motorcycle) => {
            const motorcycleFuel = fuelLogs.filter((log) => log.motorcycleId === motorcycle.id)
            const motorcycleMaintenance = maintenanceLogs.filter((log) => log.motorcycleId === motorcycle.id)
            const analytics = fuelAnalytics(motorcycleFuel)
            const currentOdometer = Math.max(motorcycle.currentOdometerKm, ...motorcycleFuel.map((log) => log.odometerKm), ...motorcycleMaintenance.map((log) => log.odometerKm))
            const range = estimateSafeRangeKm(motorcycle.tankCapacityLitres, analytics.recentAverageMileage, settings?.safeRangeReservePercent)
            return (
              <article key={motorcycle.id} className="surface-panel p-5 transition duration-150 hover:border-teal-900 hover:shadow-md">
                {motorcycle.photoDataUrl ? <img src={motorcycle.photoDataUrl} alt={`${motorcycle.manufacturer} ${motorcycle.model}`} className="mb-4 aspect-[16/9] w-full rounded-md object-cover" /> : null}
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className={`mb-2 w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${motorcycle.active ? 'bg-green-50 text-green-800' : 'bg-stone-100 text-stone-600'}`}>{motorcycle.active ? 'Active motorcycle' : 'Motorcycle'}</p>
                    <h2 className="text-2xl font-semibold">{motorcycle.nickname || `${motorcycle.manufacturer} ${motorcycle.model}`}</h2>
                    <p className="text-stone-600">{motorcycle.year || ''} {motorcycle.registration || ''}</p>
                  </div>
                  {!motorcycle.active ? <Button variant="outline" onClick={async () => { await repository.motorcycles.setActive(motorcycle.id); invalidate() }}>Set active</Button> : null}
                </div>
                <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                  <Stat label="Odometer" value={formatKm(currentOdometer)} />
                  <Stat label="Current mileage" value={formatMileage(analytics.recentAverageMileage)} />
                  <Stat label="Best mileage" value={formatMileage(analytics.bestMileage)} />
                  <Stat label="Safe range" value={range ? `~${formatKm(range)}` : 'Not enough data'} />
                </dl>
                <div className="mt-5 flex flex-wrap gap-2"><ButtonLink to={`/garage/${motorcycle.id}`} variant="outline">Open dossier</ButtonLink><ButtonLink to={`/fuel?motorcycleId=${motorcycle.id}`} variant="ghost">Fuel history</ButtonLink></div>
              </article>
            )
          })}
        </div>
      )}

      <Section title="Add Motorcycle">
        <form onSubmit={addMotorcycle} className="surface-panel grid gap-4 p-5 md:p-6">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Field label="Manufacturer"><Input required value={form.manufacturer} onChange={(e) => setForm({ ...form, manufacturer: e.target.value })} /></Field>
            <Field label="Model"><Input required value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} /></Field>
            <Field label="Variant"><Input value={form.variant} onChange={(e) => setForm({ ...form, variant: e.target.value })} /></Field>
            <Field label="Nickname"><Input value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} /></Field>
            <Field label="Year"><Input type="number" min="1885" max={new Date().getFullYear() + 1} value={form.year} onChange={(e) => setForm({ ...form, year: e.target.value })} /></Field>
            <Field label="Registration"><Input value={form.registration} onChange={(e) => setForm({ ...form, registration: e.target.value })} /></Field>
            <Field label="Engine capacity cc"><Input type="number" min="1" value={form.engineCapacityCc} onChange={(e) => setForm({ ...form, engineCapacityCc: e.target.value })} /></Field>
            <Field label="Tank capacity litres"><Input type="number" min="0.1" step="0.1" value={form.tankCapacityLitres} onChange={(e) => setForm({ ...form, tankCapacityLitres: e.target.value })} /></Field>
            <Field label="Fuel type"><Input value={form.fuelType} onChange={(e) => setForm({ ...form, fuelType: e.target.value })} /></Field>
            <Field label="Current odometer km"><Input type="number" min="0" step="0.1" value={form.currentOdometerKm} onChange={(e) => setForm({ ...form, currentOdometerKm: e.target.value })} /></Field>
            <Field label="Service interval km"><Input type="number" min="1" value={form.serviceIntervalKm} onChange={(e) => setForm({ ...form, serviceIntervalKm: e.target.value })} /></Field>
            <Field label="Tyre information"><Input value={form.tyreInformation} onChange={(e) => setForm({ ...form, tyreInformation: e.target.value })} /></Field>
            <Field label="Motorcycle photo"><Input type="file" accept="image/*" onChange={(event) => { setPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></Field>
          </div>
          <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
          <Button type="submit">Add motorcycle</Button>
        </form>
      </Section>
    </div>
  )
}
