import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Bike, CircleDollarSign, Fuel, Wrench } from 'lucide-react'
import { Button, ButtonLink } from '../components/ui/Button'
import { ReadinessChecklist } from '../components/ReadinessChecklist'
import { EmptyState } from '../components/ui/EmptyState'
import { PageHeader } from '../components/ui/PageHeader'
import { Section } from '../components/ui/Section'
import { Input } from '../components/ui/Field'
import { Stat } from '../components/ui/Stat'
import { useDashboardData, useSettings } from '../hooks/useMyRideData'
import { answerStructuredQuestion, isSensitiveAssistantQuestion } from '../services/ai/assistant'
import { explainWithCloud } from '../services/ai/cloud'
import { deriveMilestones } from '../services/achievements'
import { estimateSafeRangeKm, fuelAnalytics } from '../services/fuel/calculations'
import { estimateServiceHealth, latestGeneralService } from '../services/maintenance'
import { formatDate, formatDuration, formatFuelVolume, formatKm, formatMileage, formatMoney } from '../utils/record'

export function DashboardPage() {
  const { data, isLoading } = useDashboardData()
  const { data: settings } = useSettings()
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [explanation, setExplanation] = useState('')
  const [aiMessage, setAiMessage] = useState('')
  const [asking, setAsking] = useState(false)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 60000)
    return () => window.clearInterval(timer)
  }, [])

  if (isLoading || !data) {
    return <div className="grid gap-4"><div className="h-40 animate-pulse rounded-md bg-stone-200" /><div className="h-28 animate-pulse rounded-md bg-stone-200" /></div>
  }
  const dashboard = data

  const activeTrip = data.trips.find((trip) => trip.status === 'Active')
  const recentTrip = activeTrip ?? [...data.trips].filter((trip) => trip.status === 'Completed').sort((a, b) => b.startDate.localeCompare(a.startDate))[0]
  const activeMotorcycle = data.motorcycles.find((motorcycle) => motorcycle.active)
  const activeFuel = activeMotorcycle ? data.fuelLogs.filter((log) => log.motorcycleId === activeMotorcycle.id) : []
  const activeMaintenance = activeMotorcycle ? data.maintenance.filter((item) => item.motorcycleId === activeMotorcycle.id) : []
  const activeAnalytics = activeMotorcycle ? fuelAnalytics(activeFuel) : undefined
  const range = estimateSafeRangeKm(activeMotorcycle?.tankCapacityLitres, activeAnalytics?.recentAverageMileage, settings?.safeRangeReservePercent)
  const lastService = activeMotorcycle ? latestGeneralService(activeMaintenance) : undefined
  const currentOdometer = activeMotorcycle ? Math.max(activeMotorcycle.currentOdometerKm, ...activeFuel.map((log) => log.odometerKm), ...activeMaintenance.map((item) => item.odometerKm)) : 0
  const serviceHealth = estimateServiceHealth(currentOdometer, activeMotorcycle?.serviceIntervalKm, lastService?.odometerKm)
  const readiness = serviceHealth === 'GOOD' ? 'READY' : serviceHealth === 'DUE' || serviceHealth === 'OVERDUE' ? 'DUE' : 'ATTENTION'
  const readinessLabel = activeMotorcycle ? readiness : 'SETUP NEEDED'
  const readinessTone = !activeMotorcycle ? 'text-stone-600' : readiness === 'READY' ? 'text-green-700' : readiness === 'DUE' ? 'text-amber-700' : 'text-red-700'
  const showMaintenanceReminder = settings?.maintenanceRemindersEnabled && activeMotorcycle && (serviceHealth === 'DUE' || serviceHealth === 'OVERDUE')
  const milestones = deriveMilestones({ trips: data.trips, fuelLogs: data.fuelLogs, weather: data.weather, maintenance: data.maintenance })
  const activity = [
    ...data.trips.map((trip) => ({ id: trip.id, at: trip.updatedAt, title: trip.title, detail: trip.status, to: `/trips/${trip.id}` })),
    ...data.fuelLogs.map((log) => ({ id: log.id, at: log.dateTime, title: `${formatFuelVolume(log.litres)} fuel fill`, detail: formatKm(log.odometerKm), to: `/fuel?motorcycleId=${log.motorcycleId}` })),
    ...data.expenses.map((expense) => ({ id: expense.id, at: expense.date, title: `${expense.category} expense`, detail: formatMoney(expense.amount), to: '/expenses' })),
    ...data.maintenance.map((item) => ({ id: item.id, at: item.date, title: `${item.component} service`, detail: formatKm(item.odometerKm), to: `/garage/${item.motorcycleId}` })),
    ...milestones.map((item) => ({ id: `milestone-${item.label}-${item.unlockedAt}`, at: item.unlockedAt, title: item.label, detail: 'Milestone', to: '/achievements' })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5)

  function askMyRide(event: FormEvent) {
    event.preventDefault()
    const facts = answerStructuredQuestion(question, {
      stats: dashboard.stats,
      trips: dashboard.trips,
      motorcycles: dashboard.motorcycles,
      fuelLogs: dashboard.fuelLogs,
      expenses: dashboard.expenses,
      weather: dashboard.weather,
      profile: dashboard.profile,
      emergencyContacts: dashboard.emergencyContacts,
      allowSensitive: Boolean(dashboard.profile?.aiSensitiveAccess),
    })
    setAnswer(facts)
    setExplanation('')
    setAiMessage('')
    if (settings?.aiProvider !== 'openai') return
    if (isSensitiveAssistantQuestion(question)) {
      setAiMessage('Sensitive answers stay on this device and are not sent to the cloud.')
      return
    }
    setAsking(true)
    void explainWithCloud(facts)
      .then(setExplanation)
      .catch((error) => setAiMessage(error instanceof Error ? error.message : 'Cloud explanation is unavailable. Showing the local answer.'))
      .finally(() => setAsking(false))
  }

  return (
    <div className="grid gap-6 md:gap-8">
      <PageHeader eyebrow="Riding journal" title="MyRide" journalTitle actions={
        <>
          <ButtonLink to="/trips/new"><Bike size={18} /> Create trip</ButtonLink>
          <ButtonLink to="/expenses" variant="outline"><CircleDollarSign size={18} /> Add expense</ButtonLink>
        </>
      } />

      {showMaintenanceReminder ? <section role="status" className="flex flex-wrap items-center justify-between gap-4 border-l-4 border-amber-600 bg-amber-50 px-5 py-4"><div><p className="font-semibold text-stone-950">Maintenance {serviceHealth === 'OVERDUE' ? 'overdue' : 'due'}</p><p className="text-sm text-stone-700">{activeMotorcycle.nickname || activeMotorcycle.model} | {formatKm(currentOdometer)}</p></div><ButtonLink to={`/garage/${activeMotorcycle.id}`} variant="outline">Open dossier</ButtonLink></section> : null}

      <Section title="Current / Recent Trip">
        {!recentTrip ? (
          <EmptyState title="MY RIDING JOURNAL">
            <p>No trips recorded yet.</p>
            <p>Your motorcycle journal starts here. Record your first journey and MyRide will build your riding history automatically.</p>
            <ButtonLink to="/trips/new" className="mt-5">Create first trip</ButtonLink>
          </EmptyState>
        ) : (
          <article className="surface-panel p-5 md:p-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase text-teal-900">{recentTrip.status}</p>
                <h2 className="font-journal mt-1 text-3xl">{recentTrip.title}</h2>
                <p className="mt-2 text-stone-600">{recentTrip.origin.label} to {recentTrip.destination.label}</p>
                {recentTrip.status === 'Active' ? <p className="mt-2 text-sm text-stone-600">{data.activeGpsPoint ? `Last recorded position: ${data.activeGpsPoint.latitude.toFixed(5)}, ${data.activeGpsPoint.longitude.toFixed(5)} at ${formatDate(data.activeGpsPoint.timestamp, true)}` : 'Location not recorded yet.'}</p> : null}
              </div>
              <ButtonLink to={`/trips/${recentTrip.id}`} variant="outline">Open trip</ButtonLink>
            </div>
            <dl className="mt-6 grid gap-4 sm:grid-cols-3">
              <Stat label="Distance" value={formatKm(recentTrip.distanceKm)} />
              <Stat label="Duration" value={recentTrip.status === 'Active' ? formatDuration(Math.max(0, Math.floor((now - Date.parse(recentTrip.startDate)) / 60000))) : formatDuration(recentTrip.durationMinutes)} />
              <Stat label="Motorcycle" value={data.historicalMotorcycles.find((bike) => bike.id === recentTrip.motorcycleId)?.nickname || data.historicalMotorcycles.find((bike) => bike.id === recentTrip.motorcycleId)?.model || 'Unassigned'} />
            </dl>
          </article>
        )}
      </Section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Section title="Motorcycle Status">
          <div className="border-t border-stone-200 pt-4">
            {activeMotorcycle ? (
              <>
                <h3 className="text-xl font-semibold">{activeMotorcycle.nickname || `${activeMotorcycle.manufacturer} ${activeMotorcycle.model}`}</h3>
                <dl className="mt-5 grid gap-4 sm:grid-cols-2">
                  <Stat label="Odometer" value={formatKm(currentOdometer)} />
                  <Stat label="Recent mileage" value={formatMileage(activeAnalytics?.recentAverageMileage)} detail={`${activeAnalytics?.verifiedIntervals ?? 0} full-tank intervals`} />
                  <Stat label="Safe range" value={range ? `~${formatKm(range)}` : 'Not enough data'} />
                  <Stat label="Service status" value={serviceHealth} detail={lastService ? `Last service at ${formatKm(lastService.odometerKm)}` : 'No qualifying service recorded'} />
                </dl>
              </>
            ) : (
              <EmptyState title={data.motorcycles.length ? 'NO ACTIVE MOTORCYCLE' : 'NO MOTORCYCLE'}>{data.motorcycles.length ? 'Select an active motorcycle in Garage to show its service status, mileage, and range.' : 'Add your motorcycle to unlock service status, mileage, and range estimates.'}</EmptyState>
            )}
          </div>
        </Section>

        <Section title="Readiness">
          <div className="border-t border-stone-200 pt-4">
            <p className={`text-2xl font-semibold ${readinessTone}`}>{readinessLabel}</p>
            <p className="mt-2 text-sm leading-6 text-stone-600">{activeMotorcycle ? 'Estimated from a general or engine-oil service record and your service interval. Other work does not reset this estimate.' : 'Add and activate a motorcycle to calculate service readiness.'}</p>
            {activeMotorcycle ? <details className="mt-4"><summary className="min-h-12 cursor-pointer font-semibold">Pre-ride checklist</summary><ReadinessChecklist tripId={activeTrip?.id} motorcycleId={activeMotorcycle.id} /></details> : null}
          </div>
        </Section>
      </section>

      <Section title="Lifetime Statistics">
        <dl className="surface-panel grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-5">
          <Stat label="Total distance" value={formatKm(data.stats.totalDistanceKm)} />
          <Stat label="Riding time" value={formatDuration(data.stats.totalDurationMinutes)} />
          <Stat label="Trips" value={`${data.stats.tripCount}`} />
          <Stat label="Fuel" value={formatFuelVolume(data.stats.totalFuelLitres)} />
          <Stat label="Lifetime mileage" value={formatMileage(data.stats.lifetimeMileageKmPerLitre)} />
        </dl>
      </Section>

      <Section title="Recent Activity">
        <div className="grid gap-3">
          {activity.map((item) => (
            <Link key={item.id} to={item.to} className="flex min-h-12 items-center justify-between gap-3 border-b border-stone-200 py-3 transition hover:border-teal-900 hover:text-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
              <span className="font-semibold">{item.title}</span>
              <span className="text-sm text-stone-600">{item.detail}</span>
            </Link>
          ))}
          {activity.length === 0 ? <p className="text-stone-600">Recent trips, fuel fills, expenses, and maintenance will appear once recorded.</p> : null}
        </div>
      </Section>

      <Section title="Quick Actions">
        <div className="grid gap-3 sm:grid-cols-4">
          <ButtonLink to="/trips/new" className="w-full"><Bike size={18} /> Create trip</ButtonLink>
          <ButtonLink to="/fuel" className="w-full" variant="outline"><Fuel size={18} /> Log fuel</ButtonLink>
          <ButtonLink to="/expenses" className="w-full" variant="outline"><CircleDollarSign size={18} /> Add expense</ButtonLink>
          <ButtonLink to="/garage" className="w-full" variant="outline"><Wrench size={18} /> Maintenance</ButtonLink>
        </div>
      </Section>
      {settings?.aiEnabled ? <Section title="Ask MyRide"><form onSubmit={askMyRide} className="grid gap-3 sm:grid-cols-[1fr_auto]"><Input aria-label="Ask MyRide a question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What was my longest trip?" /><Button type="submit" disabled={asking}>{asking ? 'Asking...' : 'Ask'}</Button></form>{answer ? <p role="status" className="mt-4 border-l-4 border-teal-900 pl-4 text-stone-700">{answer}</p> : null}{explanation ? <p className="mt-3 text-sm text-stone-600">{explanation}</p> : null}{aiMessage ? <p role="status" className="mt-3 text-sm text-amber-800">{aiMessage}</p> : null}</Section> : null}
    </div>
  )
}
