import { getCameraStatusString } from 'een-api-toolkit'
import type { CameraStatus } from 'een-api-toolkit'

type CameraStatusInput = CameraStatus | { connectionStatus?: CameraStatus } | undefined

// Re-export the toolkit helper so callers have a single import for status concerns
export { getCameraStatusString }

// Check if a camera is in a viewable (live-streamable) state
export function isCameraOnline(status?: CameraStatusInput): boolean {
  const statusStr = getCameraStatusString(status)
  return statusStr === 'online' || statusStr === 'streaming' || statusStr === 'registered'
}

// Tailwind background class for the status dot/badge
export function statusBadgeClass(status?: CameraStatusInput): string {
  switch (getCameraStatusString(status)) {
    case 'online':
    case 'streaming':
      return 'bg-green-500'
    case 'offline':
    case 'deviceOffline':
    case 'bridgeOffline':
      return 'bg-gray-500'
    case 'error':
    case 'invalidCredentials':
      return 'bg-red-500'
    default:
      return 'bg-yellow-500'
  }
}
