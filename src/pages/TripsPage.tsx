import { Link } from 'react-router-dom'
import { ArrowUpRight, CalendarDays, Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input, Select } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Stat } from '../components/ui/Stat'
import { useAllMotorcycles, useTrips } from '../hooks/useMyRideData'
import type { Trip, TripStatus } from '../types/myride'
import { formatDate, formatKm } from '../utils/record'

export function TripsPage() {
  const { data: trips = [] } = useTrips()
  const { data: historicalMotorcycles = [] } = useAllMotorcycles()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<'All' | TripStatus>('All')
  const [year, setYear] = useState('All')
  const [motorcycleId, setMotorcycleId] = useState('All')
  const years = [...new Set(trips.map((trip) => new Date(trip.startDate).getFullYear().toString()))].sort((a, b) => b.localeCompare(a))

  const filtered = useMemo(() => trips
    .filter((trip) => !search || `${trip.title} ${trip.origin.label} ${trip.destination.label}`.toLowerCase().includes(search.toLowerCase()))
    .filter((trip) => status === 'All' || trip.status === status)
    .filter((trip) => year === 'All' || new Date(trip.startDate).getFullYear().toString() === year)
    .filter((trip) => motorcycleId === 'All' || trip.motorcycleId === motorcycleId)
    .sort((a, b) => b.startDate.localeCompare(a.startDate)), [motorcycleId, search, status, year, trips])

  const grouped = filtered.reduce<Record<string, Trip[]>>((groups, trip) => {
    const key = new Date(trip.startDate).getFullYear().toString()
    ;(groups[key] ??= []).push(trip)
    return groups
  }, {})

  const completed = trips.filter((trip) => trip.status === 'Completed')
  const totalDistance = completed.reduce((sum, trip) => sum + (trip.distanceKm ?? 0), 0)
  const active = trips.filter((trip) => trip.status === 'Active').length
  const planned = trips.filter((trip) => trip.status === 'Planned').length

  return (
    <div className="grid gap-8 md:gap-10">
      <PageHeader
        eyebrow="Trips"
        title="Journey Archive"
        description="Every recorded road, grouped chronologically. Search the archive without turning it into a spreadsheet."
        actions={<ButtonLink to="/trips/new">Create trip</ButtonLink>}
      />

      {trips.length === 0 ? (
        <EmptyState title="NO TRIPS RECORDED YET">
          <p>Your trip archive is empty. Create the first journey; no sample trips are injected here.</p>
          <ButtonLink to="/trips/new" className="mt-5">Create first trip</ButtonLink>
        </EmptyState>
      ) : (
        <>
          <dl className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Journeys" value={`${trips.length}`} />
            <Stat label="Completed distance" value={formatKm(totalDistance)} />
            <Stat label="Active" value={`${active}`} />
            <Stat label="Planned" value={`${planned}`} />
          </dl>

          <section className="surface-muted grid gap-3 p-4 md:grid-cols-[minmax(0,1fr)_150px_125px_190px] md:p-5">
            <Field label="Search archive">
              <div className="relative">
                <Search className="absolute left-3.5 top-3.5 text-stone-500" size={17} />
                <Input className="w-full pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Place, route or trip title" />
              </div>
            </Field>
            <Field label="Status"><Select value={status} onChange={(event) => setStatus(event.target.value as 'All' | TripStatus)}>{['All', 'Planned', 'Active', 'Completed', 'Cancelled'].map((value) => <option key={value}>{value}</option>)}</Select></Field>
            <Field label="Year"><Select value={year} onChange={(event) => setYear(event.target.value)}><option value="All">All years</option>{years.map((value) => <option key={value}>{value}</option>)}</Select></Field>
            <Field label="Motorcycle"><Select value={motorcycleId} onChange={(event) => setMotorcycleId(event.target.value)}><option value="All">All motorcycles</option>{historicalMotorcycles.map((motorcycle) => <option key={motorcycle.id} value={motorcycle.id}>{motorcycle.nickname || motorcycle.model}{motorcycle.deletedAt ? ' (archived)' : ''}</option>)}</Select></Field>
          </section>

          {filtered.length === 0 ? <EmptyState title="NO MATCHING TRIPS">Try another search or filter.</EmptyState> : null}

          <div className="grid gap-10">
            {Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([groupYear, groupTrips]) => (
              <section key={groupYear} className="grid gap-1">
                <div className="mb-3 flex items-center gap-3"><CalendarDays size={18} className="text-amber-700" /><h2 className="font-serif text-3xl text-stone-950">{groupYear}</h2><span className="h-px flex-1 bg-stone-200" /></div>
                <div className="divide-y divide-stone-200 border-y border-stone-200">
                  {groupTrips.map((trip) => {
                    const motorcycle = historicalMotorcycles.find((item) => item.id === trip.motorcycleId)
                    return (
                      <Link key={trip.id} to={`/trips/${trip.id}`} className="group grid gap-4 py-5 transition hover:bg-white/45 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800 md:-mx-3 md:grid-cols-[7.5rem_minmax(0,1fr)_minmax(12rem,auto)_auto] md:items-center md:rounded-xl md:px-3">
                        <div>
                          <p className="text-sm font-semibold text-stone-800">{formatDate(trip.startDate)}</p>
                          <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.06em] ${trip.status === 'Active' ? 'bg-teal-100 text-teal-950' : trip.status === 'Completed' ? 'bg-stone-100 text-stone-700' : trip.status === 'Planned' ? 'bg-amber-50 text-amber-800' : 'bg-stone-100 text-stone-600'}`}>{trip.status}</span>
                        </div>
                        <div className="min-w-0">
                          <h3 className="font-serif truncate text-2xl text-stone-950 transition group-hover:text-teal-900">{trip.title}</h3>
                          <p className="mt-1 truncate text-sm text-stone-600">{trip.origin.label} → {trip.destination.label}</p>
                        </div>
                        <div className="text-sm text-stone-600 md:text-right">
                          <p className="font-semibold text-stone-800">{formatKm(trip.distanceKm)}</p>
                          <p className="mt-1">{motorcycle?.nickname || motorcycle?.model || 'No motorcycle assigned'}</p>
                        </div>
                        <ArrowUpRight size={17} className="hidden text-stone-400 transition group-hover:text-teal-900 md:block" />
                      </Link>
                    )
                  })}
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
