// Re-export types from een-api-toolkit for convenience
export type {
  Camera,
  CameraStatus,
  ListCamerasParams,
  Feed,
  ListFeedsParams,
  EenError,
  Event,
  EventType,
  SSEEvent,
  SSEConnection,
  SSEConnectionStatus,
  EventSubscription
} from 'een-api-toolkit'

// Helper type for camera status (can be string or nested object)
export type CameraStatusValue = import('een-api-toolkit').CameraStatus | { connectionStatus?: import('een-api-toolkit').CameraStatus }

// Selected camera state for sharing between components
export interface SelectedCameraState {
  cameraId: string | null
  cameraName: string | null
}

export interface User {
  id: string
  email: string
  firstName?: string
  lastName?: string
}

// Note: Event, EventType, SSEEvent, SSEConnection, SSEConnectionStatus, EventSubscription
// are now re-exported from een-api-toolkit above

export interface AuthState {
  isAuthenticated: boolean
  user: User | null
  accessToken: string | null
}
