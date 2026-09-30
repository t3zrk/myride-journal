import imageCompression from 'browser-image-compression'
import { gps, parse } from 'exifr'

export async function compressImageToDataUrl(file: File, thumbnail = false) {
  const compressed = await imageCompression(file, {
    maxSizeMB: thumbnail ? 0.12 : 1,
    maxWidthOrHeight: thumbnail ? 360 : 1600,
    useWebWorker: true,
  })
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(compressed)
  })
}

export async function readPhotoMetadata(file: File) {
  let latitude: number | undefined
  let longitude: number | undefined
  let takenAt = new Date(file.lastModified || Date.now()).toISOString()
  try {
    const coordinates = await gps(file)
    if (Number.isFinite(coordinates?.latitude) && Number.isFinite(coordinates?.longitude)) {
      latitude = coordinates.latitude
      longitude = coordinates.longitude
    }
  } catch { /* No embedded GPS metadata. */ }
  try {
    const tags = await parse(file, ['DateTimeOriginal']) as { DateTimeOriginal?: Date | string } | undefined
    const date = tags?.DateTimeOriginal ? new Date(tags.DateTimeOriginal) : undefined
    if (date && !Number.isNaN(date.getTime())) takenAt = date.toISOString()
  } catch { /* Keep the file timestamp. */ }
  return { latitude, longitude, takenAt }
}
