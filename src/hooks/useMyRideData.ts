import { useCallback } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { repository } from '../repositories/localRepository'
import { fuelAnalytics } from '../services/fuel/calculations'
import type { RidingStats } from '../types/myride'

export const queryKeys = {
  all: ['myride'],
  dashboard: ['myride', 'dashboard'],
  trips: ['myride', 'trips'],
  motorcycles: ['myride', 'motorcycles'],
  allMotorcycles: ['myride', 'all-motorcycles'],
  expenses: ['myride', 'expenses'],
  fuel: ['myride', 'fuel'],
  maintenance: ['myride', 'maintenance'],
  profile: ['myride', 'profile'],
  settings: ['myride', 'settings'],
}

export function useInvalidateMyRide() {
  const client = useQueryClient()
  return useCallback(() => client.invalidateQueries({ queryKey: queryKeys.all }), [client])
}

export function useTrips() {
  return useQuery({ queryKey: queryKeys.trips, queryFn: repository.trips.all })
}

export function useMotorcycles() {
  return useQuery({ queryKey: queryKeys.motorcycles, queryFn: repository.motorcycles.all })
}

export function useAllMotorcycles() {
  return useQuery({ queryKey: queryKeys.allMotorcycles, queryFn: repository.motorcycles.allIncludingDeleted })
}

export function useFuelLogs() {
  return useQuery({ queryKey: queryKeys.fuel, queryFn: repository.fuelLogs.all })
}

export function useMaintenanceLogs() {
  return useQuery({ queryKey: queryKeys.maintenance, queryFn: repository.maintenance.all })
}

export function useExpenses() {
  return useQuery({ queryKey: queryKeys.expenses, queryFn: repository.expenses.all })
}

export function useProfile() {
  return useQuery({ queryKey: queryKeys.profile, queryFn: async () => (await repository.profiles.get()) ?? null })
}

export function useSettings() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: repository.settings.get })
}

export function useDashboardData() {
  return useQuery({
    queryKey: queryKeys.dashboard,
    queryFn: async () => {
      const [trips, motorcycles, historicalMotorcycles, fuelLogs, expenses, maintenance, weather, queue, profile, emergencyContacts] = await Promise.all([
        repository.trips.all(),
        repository.motorcycles.all(),
        repository.motorcycles.allIncludingDeleted(),
        repository.fuelLogs.all(),
        repository.expenses.all(),
        repository.maintenance.all(),
        repository.weather.all(),
        repository.syncQueue.pending(),
        repository.profiles.get(),
        repository.emergencyContacts.all(),
      ])
      const analytics = fuelAnalytics(fuelLogs)
      const activeTrip = trips.find((trip) => trip.status === 'Active')
      const activeGpsPoint = activeTrip ? (await repository.gpsPoints.byTrip(activeTrip.id)).at(-1) : undefined
      const stats: RidingStats = {
        tripCount: trips.length,
        activeTripCount: trips.filter((trip) => trip.status === 'Active').length,
        completedTripCount: trips.filter((trip) => trip.status === 'Completed').length,
        totalDistanceKm: trips.reduce((sum, trip) => sum + (trip.distanceKm ?? 0), 0),
        totalDurationMinutes: trips.reduce((sum, trip) => sum + (trip.durationMinutes ?? 0), 0),
        totalFuelLitres: analytics.totalLitres,
        totalFuelCost: analytics.totalFuelCost,
        lifetimeMileageKmPerLitre: analytics.averageMileage,
        totalExpenses: expenses.reduce((sum, expense) => sum + expense.amount, 0),
      }
      return {
        trips,
        motorcycles,
        historicalMotorcycles,
        fuelLogs,
        expenses,
        maintenance,
        weather,
        queue,
        profile,
        emergencyContacts,
        activeGpsPoint,
        stats,
        fuelAnalytics: analytics,
      }
    },
  })
}
