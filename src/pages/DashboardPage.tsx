import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ArrowUpRight, Bike, CircleDollarSign, Fuel, MapPin, Route, ShieldCheck, Wrench } from 'lucide-react'
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
import { deviceAiProviders } from '../services/ai/deviceAi'
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
    return <div className="grid gap-5"><div className="h-52 animate-pulse rounded-[20px] bg-stone-200" /><div className="h-40 animate-pulse rounded-[20px] bg-stone-200" /></div>
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
  const readinessTone = !activeMotorcycle ? 'text-stone-600' : readiness === 'READY' ? 'text-teal-800' : readiness === 'DUE' ? 'text-amber-800' : 'text-red-700'
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
    if (!settings?.aiEnabled || settings.aiProvider === 'local') return
    if (isSensitiveAssistantQuestion(question)) {
      setAiMessage('Sensitive answers stay on this device and are not sent to the cloud.')
      return
    }
    setAsking(true)
    void explainWithCloud(facts, settings.aiProvider)
      .then(setExplanation)
      .catch((error) => setAiMessage(error instanceof Error ? error.message : 'Cloud explanation is unavailable. Showing the local answer.'))
      .finally(() => setAsking(false))
  }

  return (
    <div className="grid gap-8 md:gap-10">
      <PageHeader
        eyebrow="Riding journal"
        title="MyRide"
        journalTitle
        description="A quiet record of the road: journeys, fuel, maintenance and the motorcycle behind them."
        actions={<>
          <ButtonLink to="/trips/new"><Bike size={17} /> Create trip</ButtonLink>
          <ButtonLink to="/fuel" variant="outline"><Fuel size={17} /> Log fuel</ButtonLink>
        </>}
      />

      {showMaintenanceReminder ? <section role="status" className="surface-muted flex flex-wrap items-center justify-between gap-4 border-l-[3px] border-l-amber-700 px-5 py-4"><div><p className="font-semibold text-stone-950">Maintenance {serviceHealth === 'OVERDUE' ? 'overdue' : 'due'}</p><p className="mt-1 text-sm text-stone-600">{activeMotorcycle.nickname || activeMotorcycle.model} · {formatKm(currentOdometer)}</p></div><ButtonLink to={`/garage/${activeMotorcycle.id}`} variant="outline">Open dossier</ButtonLink></section> : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(21rem,.7fr)]">
        {recentTrip ? (
          <article className="surface-ink relative isolate min-h-[22rem] overflow-hidden p-6 sm:p-8">
            <div className="relative flex h-full flex-col">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-teal-100/70">{recentTrip.status === 'Active' ? 'Ride in progress' : 'Latest journey'}</p>
                <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/75">{formatDate(recentTrip.startDate)}</span>
              </div>
              <div className="my-auto py-8">
                <div className="mb-4 flex items-center gap-2 text-amber-300"><Route size={18} /><span className="text-sm font-semibold">{recentTrip.origin.label} → {recentTrip.destination.label}</span></div>
                <h2 className="font-journal max-w-3xl text-4xl leading-[.98] text-white sm:text-5xl md:text-6xl">{recentTrip.title}</h2>
                {recentTrip.status === 'Active' ? <p className="mt-5 max-w-2xl text-sm leading-6 text-teal-50/65">{data.activeGpsPoint ? `Last GPS point recorded ${formatDate(data.activeGpsPoint.timestamp, true)}.` : 'The trip is active. Location has not been recorded yet.'}</p> : null}
              </div>
              <div className="grid gap-5 border-t border-white/10 pt-5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
                <div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/60">Distance</p><p className="metric-number mt-1 text-xl font-semibold text-white">{formatKm(recentTrip.distanceKm)}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/60">Duration</p><p className="metric-number mt-1 text-xl font-semibold text-white">{recentTrip.status === 'Active' ? formatDuration(Math.max(0, Math.floor((now - Date.parse(recentTrip.startDate)) / 60000))) : formatDuration(recentTrip.durationMinutes)}</p></div>
                <div><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-white/60">Motorcycle</p><p className="mt-1 truncate text-xl font-semibold text-white">{data.historicalMotorcycles.find((bike) => bike.id === recentTrip.motorcycleId)?.nickname || data.historicalMotorcycles.find((bike) => bike.id === recentTrip.motorcycleId)?.model || 'Unassigned'}</p></div>
                <ButtonLink to={`/trips/${recentTrip.id}`} variant="outline" className="border-white/20 bg-white/10 text-white hover:border-white/35 hover:bg-white/15 hover:text-white">Open trip <ArrowUpRight size={16} /></ButtonLink>
              </div>
            </div>
          </article>
        ) : (
          <EmptyState title="MY RIDING JOURNAL">
            <p>No trips recorded yet.</p>
            <p>The archive starts with the first road you choose to record.</p>
            <ButtonLink to="/trips/new" className="mt-5">Create first trip</ButtonLink>
          </EmptyState>
        )}

        <aside className="surface-panel flex flex-col p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Motorcycle status</p>
              <h2 className="font-serif mt-2 text-3xl leading-none text-stone-950">{activeMotorcycle ? activeMotorcycle.nickname || `${activeMotorcycle.manufacturer} ${activeMotorcycle.model}` : 'No active motorcycle'}</h2>
            </div>
            <span className={`rounded-full bg-stone-100 px-3 py-1 text-xs font-bold ${readinessTone}`}>{readinessLabel}</span>
          </div>
          {activeMotorcycle ? <>
            <dl className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
              <Stat label="Odometer" value={formatKm(currentOdometer)} />
              <Stat label="Recent mileage" value={formatMileage(activeAnalytics?.recentAverageMileage)} detail={`${activeAnalytics?.verifiedIntervals ?? 0} verified intervals`} />
              <Stat label="Safe range" value={range ? `~${formatKm(range)}` : 'Not enough data'} />
              <Stat label="Service status" value={serviceHealth} detail={lastService ? `Last at ${formatKm(lastService.odometerKm)}` : 'No service baseline'} />
            </dl>
            <div className="mt-auto pt-6"><ButtonLink to={`/garage/${activeMotorcycle.id}`} variant="ghost" className="px-0 text-teal-900 hover:bg-transparent">Open motorcycle dossier <ArrowUpRight size={15} /></ButtonLink></div>
          </> : <div className="mt-6 text-sm leading-6 text-stone-600"><p>Add a motorcycle in Garage to calculate its current mileage, range and service readiness.</p><ButtonLink to="/garage" variant="outline" className="mt-5">Open garage</ButtonLink></div>}
        </aside>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="surface-panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Lifetime record</p><h2 className="font-serif mt-1 text-3xl">The road so far</h2></div>
            <MapPin className="text-teal-900" size={22} />
          </div>
          <dl className="mt-7 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            <Stat label="Total distance" value={formatKm(data.stats.totalDistanceKm)} />
            <Stat label="Riding time" value={formatDuration(data.stats.totalDurationMinutes)} />
            <Stat label="Trips" value={`${data.stats.tripCount}`} />
            <Stat label="Fuel" value={formatFuelVolume(data.stats.totalFuelLitres)} />
            <Stat label="Lifetime mileage" value={formatMileage(data.stats.lifetimeMileageKmPerLitre)} />
            <Stat label="Total expenses" value={formatMoney(data.stats.totalExpenses)} />
          </dl>
        </div>

        <div className="surface-panel p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-500">Ride readiness</p><h2 className={`font-serif mt-1 text-3xl ${readinessTone}`}>{readinessLabel}</h2></div>
            <ShieldCheck className="text-teal-900" size={24} />
          </div>
          <p className="mt-4 text-sm leading-6 text-stone-600">{activeMotorcycle ? 'Service readiness is derived from your odometer, service interval and qualifying service records.' : 'Activate a motorcycle to calculate service readiness.'}</p>
          {activeMotorcycle ? <details className="mt-5 border-t border-stone-200 pt-4"><summary className="min-h-10 cursor-pointer font-semibold text-stone-800">Open pre-ride checklist</summary><div className="mt-4"><ReadinessChecklist tripId={activeTrip?.id} motorcycleId={activeMotorcycle.id} /></div></details> : null}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(18rem,.65fr)]">
        <Section title="Recent Activity">
          <div className="divide-y divide-stone-200 border-y border-stone-200">
            {activity.map((item) => (
              <Link key={item.id} to={item.to} className="group grid min-h-16 grid-cols-[1fr_auto] items-center gap-4 py-3.5 transition hover:text-teal-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-800">
                <div className="min-w-0"><p className="truncate font-semibold">{item.title}</p><p className="mt-0.5 text-xs text-stone-500">{formatDate(item.at, true)}</p></div>
                <div className="flex items-center gap-2"><span className="text-sm text-stone-600">{item.detail}</span><ArrowUpRight size={15} className="text-stone-400 transition group-hover:text-teal-900" /></div>
              </Link>
            ))}
            {activity.length === 0 ? <p className="py-5 text-sm text-stone-600">Recent trips, fuel fills, expenses and maintenance will appear here.</p> : null}
          </div>
        </Section>

        <Section title="Quick Actions">
          <div className="grid gap-2">
            <ButtonLink to="/trips/new" className="w-full justify-between rounded-xl"><span className="flex items-center gap-2"><Bike size={17} /> Create trip</span><ArrowUpRight size={16} /></ButtonLink>
            <ButtonLink to="/fuel" className="w-full justify-between rounded-xl" variant="outline"><span className="flex items-center gap-2"><Fuel size={17} /> Log fuel</span><ArrowUpRight size={16} /></ButtonLink>
            <ButtonLink to="/expenses" className="w-full justify-between rounded-xl" variant="outline"><span className="flex items-center gap-2"><CircleDollarSign size={17} /> Add expense</span><ArrowUpRight size={16} /></ButtonLink>
            <ButtonLink to="/garage" className="w-full justify-between rounded-xl" variant="outline"><span className="flex items-center gap-2"><Wrench size={17} /> Maintenance</span><ArrowUpRight size={16} /></ButtonLink>
          </div>
        </Section>
      </section>

      {settings?.aiEnabled ? <Section title="Ask MyRide"><div className="surface-panel overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-50/65 px-4 py-3.5 sm:px-5"><div><p className="text-sm font-semibold text-stone-950">Ask your riding journal</p><p className="mt-0.5 text-xs text-stone-500">Answers are calculated locally before any optional model explanation.</p></div><span className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${settings.aiProvider !== 'local' ? 'border-teal-200 bg-teal-50 text-teal-950' : 'border-stone-200 bg-white text-stone-600'}`}>{settings.aiProvider === 'local' ? 'Local answer' : `${deviceAiProviders[settings.aiProvider].label} context`}</span></div><div className="p-4 sm:p-5"><form onSubmit={askMyRide} className="grid gap-3 sm:grid-cols-[1fr_auto]"><Input aria-label="Ask MyRide a question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="What was my longest trip?" /><Button type="submit" disabled={asking}>{asking ? 'Asking...' : 'Ask'}</Button></form>{answer ? <div role="status" className="mt-5 rounded-xl border border-stone-200 bg-stone-50/70 p-4"><p className="text-[10px] font-bold uppercase tracking-[0.13em] text-teal-800">Journal answer</p><p className="mt-2 text-sm leading-6 text-stone-800">{answer}</p>{explanation ? <><div className="my-3 h-px bg-stone-200" /><p className="text-xs font-bold uppercase tracking-[0.12em] text-stone-500">Model context</p><p className="mt-1.5 text-sm leading-6 text-stone-600">{explanation}</p></> : null}</div> : null}{aiMessage ? <p role="status" className="mt-3 text-sm text-amber-800">{aiMessage}</p> : null}</div></div></Section> : null}
    </div>
  )
}
