import { expect, test } from '@playwright/test'
import { answerStructuredQuestion, isSensitiveAssistantQuestion } from '../src/services/ai/assistant'
import type { AssistantContext } from '../src/services/ai/assistant'
import type { Trip } from '../src/types/myride'

const record = { userId: 'local-rider', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', syncStatus: 'pending' as const }
const trip = (id: string, title: string, status: Trip['status'], distanceKm: number, startDate: string, endDate?: string): Trip => ({
  ...record, id, title, status, distanceKm, startDate, endDate,
  origin: { label: 'Chennai' }, destination: { label: 'Pondicherry' },
  durationMinutes: status === 'Completed' ? 522 : undefined,
})

test('assistant only claims milestones and trip summaries proved by completed journeys', () => {
  const data: AssistantContext = {
    trips: [
      trip('completed', 'Completed ride', 'Completed', 100, '2026-01-01T00:00:00.000Z', '2026-01-01T08:42:00.000Z'),
      trip('active', 'Long active ride', 'Active', 1200, '2026-02-01T00:00:00.000Z'),
      trip('planned', 'Future ride', 'Planned', 5000, '2026-12-01T00:00:00.000Z'),
    ],
    motorcycles: [], fuelLogs: [], expenses: [], weather: [],
    stats: {
      tripCount: 3, activeTripCount: 1, completedTripCount: 1,
      totalDistanceKm: 6300, totalDurationMinutes: 522, totalFuelLitres: 0,
      totalFuelCost: 0, totalExpenses: 0,
    },
  }

  expect(answerStructuredQuestion('Show my milestones', data)).toContain('unlocked and not yet unlocked')
  expect(answerStructuredQuestion('What was my longest trip?', data)).toContain('Completed ride')
  const summary = answerStructuredQuestion('Summarize my last trip', data)
  expect(summary).toContain('Completed ride')
  expect(summary).toContain('8 h 42 min')
  expect(summary).not.toContain('Future ride')
})

test('assistant reads private safety fields only with explicit local permission', () => {
  const data: AssistantContext = {
    trips: [], motorcycles: [], fuelLogs: [], expenses: [], weather: [],
    stats: { tripCount: 0, activeTripCount: 0, completedTripCount: 0, totalDistanceKm: 0, totalDurationMinutes: 0, totalFuelLitres: 0, totalFuelCost: 0, totalExpenses: 0 },
    profile: { ...record, id: 'profile', name: 'Rider', aiSensitiveAccess: true, bloodGroup: 'O+', allergies: 'Peanuts', medicalNotes: 'Carry inhaler' },
    emergencyContacts: [{ ...record, id: 'contact', name: 'Asha', relationship: 'Family', phone: '5551234' }],
  }

  expect(isSensitiveAssistantQuestion('What is my blood group?')).toBe(true)
  expect(answerStructuredQuestion('What is my blood group?', data)).toContain('access is off')
  expect(answerStructuredQuestion('What is my blood group?', { ...data, allowSensitive: true })).toContain('O+')
  expect(answerStructuredQuestion('List my ICE contacts', { ...data, allowSensitive: true })).toContain('Asha (Family): 5551234')
})
