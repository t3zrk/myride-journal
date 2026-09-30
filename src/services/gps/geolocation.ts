import type { GpsPoint } from '../../types/myride'

export function getCurrentGpsPosition(): Promise<Omit<GpsPoint, 'id' | 'userId' | 'createdAt' | 'updatedAt' | 'syncStatus' | 'tripId'>> {
  if (!navigator.geolocation) {
    return Promise.reject(new Error('LOCATION UNAVAILABLE'))
  }

  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timestamp: new Date(position.timestamp).toISOString(),
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude,
          speed: position.coords.speed,
          heading: position.coords.heading,
        })
      },
      () => reject(new Error('LOCATION UNAVAILABLE')),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    )
  })
}
