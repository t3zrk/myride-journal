import { useEffect, useState } from 'react'
import { useInvalidateMyRide, useSettings, useTrips } from '../hooks/useMyRideData'
import { repository } from '../repositories/localRepository'
import { getCurrentGpsPosition } from '../services/gps/geolocation'
import { haversineKm, routeDistanceKm } from '../utils/distance'

export function ActiveTripTracker() {
  const { data: trips = [] } = useTrips()
  const { data: settings } = useSettings()
  const invalidate = useInvalidateMyRide()
  const activeTrips = trips.filter((trip) => trip.status === 'Active')
  const activeTripId = activeTrips.length === 1 ? activeTrips[0].id : undefined
  const intervalSeconds = settings?.gpsIntervalSeconds ?? 60
  const [error, setError] = useState('')

  useEffect(() => {
    if (!activeTripId) return
    const trackingTripId = activeTripId
    let stopped = false
    let busy = false

    async function capture() {
      if (stopped || busy) return
      busy = true
      try {
        const position = await getCurrentGpsPosition()
        if (stopped) return
        const trip = await repository.trips.get(trackingTripId)
        if (trip?.status !== 'Active' || trip.deletedAt) return
        const previous = await repository.gpsPoints.byTrip(trackingTripId)
        const last = previous.at(-1)
        setError('')
        if (last && (Date.now() - Date.parse(last.timestamp) < 20000 || haversineKm(last, position) < 0.015)) return
        await repository.gpsPoints.create({ ...position, tripId: trackingTripId })
        await repository.trips.update(trackingTripId, { distanceKm: routeDistanceKm([...previous, position]) })
        if (!stopped) {
          window.dispatchEvent(new CustomEvent('myride:tracked', { detail: { tripId: trackingTripId } }))
          await invalidate()
        }
      } catch {
        if (!stopped) setError('GPS capture unavailable. Check location services.')
      } finally {
        busy = false
      }
    }

    void capture()
    const timer = window.setInterval(() => void capture(), intervalSeconds * 1000)
    return () => { stopped = true; window.clearInterval(timer) }
  }, [activeTripId, intervalSeconds, invalidate])

  if (activeTrips.length > 1) return <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800 md:px-8">Multiple active trips. End one before GPS capture can continue.</p>
  return error && activeTripId ? <p role="alert" className="border-b border-red-200 bg-red-50 px-4 py-2.5 text-sm font-medium text-red-800 md:px-8">{error}</p> : null
}
