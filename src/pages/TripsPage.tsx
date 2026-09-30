import { Link } from 'react-router-dom'
import { Search } from 'lucide-react'
import { useMemo, useState } from 'react'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Input, Select } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
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

  const filtered = useMemo(() => {
    return trips
      .filter((trip) => !search || `${trip.title} ${trip.origin.label} ${trip.destination.label}`.toLowerCase().includes(search.toLowerCase()))
      .filter((trip) => status === 'All' || trip.status === status)
      .filter((trip) => year === 'All' || new Date(trip.startDate).getFullYear().toString() === year)
      .filter((trip) => motorcycleId === 'All' || trip.motorcycleId === motorcycleId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))
  }, [motorcycleId, search, status, year, trips])
  const grouped = filtered.reduce<Record<string, Trip[]>>((groups, trip) => {
    const key = new Date(trip.startDate).getFullYear().toString()
    ;(groups[key] ??= []).push(trip)
    return groups
  }, {})

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader eyebrow="Trips" title="Journey Archive" actions={<ButtonLink to="/trips/new">Create trip</ButtonLink>} />

      {trips.length === 0 ? (
        <EmptyState title="NO TRIPS RECORDED YET">
          <p>Your trip archive is empty. Create the first journey; no sample trips are injected here.</p>
          <ButtonLink to="/trips/new" className="mt-5">Create first trip</ButtonLink>
        </EmptyState>
      ) : (
        <>
          <section className="surface-panel grid gap-3 p-4 md:grid-cols-[1fr_150px_120px_180px] md:p-5">
            <Field label="Search">
              <div className="relative">
                <Search className="absolute left-3 top-3.5 text-stone-500" size={18} />
                <Input className="w-full pl-10" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search locations or titles" />
              </div>
            </Field>
            <Field label="Status">
              <Select value={status} onChange={(event) => setStatus(event.target.value as 'All' | TripStatus)}>
                {['All', 'Planned', 'Active', 'Completed', 'Cancelled'].map((value) => <option key={value}>{value}</option>)}
              </Select>
            </Field>
            <Field label="Year"><Select value={year} onChange={(event) => setYear(event.target.value)}><option value="All">All years</option>{years.map((value) => <option key={value}>{value}</option>)}</Select></Field>
            <Field label="Motorcycle">
              <Select value={motorcycleId} onChange={(event) => setMotorcycleId(event.target.value)}>
                <option value="All">All motorcycles</option>
                {historicalMotorcycles.map((motorcycle) => <option key={motorcycle.id} value={motorcycle.id}>{motorcycle.nickname || motorcycle.model}{motorcycle.deletedAt ? ' (archived)' : ''}</option>)}
              </Select>
            </Field>
          </section>

          {filtered.length === 0 ? <EmptyState title="NO MATCHING TRIPS">Try another search or filter.</EmptyState> : null}
          {Object.entries(grouped).sort((a, b) => b[0].localeCompare(a[0])).map(([groupYear, groupTrips]) => <section key={groupYear} className="grid gap-3"><h2 className="text-xl font-semibold">{groupYear}</h2>{groupTrips?.map((trip) => {
              const motorcycle = historicalMotorcycles.find((item) => item.id === trip.motorcycleId)
              return (
                <Link key={trip.id} to={`/trips/${trip.id}`} className="surface-panel p-5 transition duration-150 hover:-translate-y-0.5 hover:border-teal-900 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <p className={`w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${trip.status === 'Active' ? 'bg-green-50 text-green-800' : trip.status === 'Completed' ? 'bg-teal-50 text-teal-900' : 'bg-stone-100 text-stone-600'}`}>{trip.status}</p>
                      <h2 className="font-journal mt-2 text-2xl">{trip.title}</h2>
                      <p className="mt-1 text-stone-600">{trip.origin.label} to {trip.destination.label}</p>
                    </div>
                    <div className="text-sm text-stone-500 md:text-right">
                      <p>{formatDate(trip.startDate)}</p>
                      <p>{motorcycle?.nickname || motorcycle?.model || 'No motorcycle assigned'}</p>
                      <p>{formatKm(trip.distanceKm)}</p>
                    </div>
                  </div>
                </Link>
              )
            })}</section>)}
        </>
      )}
    </div>
  )
}
