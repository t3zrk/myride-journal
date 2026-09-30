import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ButtonLink } from '../components/ui/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { Field, Select } from '../components/ui/Field'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { useDashboardData } from '../hooks/useMyRideData'
import { repository } from '../repositories/localRepository'
import { completedDistanceKm, deriveMilestones, lifetimeDistanceThresholds, type MilestoneCategory } from '../services/achievements'
import { formatDate, formatKm } from '../utils/record'

export function AchievementsPage() {
  const { data } = useDashboardData()
  const { data: gpsPoints = [] } = useQuery({ queryKey: ['myride', 'achievement-gps'], queryFn: () => repository.gpsPoints.all() })
  const [category, setCategory] = useState<'All' | MilestoneCategory>('All')
  const trips = data?.trips ?? []
  const milestones = deriveMilestones({ trips, fuelLogs: data?.fuelLogs ?? [], weather: data?.weather ?? [], maintenance: data?.maintenance ?? [], gpsPoints })
  const cumulativeKm = completedDistanceKm(trips)
  const crossed = new Set(lifetimeDistanceThresholds.filter((threshold) => cumulativeKm >= threshold))

  const visible = milestones.filter((item) => category === 'All' || item.category === category).sort((a, b) => b.unlockedAt.localeCompare(a.unlockedAt))
  const upcoming = lifetimeDistanceThresholds.filter((threshold) => !crossed.has(threshold))

  return <div className="grid gap-6 md:gap-8">
    <PageHeader eyebrow="Milestones" title="Rider Achievements & Milestones" />
    <Field label="Category"><Select value={category} onChange={(event) => setCategory(event.target.value as 'All' | MilestoneCategory)}><option value="All">All categories</option>{['Distance & Endurance', 'Terrain & High Altitude', 'Weather & Elements', 'Motorcycle Discipline', 'Exploration & Journey'].map((item) => <option key={item}>{item}</option>)}</Select></Field>
    {visible.length ? <Section title="Timeline"><ol className="grid gap-0 border-l-2 border-teal-900 pl-5">{visible.map((item) => <li key={`${item.label}-${item.unlockedAt}`} className="relative border-b border-stone-200 py-4 before:absolute before:-left-[27px] before:top-6 before:size-3 before:rounded-full before:bg-amber-600"><p className="text-xs font-semibold uppercase text-teal-900">{item.category} | {formatDate(item.unlockedAt)}</p><h2 className="mt-1 font-serif text-xl">{item.label}</h2><p className="mt-1 text-sm text-stone-600">{item.detail}</p></li>)}</ol></Section> : <EmptyState title="NO PROVEN MILESTONES"><p>Milestones unlock only when stored trips, GPS, fuel, weather, or maintenance records prove them.</p><ButtonLink to="/trips/new" className="mt-4">Create trip</ButtonLink></EmptyState>}
    {category === 'All' || category === 'Distance & Endurance' ? <Section title="Distance Ahead"><div className="grid gap-2">{upcoming.map((threshold) => <p key={threshold} className="border-b border-stone-200 py-2 text-sm">{threshold.toLocaleString()} km lifetime | {formatKm(Math.max(0, threshold - cumulativeKm))} remaining</p>)}{upcoming.length === 0 ? <p className="text-sm text-stone-600">All listed distance milestones are unlocked.</p> : null}</div></Section> : null}
  </div>
}
