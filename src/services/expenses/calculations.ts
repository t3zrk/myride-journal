import type { ExpenseLog, FuelLog } from '../../types/myride'

export const tripCostGroups = ['fuel', 'stay', 'food', 'tea', 'snacks', 'tolls', 'other'] as const

export type TripCostGroup = (typeof tripCostGroups)[number]

const otherCategories = new Set<ExpenseLog['category']>(['parking', 'maintenance', 'accessories', 'repairs', 'other'])

function recordedFuelCost(log: FuelLog) {
  if (log.totalCost !== undefined) return log.totalCost
  if (log.pricePerLitre !== undefined) return log.pricePerLitre * log.litres
  return 0
}

export function calculateTripCost(expenses: ExpenseLog[], fuelLogs: FuelLog[]) {
  const liveExpenses = expenses.filter((item) => !item.deletedAt)
  const liveFuelLogs = fuelLogs.filter((item) => !item.deletedAt)
  const fuelFillCost = liveFuelLogs.reduce((sum, log) => sum + recordedFuelCost(log), 0)
  const fuelExpenseCost = liveExpenses
    .filter((item) => item.category === 'fuel')
    .reduce((sum, item) => sum + item.amount, 0)

  const values: Record<TripCostGroup, number> = {
    fuel: fuelFillCost + fuelExpenseCost,
    stay: 0,
    food: 0,
    tea: 0,
    snacks: 0,
    tolls: 0,
    other: 0,
  }

  for (const expense of liveExpenses) {
    if (expense.category === 'fuel') continue
    if (expense.category === 'stay' || expense.category === 'food' || expense.category === 'tea' || expense.category === 'snacks' || expense.category === 'tolls') {
      values[expense.category] += expense.amount
    } else if (otherCategories.has(expense.category)) {
      values.other += expense.amount
    }
  }

  return {
    values,
    fuelFillCost,
    fuelExpenseCost,
    total: tripCostGroups.reduce((sum, group) => sum + values[group], 0),
  }
}
