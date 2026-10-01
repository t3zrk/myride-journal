import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowUpRight, Bike, Fuel, Gauge } from 'lucide-react'
import { Button, ButtonLink } from '../components/ui/Button'
import { Field, Input, Textarea } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { Stat } from '../components/ui/Stat'
import { useFuelLogs, useInvalidateMyRide, useMaintenanceLogs, useMotorcycles, useSettings } from '../hooks/useMyRideData'
import { repository } from '../repositories/localRepository'
import { fuelAnalytics, estimateSafeRangeKm } from '../services/fuel/calculations'
import { compressImageToDataUrl } from '../services/photos/images'
import { formatKm, formatMileage } from '../utils/record'

const emptyForm = { manufacturer: '', model: '', variant: '', nickname: '', year: '', registration: '', engineCapacityCc: '', tankCapacityLitres: '', fuelType: '', currentOdometerKm: '', serviceIntervalKm: '', tyreInformation: '', notes: '' }

export function GaragePage() {
  const { data: motorcycles = [] } = useMotorcycles()
  const { data: fuelLogs = [] } = useFuelLogs()
  const { data: maintenanceLogs = [] } = useMaintenanceLogs()
  const { data: settings } = useSettings()
  const invalidate = useInvalidateMyRide()
  const [form, setForm] = useState(emptyForm)
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
      setForm(emptyForm)
      setPhoto(undefined)
      invalidate()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Motorcycle could not be saved.')
    }
  }

  return (
    <div className="grid gap-8 md:gap-10">
      <PageHeader
        eyebrow="Garage"
        title="Motorcycle Dossier"
        description="Keep the identity, technical profile, ownership details and riding history of every motorcycle in one connected record."
        actions={<ButtonLink to="/fuel" variant="outline"><Fuel size={17} /> Fuel journal</ButtonLink>}
      />

      {motorcycles.length ? (
        <Section title="Your Motorcycles">
          <div className="grid gap-5">
            {motorcycles.map((motorcycle) => {
              const motorcycleFuel = fuelLogs.filter((log) => log.motorcycleId === motorcycle.id)
              const motorcycleMaintenance = maintenanceLogs.filter((log) => log.motorcycleId === motorcycle.id)
              const analytics = fuelAnalytics(motorcycleFuel)
              const currentOdometer = Math.max(motorcycle.currentOdometerKm, ...motorcycleFuel.map((log) => log.odometerKm), ...motorcycleMaintenance.map((log) => log.odometerKm))
              const range = estimateSafeRangeKm(motorcycle.tankCapacityLitres, analytics.recentAverageMileage, settings?.safeRangeReservePercent)
              return (
                <article key={motorcycle.id} className={motorcycle.active ? 'surface-ink overflow-hidden' : 'surface-panel overflow-hidden'}>
                  <div className="grid lg:grid-cols-[minmax(15rem,.52fr)_minmax(0,1fr)]">
                    <div className={`relative min-h-48 overflow-hidden ${motorcycle.active ? 'bg-white/5' : 'bg-stone-100'}`}>
                      {motorcycle.photoDataUrl ? <img src={motorcycle.photoDataUrl} alt={`${motorcycle.manufacturer} ${motorcycle.model}`} className="absolute inset-0 h-full w-full object-cover" /> : <div className={`grid h-full min-h-48 place-items-center ${motorcycle.active ? 'text-teal-100/35' : 'text-stone-300'}`}><Bike size={72} strokeWidth={1} /></div>}
                      <span className={`absolute left-4 top-4 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.08em] backdrop-blur ${motorcycle.active ? 'border border-white/15 bg-stone-950/45 text-white' : 'border border-stone-200 bg-white/85 text-stone-700'}`}>{motorcycle.active ? 'Active motorcycle' : 'Garage'}</span>
                    </div>
                    <div className="p-5 sm:p-7">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div><p className={`text-[11px] font-bold uppercase tracking-[0.14em] ${motorcycle.active ? 'text-teal-100/60' : 'text-stone-500'}`}>{motorcycle.manufacturer} · {motorcycle.year || 'Year not recorded'}</p><h2 className={`font-serif mt-2 text-3xl sm:text-4xl ${motorcycle.active ? 'text-white' : 'text-stone-950'}`}>{motorcycle.nickname || `${motorcycle.manufacturer} ${motorcycle.model}`}</h2><p className={`mt-2 text-sm ${motorcycle.active ? 'text-teal-50/55' : 'text-stone-600'}`}>{motorcycle.model}{motorcycle.variant ? ` · ${motorcycle.variant}` : ''}{motorcycle.registration ? ` · ${motorcycle.registration}` : ''}</p></div>
                        {!motorcycle.active ? <Button variant="outline" onClick={async () => { await repository.motorcycles.setActive(motorcycle.id); invalidate() }}>Set active</Button> : null}
                      </div>
                      <dl className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
                        <Stat label="Odometer" value={formatKm(currentOdometer)} />
                        <Stat label="Current mileage" value={formatMileage(analytics.recentAverageMileage)} />
                        <Stat label="Best mileage" value={formatMileage(analytics.bestMileage)} />
                        <Stat label="Safe range" value={range ? `~${formatKm(range)}` : 'Not enough data'} />
                      </dl>
                      <div className="mt-7 flex flex-wrap gap-2"><ButtonLink to={`/garage/${motorcycle.id}`} variant={motorcycle.active ? 'outline' : 'primary'} className={motorcycle.active ? 'border-white/20 bg-white/10 text-white hover:bg-white/15 hover:text-white' : ''}>Open dossier <ArrowUpRight size={15} /></ButtonLink><ButtonLink to={`/fuel?motorcycleId=${motorcycle.id}`} variant="ghost" className={motorcycle.active ? 'text-white/70 hover:bg-white/10 hover:text-white' : ''}><Gauge size={16} /> Fuel history</ButtonLink></div>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </Section>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-teal-200 bg-teal-50/55 px-5 py-4">
          <div className="flex items-start gap-3"><div className="grid size-10 shrink-0 place-items-center rounded-full bg-white text-teal-900 shadow-sm"><Bike size={19} /></div><div><p className="font-semibold text-stone-950">Your garage is empty.</p><p className="mt-1 text-sm leading-5 text-stone-600">Start with the motorcycle's manufacturer and model. The first motorcycle becomes active automatically.</p></div></div>
          <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold uppercase tracking-[0.1em] text-teal-900 shadow-sm">2 fields to start</span>
        </div>
      )}

      <Section title={motorcycles.length ? 'Add Another Motorcycle' : 'Add Your Motorcycle'}>
        <form onSubmit={addMotorcycle} className="grid gap-5">
          <div className="surface-ink p-5 sm:p-7">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.07] text-teal-100"><span className="text-sm font-bold">01</span></div>
              <div><p className="text-[11px] font-bold uppercase tracking-[0.15em] text-teal-100/65">Identify the motorcycle</p><h3 className="font-serif mt-1 text-3xl leading-tight text-white">Start with what it is.</h3><p className="mt-2 max-w-2xl text-sm leading-6 text-teal-50/60">Manufacturer and model create the permanent identity of this motorcycle. Add the variant and year when known.</p></div>
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <Field label="Manufacturer"><Input required placeholder="Royal Enfield" value={form.manufacturer} onChange={(event) => setForm({ ...form, manufacturer: event.target.value })} /></Field>
              <Field label="Model"><Input required placeholder="Classic 350" value={form.model} onChange={(event) => setForm({ ...form, model: event.target.value })} /></Field>
              <Field label="Variant"><Input placeholder="Optional" value={form.variant} onChange={(event) => setForm({ ...form, variant: event.target.value })} /></Field>
              <Field label="Year"><Input type="number" min="1885" max={new Date().getFullYear() + 1} placeholder="2020" value={form.year} onChange={(event) => setForm({ ...form, year: event.target.value })} /></Field>
            </div>
          </div>

          <div className="grid gap-5 xl:grid-cols-[1.12fr_.88fr]">
            <div className="surface-panel p-5 sm:p-6">
              <div className="border-b border-stone-200 pb-4"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-teal-900">02 · Technical profile</p><h3 className="font-serif mt-1 text-2xl text-stone-950">Model specifications</h3><p className="mt-1 text-sm leading-5 text-stone-600">These details support range, service and motorcycle history calculations.</p></div>
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <Field label="Engine capacity · cc"><Input type="number" min="1" placeholder="346" value={form.engineCapacityCc} onChange={(event) => setForm({ ...form, engineCapacityCc: event.target.value })} /></Field>
                <Field label="Tank capacity · litres"><Input type="number" min="0.1" step="0.1" placeholder="13.5" value={form.tankCapacityLitres} onChange={(event) => setForm({ ...form, tankCapacityLitres: event.target.value })} /></Field>
                <Field label="Fuel type"><Input placeholder="Petrol" value={form.fuelType} onChange={(event) => setForm({ ...form, fuelType: event.target.value })} /></Field>
                <Field label="Service interval km"><Input type="number" min="1" placeholder="5000" value={form.serviceIntervalKm} onChange={(event) => setForm({ ...form, serviceIntervalKm: event.target.value })} /></Field>
                <div className="md:col-span-2"><Field label="Tyre information"><Input placeholder="Front and rear tyre specifications" value={form.tyreInformation} onChange={(event) => setForm({ ...form, tyreInformation: event.target.value })} /></Field></div>
              </div>
            </div>

            <div className="surface-panel p-5 sm:p-6">
              <div className="border-b border-stone-200 pb-4"><p className="text-[10px] font-bold uppercase tracking-[0.15em] text-amber-700">03 · Your bike</p><h3 className="font-serif mt-1 text-2xl text-stone-950">Ownership details</h3><p className="mt-1 text-sm leading-5 text-stone-600">Record what belongs to this physical motorcycle.</p></div>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
                <Field label="Nickname"><Input placeholder="Optional" value={form.nickname} onChange={(event) => setForm({ ...form, nickname: event.target.value })} /></Field>
                <Field label="Registration"><Input placeholder="Optional" value={form.registration} onChange={(event) => setForm({ ...form, registration: event.target.value })} /></Field>
                <Field label="Current odometer km"><Input type="number" min="0" step="0.1" placeholder="0" value={form.currentOdometerKm} onChange={(event) => setForm({ ...form, currentOdometerKm: event.target.value })} /></Field>
                <Field label="Motorcycle photo"><Input type="file" accept="image/*" onChange={(event) => { setPhoto(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></Field>
              </div>
              {photo ? <p className="mt-2 truncate text-xs text-teal-900">Selected: {photo.name}</p> : null}
              <div className="mt-4"><Field label="Notes"><Textarea placeholder="Ownership notes, modifications, quirks or anything worth remembering" value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></Field></div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 rounded-[18px] border border-stone-200 bg-stone-100/60 px-5 py-4">
            <div><p className="font-semibold text-stone-900">Ready to add it?</p><p className="mt-1 text-xs leading-5 text-stone-600">Manufacturer and model are required. Every other detail can be completed later.</p></div>
            <Button type="submit" className="min-w-40"><Bike size={17} /> Add motorcycle</Button>
          </div>
          {error ? <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-3 text-sm text-red-800">{error}</p> : null}
        </form>
      </Section>
    </div>
  )
}
