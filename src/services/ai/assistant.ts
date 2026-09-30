import { fuelAnalytics } from '../fuel/calculations'
import type { EmergencyContact, ExpenseLog, FuelLog, Motorcycle, Profile, RidingStats, Trip, WeatherSnapshot } from '../../types/myride'
import { formatDuration, formatFuelVolume, formatKm, formatMileage, formatMoney, formatTemperature } from '../../utils/record'

export interface AssistantContext {
  stats: RidingStats
  trips: Trip[]
  motorcycles: Motorcycle[]
  fuelLogs: FuelLog[]
  expenses: ExpenseLog[]
  weather: WeatherSnapshot[]
  profile?: Profile
  emergencyContacts?: EmergencyContact[]
  allowSensitive?: boolean
}

export function isSensitiveAssistantQuestion(question: string) {
  return /\bblood\s*group\b|\ballerg(?:y|ies|ic)\b|\bmedical\b|\bemergency\s+contacts?\b|\bice\b/i.test(question)
}

export function answerStructuredQuestion(question: string, data: AssistantContext) {
  const lower = question.trim().toLowerCase()
  if (!lower) return 'Ask about a trip, recorded fuel, expenses, mileage, weather, or milestones.'

  if (isSensitiveAssistantQuestion(question)) {
    if (!data.allowSensitive) return 'Sensitive profile access is off. Enable it in Profile to use private safety fields with Ask MyRide.'
    if (lower.includes('blood')) return data.profile?.bloodGroup ? `Your recorded blood group is ${data.profile.bloodGroup}.` : 'No blood group is recorded.'
    if (lower.includes('allerg')) return data.profile?.allergies ? `Recorded allergies: ${data.profile.allergies}.` : 'No allergies are recorded.'
    if (lower.includes('medical')) return data.profile?.medicalNotes ? `Recorded medical notes: ${data.profile.medicalNotes}` : 'No medical notes are recorded.'
    const contacts = data.emergencyContacts ?? []
    return contacts.length
      ? `Emergency contacts: ${contacts.map((contact) => `${contact.name}${contact.relationship ? ` (${contact.relationship})` : ''}: ${contact.phone}`).join('; ')}.`
      : 'No emergency contacts are recorded.'
  }

  const completed = data.trips.filter((trip) => trip.status === 'Completed')
  const longest = [...completed].filter((trip) => trip.distanceKm !== undefined).sort((a, b) => (b.distanceKm ?? 0) - (a.distanceKm ?? 0))[0]
  const recent = [...completed].sort((a, b) => (b.endDate ?? b.startDate).localeCompare(a.endDate ?? a.startDate))[0]

  if (lower.includes('longest') && lower.includes('weather')) {
    if (!longest) return 'There is no recorded trip distance yet.'
    const snapshots = data.weather.filter((item) => item.tripId === longest.id)
    const temperatures = snapshots.map((item) => item.temperatureC).filter((value): value is number => value !== undefined)
    if (!snapshots.length) return `${longest.title} was ${formatKm(longest.distanceKm)}. No weather snapshots were recorded for it.`
    return `${longest.title} was ${formatKm(longest.distanceKm)}. It has ${snapshots.length} recorded weather snapshots${temperatures.length ? `, with temperatures from ${formatTemperature(Math.min(...temperatures))} to ${formatTemperature(Math.max(...temperatures))}` : ''}.`
  }
  if (lower.includes('longest')) return longest ? `${longest.title} is your longest recorded trip at ${formatKm(longest.distanceKm)}.` : 'There is no recorded trip distance yet.'

  if (lower.includes('last trip') || lower.includes('recent trip')) {
    if (!recent) return 'No completed trips have been recorded yet.'
    const cost = data.expenses.filter((item) => item.tripId === recent.id).reduce((sum, item) => sum + item.amount, 0)
    const tripFuel = data.fuelLogs.filter((item) => item.tripId === recent.id)
    const tripFuelAnalytics = fuelAnalytics(tripFuel)
    const litres = tripFuel.reduce((sum, item) => sum + item.litres, 0)
    const snapshots = data.weather.filter((item) => item.tripId === recent.id)
    const mileage = tripFuelAnalytics.averageMileage === undefined ? 'verified mileage unavailable' : `${formatMileage(tripFuelAnalytics.averageMileage)} verified mileage`
    return `${recent.title}: ${recent.origin.label} to ${recent.destination.label}, ${recent.distanceKm === undefined ? 'distance unavailable' : formatKm(recent.distanceKm)}, and ${formatDuration(recent.durationMinutes)}. ${formatFuelVolume(litres)} was logged with ${mileage}; priced fills total ${formatMoney(tripFuelAnalytics.totalFuelCost)} and separate expenses total ${formatMoney(cost)}. ${snapshots.length} weather snapshots were recorded.`
  }

  if (lower.includes('better') && lower.includes('mileage')) {
    const bikes = data.motorcycles.map((bike) => ({ bike, analytics: fuelAnalytics(data.fuelLogs.filter((log) => log.motorcycleId === bike.id)) })).filter((item) => item.analytics.averageMileage !== undefined).sort((a, b) => (b.analytics.averageMileage ?? 0) - (a.analytics.averageMileage ?? 0))
    return bikes.length ? `${bikes[0].bike.nickname || bikes[0].bike.model} has the highest verified recorded mileage at ${formatMileage(bikes[0].analytics.averageMileage)}. ${bikes.length} motorcycles have enough full-tank data for comparison.` : 'No motorcycle has enough full-tank records for a verified mileage comparison.'
  }

  if (lower.includes('fuel') && (lower.includes('last year') || lower.includes('year'))) {
    const year = new Date().getFullYear() - (lower.includes('last year') ? 1 : 0)
    const loggedFuel = fuelAnalytics(data.fuelLogs.filter((item) => new Date(item.dateTime).getFullYear() === year)).totalFuelCost
    const fuelExpenses = data.expenses.filter((item) => item.category === 'fuel' && new Date(item.date).getFullYear() === year).reduce((sum, item) => sum + item.amount, 0)
    return `In ${year}, recorded fuel fills cost ${formatMoney(loggedFuel)}. Separately logged fuel expenses total ${formatMoney(fuelExpenses)}; these may include the same purchases.`
  }

  if (lower.includes('most') && (lower.includes('spend') || lower.includes('money'))) {
    const byCategory = new Map<string, number>()
    for (const item of data.expenses) byCategory.set(item.category, (byCategory.get(item.category) ?? 0) + item.amount)
    const top = [...byCategory].sort((a, b) => b[1] - a[1])[0]
    return top ? `Your largest separately logged expense category is ${top[0]} at ${formatMoney(top[1])}.` : 'No expenses have been recorded yet.'
  }

  if (lower.includes('milestone')) {
    const completedDistance = completed.reduce((sum, trip) => sum + (trip.distanceKm ?? 0), 0)
    return `${completed.length} completed trips and ${formatKm(completedDistance)} completed distance. Your first completed trip and 1,000 km milestones are ${completed.length > 0 ? 'unlocked' : 'not yet unlocked'} and ${completedDistance >= 1000 ? 'unlocked' : 'not yet unlocked'}, respectively.`
  }
  if (lower.includes('fuel') || lower.includes('mileage')) return `${formatFuelVolume(data.stats.totalFuelLitres)} of fuel is logged. Verified mileage is ${formatMileage(data.stats.lifetimeMileageKmPerLitre)} based on full-tank intervals.`
  if (lower.includes('spend') || lower.includes('expense') || lower.includes('cost')) return `Separately logged expenses total ${formatMoney(data.stats.totalExpenses)}. Recorded fuel fills total ${formatMoney(data.stats.totalFuelCost)}; avoid adding them together if the same purchase appears in both.`
  return `MyRide has ${data.stats.tripCount} trips, ${formatKm(data.stats.totalDistanceKm)}, and ${data.stats.completedTripCount} completed journeys. Try asking about your longest trip, fuel, or spending.`
}
