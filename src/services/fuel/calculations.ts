import type { FuelLog, MileageInterval } from '../../types/myride'

export function calculateMileageIntervals(fuelLogs: FuelLog[]): MileageInterval[] {
  const intervals: MileageInterval[] = []
  const byMotorcycle = new Map<string, FuelLog[]>()
  for (const log of fuelLogs.filter((item) => !item.deletedAt)) {
    const records = byMotorcycle.get(log.motorcycleId) ?? []
    records.push(log)
    byMotorcycle.set(log.motorcycleId, records)
  }

  for (const [motorcycleId, records] of byMotorcycle) {
    const sorted = records.sort((a, b) => a.odometerKm - b.odometerKm || a.dateTime.localeCompare(b.dateTime))
    let anchor: FuelLog | undefined
    let carriedLitres = 0

    for (const log of sorted) {
      if (!Number.isFinite(log.odometerKm) || !Number.isFinite(log.litres) || log.litres <= 0) continue
      if (!log.fullTank) {
        if (anchor) carriedLitres += log.litres
        continue
      }

      if (!anchor) {
        anchor = log
        carriedLitres = 0
        continue
      }

      const distanceKm = log.odometerKm - anchor.odometerKm
      const litres = carriedLitres + log.litres
      if (distanceKm > 0 && litres > 0) {
        intervals.push({
          startFuelId: anchor.id,
          endFuelId: log.id,
          motorcycleId,
          distanceKm,
          litres,
          mileageKmPerLitre: distanceKm / litres,
          startOdometerKm: anchor.odometerKm,
          endOdometerKm: log.odometerKm,
        })
      }

      anchor = log
      carriedLitres = 0
    }
  }

  return intervals
}

export function fuelAnalytics(fuelLogs: FuelLog[]) {
  const validLogs = fuelLogs.filter((log) => !log.deletedAt)
  const intervals = calculateMileageIntervals(validLogs)
  const totalLitres = validLogs.reduce((sum, log) => sum + log.litres, 0)
  const totalFuelCost = validLogs.reduce((sum, log) => sum + (log.totalCost ?? (log.pricePerLitre ? log.pricePerLitre * log.litres : 0)), 0)
  const pricedLogs = validLogs.filter((log) => log.totalCost !== undefined || log.pricePerLitre !== undefined)
  const pricedLitres = pricedLogs.reduce((sum, log) => sum + log.litres, 0)
  const bestMileage = intervals.length ? Math.max(...intervals.map((item) => item.mileageKmPerLitre)) : undefined
  const lowestMileage = intervals.length ? Math.min(...intervals.map((item) => item.mileageKmPerLitre)) : undefined
  const totalVerifiedDistance = intervals.reduce((sum, interval) => sum + interval.distanceKm, 0)
  const totalVerifiedLitres = intervals.reduce((sum, interval) => sum + interval.litres, 0)
  const averageMileage = totalVerifiedLitres > 0 ? totalVerifiedDistance / totalVerifiedLitres : undefined
  const recent = [...intervals].sort((a, b) => b.endOdometerKm - a.endOdometerKm).slice(0, 3)
  const recentDistance = recent.reduce((sum, interval) => sum + interval.distanceKm, 0)
  const recentLitres = recent.reduce((sum, interval) => sum + interval.litres, 0)
  const recentAverageMileage = recentLitres > 0 ? recentDistance / recentLitres : undefined
  let pricedDistance = 0
  let pricedCost = 0
  for (const interval of intervals) {
    const fills = validLogs.filter((log) => log.motorcycleId === interval.motorcycleId && log.odometerKm > interval.startOdometerKm && log.odometerKm <= interval.endOdometerKm)
    if (!fills.length || fills.some((log) => log.totalCost === undefined && log.pricePerLitre === undefined)) continue
    pricedDistance += interval.distanceKm
    pricedCost += fills.reduce((sum, log) => sum + (log.totalCost ?? (log.pricePerLitre ?? 0) * log.litres), 0)
  }

  return {
    intervals,
    verifiedIntervals: intervals.length,
    totalLitres,
    totalFuelCost,
    averageFuelPrice: pricedLitres > 0 ? totalFuelCost / pricedLitres : undefined,
    averageMileage,
    recentAverageMileage,
    bestMileage,
    lowestMileage,
    costPerKm: pricedDistance > 0 ? pricedCost / pricedDistance : undefined,
  }
}

export function estimateSafeRangeKm(tankCapacityLitres?: number, mileageKmPerLitre?: number, reservePercent = 15) {
  if (!tankCapacityLitres || !mileageKmPerLitre) return undefined
  const usableFuel = tankCapacityLitres * (1 - reservePercent / 100)
  return usableFuel * mileageKmPerLitre
}
