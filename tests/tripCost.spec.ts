import { expect, test } from '@playwright/test'
import { calculateTripCost } from '../src/services/expenses/calculations'
import type { ExpenseLog, FuelLog } from '../src/types/myride'

const timestamp = '2026-09-29T08:00:00.000Z'

function expense(category: ExpenseLog['category'], amount: number, deletedAt?: string): ExpenseLog {
  return {
    id: crypto.randomUUID(), userId: 'local-rider', createdAt: timestamp, updatedAt: timestamp, syncStatus: 'pending',
    category, amount, currency: 'INR', date: timestamp, paymentMethod: 'Cash', deletedAt,
  }
}

function fuel(totalCost?: number, pricePerLitre?: number): FuelLog {
  return {
    id: crypto.randomUUID(), userId: 'local-rider', createdAt: timestamp, updatedAt: timestamp, syncStatus: 'pending',
    motorcycleId: crypto.randomUUID(), dateTime: timestamp, odometerKm: 1000, litres: 10, totalCost, pricePerLitre, fullTank: true,
  }
}

test('trip cost groups every recorded amount without silently dropping fuel or riding costs', () => {
  const result = calculateTripCost(
    [expense('fuel', 50), expense('stay', 400), expense('food', 120), expense('tea', 30), expense('snacks', 20), expense('tolls', 80), expense('parking', 25), expense('repairs', 75), expense('other', 40), expense('food', 999, timestamp)],
    [fuel(900), fuel(undefined, 5)],
  )

  expect(result.fuelFillCost).toBe(950)
  expect(result.fuelExpenseCost).toBe(50)
  expect(result.values).toEqual({ fuel: 1000, stay: 400, food: 120, tea: 30, snacks: 20, tolls: 80, other: 140 })
  expect(result.total).toBe(1790)
})
