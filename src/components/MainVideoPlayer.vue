<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useAuthStore, getEvent, getCamera, getCameraSettings, getBridge, getDataSchemasForEventType, movePtz, getPtzSettings, getPtzPosition } from 'een-api-toolkit'
import type { Camera, PtzDirection, PtzPreset, PtzPositionResponse } from 'een-api-toolkit'
import { getCameraStatusString, isCameraOnline, statusBadgeClass } from '@/utils/cameraStatus'
import LivePlayer from '@een/live-video-web-sdk'
import { useHlsPlayer } from '@/composables/useHlsPlayer'
import { useVideoExport } from '@/composables/useVideoExport'
import BoundingBoxOverlay from './BoundingBoxOverlay.vue'
import type { BoundingBox } from '@/composables/useBoundingBoxes'

const props = defineProps<{
  camera: Camera
  playbackMode?: 'live' | 'recorded'
  playbackTimestamp?: string | null
  playbackEventType?: string | null
  playbackBoundingBoxes?: BoundingBox[]
  playbackEventObject?: Record<string, unknown> | null
  isAlertSource?: boolean
  isDark?: boolean
  eventsList?: Array<{ id: string; creatorId?: string }>
}>()

// Cache for fetched events (to avoid duplicate API calls)
const fetchedEventsCache = new Map<string, string>()

// Auth store for baseUrl and token
const authStore = useAuthStore()

// HLS player for recorded playback
const hlsPlayer = useHlsPlayer()

// Computed: is live mode active
const isLiveMode = computed(() => props.playbackMode !== 'recorded')

// Video element reference
const videoRef = ref<HTMLVideoElement | null>(null)

// Live player instance
let livePlayer: LivePlayer | null = null

// Stream state
const loading = ref(true)
const error = ref<string | null>(null)
const isStreaming = ref(false)
const isMounted = ref(true)

// Retry timer for offline cameras
let retryInterval: ReturnType<typeof setInterval> | null = null

// HLS playback state
const isHlsPlaying = ref(true) // Assume playing initially since autoplay is enabled
const currentVideoTime = ref(0) // Track current video time for bounding box display

// Triggering event's creatorId (when current event has eventId reference)
const triggeringEventCreatorId = ref<string | null>(null)

// Calculate event end offset from event object timestamps
const eventEndOffset = computed(() => {
  if (!props.playbackEventObject) return 0

  const startTimestamp = props.playbackEventObject.startTimestamp as string | undefined
  const endTimestamp = props.playbackEventObject.endTimestamp as string | undefined

  if (!startTimestamp || !endTimestamp) return hlsPlayer.eventStartOffset.value

  const startMs = new Date(startTimestamp).getTime()
  const endMs = new Date(endTimestamp).getTime()
  const durationSeconds = (endMs - startMs) / 1000

  // Event end offset = event start offset + duration
  return hlsPlayer.eventStartOffset.value + durationSeconds
})

// Check if video is within event time range (between start and end timestamps)
const BOUNDING_BOX_TOLERANCE = 0.25 // seconds tolerance at boundaries
const isWithinEventTimeRange = computed(() => {
  const startOffset = hlsPlayer.eventStartOffset.value
  const endOffset = eventEndOffset.value
  const currentTime = currentVideoTime.value

  // Check if current time is within the event range (with tolerance at boundaries)
  return currentTime >= (startOffset - BOUNDING_BOX_TOLERANCE) &&
         currentTime <= (endOffset + BOUNDING_BOX_TOLERANCE)
})

// Event data modal state
const showEventDataModal = ref(false)
const copiedToClipboard = ref(false)

// Camera data modal state
const showCameraDataModal = ref(false)
const cameraDataResponse = ref<Record<string, unknown> | null>(null)
const cameraDataLoading = ref(false)
const cameraDataCopied = ref(false)

// Camera modal view state
const cameraModalView = ref<'details' | 'settings' | 'bridge'>('details')
const cameraSettingsResponse = ref<Record<string, unknown> | null>(null)
const cameraSettingsLoading = ref(false)
const bridgeDataResponse = ref<Record<string, unknown> | null>(null)
const bridgeDataLoading = ref(false)

// PTZ state
const ptzLoading = ref(false)
const isPtzCapable = computed(() => {
  const ptz = props.camera.capabilities?.ptz as { capable?: boolean; fisheye?: boolean } | undefined
  return ptz?.capable === true && ptz?.fisheye !== true
})
const ptzPresets = ref<PtzPreset[]>([])
const ptzHomePreset = ref<PtzPreset | null>(null)
const ptzCurrentPosition = ref<PtzPositionResponse | null>(null)
let ptzPositionInterval: ReturnType<typeof setInterval> | null = null

const PTZ_TOLERANCE = 0.01

const isAtHome = computed(() => {
  if (!ptzHomePreset.value || !ptzCurrentPosition.value) return false
  const home = ptzHomePreset.value.position
  const pos = ptzCurrentPosition.value
  return Math.abs(home.x - pos.x) <= PTZ_TOLERANCE &&
         Math.abs(home.y - pos.y) <= PTZ_TOLERANCE &&
         Math.abs(home.z - pos.z) <= PTZ_TOLERANCE
})

async function fetchPtzPosition() {
  if (!isPtzCapable.value) return
  const { data } = await getPtzPosition(props.camera.id)
  if (data) ptzCurrentPosition.value = data
}

function startPtzPositionPolling() {
  stopPtzPositionPolling()
  if (!isPtzCapable.value || !ptzHomePreset.value) return
  fetchPtzPosition()
  ptzPositionInterval = setInterval(fetchPtzPosition, 5000)
}

function stopPtzPositionPolling() {
  if (ptzPositionInterval) {
    clearInterval(ptzPositionInterval)
    ptzPositionInterval = null
  }
}

async function fetchPtzPresets() {
  if (!isPtzCapable.value) return
  const { data } = await getPtzSettings(props.camera.id)
  ptzPresets.value = data?.presets ?? []
  const homeName = data?.homePreset
  ptzHomePreset.value = homeName ? (ptzPresets.value.find(p => p.name === homeName) ?? null) : null
  if (ptzHomePreset.value) {
    startPtzPositionPolling()
  } else {
    stopPtzPositionPolling()
  }
}

async function handlePtzMove(direction: PtzDirection[]) {
  if (ptzLoading.value) return
  ptzLoading.value = true
  try {
    await movePtz(props.camera.id, { moveType: 'direction', direction, stepSize: 'medium' })
  } catch (err) {
    console.error('PTZ move failed:', err)
  } finally {
    ptzLoading.value = false
    fetchPtzPosition()
  }
}

async function handlePtzPreset(preset: PtzPreset) {
  if (ptzLoading.value) return
  ptzLoading.value = true
  try {
    await movePtz(props.camera.id, {
      moveType: 'position',
      x: preset.position.x,
      y: preset.position.y,
      z: preset.position.z
    })
  } catch (err) {
    console.error('PTZ preset move failed:', err)
  } finally {
    ptzLoading.value = false
    fetchPtzPosition()
  }
}

async function handlePtzHome() {
  if (!ptzHomePreset.value) return
  await handlePtzPreset(ptzHomePreset.value)
}

// All valid include values for getCameraSettings
const CAMERA_SETTINGS_INCLUDE_VALUES = ['schema', 'proposedValues'] as const

// All valid include values for getBridge
const BRIDGE_INCLUDE_VALUES = [
  'status', 'locationSummary', 'deviceAddress', 'timeZone',
  'notes', 'tags', 'devicePosition', 'networkInfo', 'deviceInfo',
  'effectivePermissions', 'resourceStatusCounts', 'resourceCounts'
]

// All valid include values for getCamera
const CAMERA_INCLUDE_VALUES = [
  'bridge', 'account', 'status', 'locationSummary', 'deviceAddress', 'timeZone',
  'notes', 'tags', 'devicePosition', 'networkInfo', 'deviceInfo', 'effectivePermissions',
  'firmware', 'shareDetails', 'visibleByBridges', 'capabilities', 'analog', 'packages',
  'dewarpConfig', 'adminCredentials', 'publicSafetySharing', 'enabledAnalytics'
]

// Video export state
const { isActive: exportIsActive, startExport } = useVideoExport()
const exportError = ref<string | null>(null)

// Handle ESC key to close modal
function handleEscKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    showEventDataModal.value = false
    showCameraDataModal.value = false
  }
}

// Handle keyboard shortcuts for HLS recorded playback
function handlePlaybackKeys(event: KeyboardEvent) {
  // Ignore when typing in inputs, textareas, or selects
  const tag = (event.target as HTMLElement)?.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

  // Ignore when modal is open
  if (showEventDataModal.value || showCameraDataModal.value) return

  // Only active in recorded mode with a loaded video
  if (isLiveMode.value || !hlsPlayer.videoUrl.value) return

  const video = hlsPlayer.videoRef.value
  if (!video) return

  switch (event.key) {
    case ' ':
      event.preventDefault()
      if (video.paused) {
        video.play()
        isHlsPlaying.value = true
      } else {
        video.pause()
        isHlsPlaying.value = false
      }
      break
    case 'ArrowRight':
      event.preventDefault()
      video.currentTime = Math.min(video.currentTime + (event.shiftKey ? 0.5 : 10), video.duration)
      break
    case 'ArrowLeft':
      event.preventDefault()
      video.currentTime = Math.max(video.currentTime - (event.shiftKey ? 0.5 : 10), 0)
      break
    case 'Enter':
      event.preventDefault()
      hlsPlayer.seekToEventStart()
      video.pause()
      isHlsPlaying.value = false
      break
  }
}

// Watch modal state to add/remove ESC key listener
watch([showEventDataModal, showCameraDataModal], ([eventOpen, cameraOpen]) => {
  if (eventOpen || cameraOpen) {
    document.addEventListener('keydown', handleEscKey)
  } else {
    document.removeEventListener('keydown', handleEscKey)
  }
})

// Copy data to clipboard (event or alert)
async function copyDataToClipboard() {
  if (!props.playbackEventObject) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.playbackEventObject, null, 2))
    copiedToClipboard.value = true
    setTimeout(() => {
      copiedToClipboard.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
  }
}

// Fetch camera details with all include values
async function fetchCameraDetails() {
  cameraDataLoading.value = true
  cameraDataResponse.value = null
  cameraModalView.value = 'details'
  cameraDataCopied.value = false
  showCameraDataModal.value = true
  try {
    const { data, error: apiError } = await getCamera(props.camera.id, { include: CAMERA_INCLUDE_VALUES })
    if (apiError) {
      cameraDataResponse.value = { error: apiError.message || 'Failed to fetch camera details' }
    } else {
      cameraDataResponse.value = data as unknown as Record<string, unknown>
    }
  } catch (err) {
    console.error('Failed to fetch camera details:', err)
    cameraDataResponse.value = { error: 'Failed to fetch camera details', details: String(err) }
  } finally {
    cameraDataLoading.value = false
  }
}

// Copy camera data to clipboard (details or settings, whichever is active)
async function copyCameraDataToClipboard() {
  const data = activeCameraModalData.value
  if (!data) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(data, null, 2))
    cameraDataCopied.value = true
    setTimeout(() => {
      cameraDataCopied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
  }
}

// Fetch camera settings with all include values
async function fetchCameraSettings() {
  cameraSettingsLoading.value = true
  cameraSettingsResponse.value = null
  cameraModalView.value = 'settings'
  cameraDataCopied.value = false
  try {
    const { data, error: apiError } = await getCameraSettings(props.camera.id, { include: [...CAMERA_SETTINGS_INCLUDE_VALUES] })
    if (apiError) {
      cameraSettingsResponse.value = { error: apiError.message || 'Failed to fetch camera settings' }
    } else {
      cameraSettingsResponse.value = data as unknown as Record<string, unknown>
    }
  } catch (err) {
    console.error('Failed to fetch camera settings:', err)
    cameraSettingsResponse.value = { error: 'Failed to fetch camera settings', details: String(err) }
  } finally {
    cameraSettingsLoading.value = false
  }
}

// Fetch bridge details with all include values
async function fetchBridgeDetails() {
  if (!props.camera.bridgeId) {
    bridgeDataResponse.value = { error: 'No bridge associated with this camera' }
    cameraModalView.value = 'bridge'
    cameraDataCopied.value = false
    return
  }
  bridgeDataLoading.value = true
  bridgeDataResponse.value = null
  cameraModalView.value = 'bridge'
  cameraDataCopied.value = false
  try {
    const { data, error: apiError } = await getBridge(props.camera.bridgeId, { include: BRIDGE_INCLUDE_VALUES })
    if (apiError) {
      bridgeDataResponse.value = { error: apiError.message || 'Failed to fetch bridge details' }
    } else {
      bridgeDataResponse.value = data as unknown as Record<string, unknown>
    }
  } catch (err) {
    console.error('Failed to fetch bridge details:', err)
    bridgeDataResponse.value = { error: 'Failed to fetch bridge details', details: String(err) }
  } finally {
    bridgeDataLoading.value = false
  }
}

// Switch camera modal view (no fetch needed for details since data is already loaded)
function switchCameraModalView(view: 'details' | 'settings' | 'bridge') {
  cameraDataCopied.value = false
  if (view === 'details') {
    cameraModalView.value = 'details'
  } else if (view === 'settings') {
    fetchCameraSettings()
  } else {
    fetchBridgeDetails()
  }
}

// Active modal data for copy (depends on current view)
const activeCameraModalData = computed(() => {
  if (cameraModalView.value === 'settings') return cameraSettingsResponse.value
  if (cameraModalView.value === 'bridge') return bridgeDataResponse.value
  return cameraDataResponse.value
})

const activeCameraModalLoading = computed(() => {
  if (cameraModalView.value === 'settings') return cameraSettingsLoading.value
  if (cameraModalView.value === 'bridge') return bridgeDataLoading.value
  return cameraDataLoading.value
})

// Active include values for the current view
const activeCameraModalIncludeValues = computed(() => {
  if (cameraModalView.value === 'settings') return [...CAMERA_SETTINGS_INCLUDE_VALUES]
  if (cameraModalView.value === 'bridge') return BRIDGE_INCLUDE_VALUES
  return CAMERA_INCLUDE_VALUES
})

// Modal title based on current view
const cameraModalTitle = computed(() => {
  if (cameraModalView.value === 'settings') return 'Camera Settings'
  if (cameraModalView.value === 'bridge') return 'Bridge Data'
  return 'Camera Data'
})

// Handle video download - exports the currently playing video clip
async function handleDownloadClick(e: Event) {
  e.stopPropagation()
  exportError.value = null

  // Use the current clip's timestamps from the HLS player
  const clipStart = hlsPlayer.clipStartTimestamp.value
  const clipEnd = hlsPlayer.clipEndTimestamp.value

  if (!clipStart || !clipEnd) {
    exportError.value = 'No video clip loaded'
    return
  }

  // Get event timestamps from the playback event object
  const eventStart = props.playbackEventObject?.startTimestamp as string | undefined
  const eventEnd = props.playbackEventObject?.endTimestamp as string | undefined

  // Use event timestamps if available, otherwise fall back to clip timestamps
  const eventStartTimestamp = eventStart || clipStart
  const eventEndTimestamp = eventEnd || clipEnd

  const result = await startExport({
    cameraId: props.camera.id,
    cameraName: props.camera.name,
    clipStartTimestamp: clipStart,
    clipEndTimestamp: clipEnd,
    eventStartTimestamp,
    eventEndTimestamp,
    eventType: props.playbackEventType || 'Unknown'
  })

  if (!result.success && result.error) {
    exportError.value = result.error
    // Clear error after 3 seconds
    setTimeout(() => {
      exportError.value = null
    }, 3000)
  }
}

// Computed status values
const statusString = computed(() => getCameraStatusString(props.camera.status))

// Google Maps URL from camera devicePosition
const googleMapsUrl = computed(() => {
  const pos = props.camera.devicePosition
  if (pos?.latitude != null && pos?.longitude != null) {
    return `https://www.google.com/maps/search/?api=1&query=${pos.latitude},${pos.longitude}`
  }
  return null
})

// Tooltip for Google Maps icon
const googleMapsTooltip = computed(() => {
  const cam = props.camera as unknown as Record<string, unknown>
  const addr = cam.deviceAddress as { name?: string; address?: string } | undefined
  const parts: string[] = ['View on Google Maps']
  if (addr?.name) parts.push(addr.name)
  if (addr?.address) parts.push(addr.address)
  return parts.join('\n')
})

const isOnline = computed(() => isCameraOnline(props.camera.status))

// Status badge styling
const statusClass = computed(() => statusBadgeClass(props.camera.status))

// Format playback timestamp for display in local timezone
const formattedPlaybackTimestamp = computed(() => {
  if (!props.playbackTimestamp) return null
  const date = new Date(props.playbackTimestamp)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
})

// Current data type for modal title
const currentDataType = computed(() => props.isAlertSource ? 'Alert' : 'Event')

// Data schemas available for the current event type
const eventDataSchemas = computed(() => {
  if (!props.playbackEventObject || props.isAlertSource) return []
  const eventType = props.playbackEventObject.type as string | undefined
  if (!eventType) return []
  return getDataSchemasForEventType(eventType)
})

// Include parameter values used in the alert API call
const alertIncludeValues = computed(() => {
  if (!props.playbackEventObject || !props.isAlertSource) return []
  return ['data', 'actions', 'dataSchemas', 'description']
})

// Calculate event duration from startTimestamp and endTimestamp
const eventDuration = computed(() => {
  if (!props.playbackEventObject) return null

  const startTimestamp = props.playbackEventObject.startTimestamp as string | undefined
  const endTimestamp = props.playbackEventObject.endTimestamp as string | undefined

  if (!startTimestamp || !endTimestamp) return null

  const startMs = new Date(startTimestamp).getTime()
  const endMs = new Date(endTimestamp).getTime()
  const diffMs = endMs - startMs

  // Return null if timestamps are the same or invalid
  if (diffMs <= 0) return null

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  // Show milliseconds if duration is less than 1 second
  if (diffMs > 0 && diffMs < 1000) {
    return `${diffMs}ms`
  } else if (seconds < 60) {
    return `${seconds}s`
  } else if (minutes < 60) {
    const remainingSeconds = seconds % 60
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`
  } else if (hours < 24) {
    const remainingMinutes = minutes % 60
    return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`
  } else {
    const remainingHours = hours % 24
    return remainingHours > 0 ? `${days}d ${remainingHours}h` : `${days}d`
  }
})

// Helper function to format creatorId (e.g., "een.defaultCloudAnalytics.v1" -> "Default Cloud Analytics")
function formatCreatorId(creatorId: string): string {
  // Strip "een." prefix and version suffix like ".v1", ".v2", etc.
  let formatted = creatorId
    .replace(/^een\./, '')
    .replace(/\.v\d+$/, '')

  // Add spaces before uppercase letters (camelCase to "Camel Case")
  formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2')

  // Capitalize the first letter
  formatted = formatted.charAt(0).toUpperCase() + formatted.slice(1)

  return formatted
}

// Format creatorId for display, including triggering event source if available
const formattedCreatorId = computed(() => {
  if (!props.playbackEventObject) return null

  const creatorId = props.playbackEventObject.creatorId as string | undefined
  if (!creatorId) return null

  let formattedCurrent = formatCreatorId(creatorId)

  // Show "Event" instead of "events"
  if (formattedCurrent === 'events') {
    formattedCurrent = 'Event'
  }

  // If there's an eventId and we have the triggering event's creatorId, show both
  const eventId = props.playbackEventObject.eventId as string | undefined
  if (eventId && triggeringEventCreatorId.value) {
    return `${formattedCurrent} ← ${triggeringEventCreatorId.value}`
  }

  return formattedCurrent
})

// Watch for playbackEventObject changes to fetch triggering event if eventId is present
watch(() => props.playbackEventObject, async (newEventObject) => {
  // Reset triggering event creatorId
  triggeringEventCreatorId.value = null

  if (!newEventObject) return

  const eventId = newEventObject.eventId as string | undefined
  if (!eventId) return

  // First, check if we already have this event in the cache
  if (fetchedEventsCache.has(eventId)) {
    triggeringEventCreatorId.value = fetchedEventsCache.get(eventId) || null
    return
  }

  // Second, check if the event is in the provided events list
  if (props.eventsList) {
    const existingEvent = props.eventsList.find(e => e.id === eventId)
    if (existingEvent?.creatorId) {
      const formattedTriggeringCreatorId = formatCreatorId(existingEvent.creatorId)
      fetchedEventsCache.set(eventId, formattedTriggeringCreatorId)
      triggeringEventCreatorId.value = formattedTriggeringCreatorId
      return
    }
  }

  // Finally, fetch from the API
  const result = await getEvent(eventId)
  if (!result.error && result.data) {
    const triggeringCreatorId = result.data.creatorId
    if (triggeringCreatorId) {
      const formattedTriggeringCreatorId = formatCreatorId(triggeringCreatorId)
      fetchedEventsCache.set(eventId, formattedTriggeringCreatorId)
      triggeringEventCreatorId.value = formattedTriggeringCreatorId
    }
  }
}, { immediate: true })

// Extract EEVA reason from eevaAttributes data (for eevaQueryEvent events)
const eevaReason = computed(() => {
  if (!props.playbackEventObject) return null

  // Only show for eevaQueryEvent type
  const eventType = props.playbackEventObject.type as string | undefined
  if (eventType !== 'een.eevaQueryEvent.v1') return null

  const data = props.playbackEventObject.data as Array<Record<string, unknown>> | undefined
  if (!data || !Array.isArray(data)) return null

  // Find eevaAttributes entry and extract reason
  const eevaAttributes = data.find(item => item.type === 'een.eevaAttributes.v1')
  if (!eevaAttributes) return null

  const reason = eevaAttributes.reason as string | undefined
  return reason || null
})

// Extract confidence from objectClassification data (handles multiple objects)
const formattedConfidence = computed(() => {
  if (!props.playbackEventObject) return null

  const data = props.playbackEventObject.data as Array<Record<string, unknown>> | undefined
  if (!data || !Array.isArray(data)) return null

  // Find all objectClassification entries and extract confidence values
  const confidences = data
    .filter(item => item.type === 'een.objectClassification.v1')
    .map(item => item.confidence as number)
    .filter(c => typeof c === 'number')

  if (confidences.length === 0) return null

  if (confidences.length === 1) {
    return `${Math.round(confidences[0] * 100)}%`
  }

  // Multiple confidence values - show range with count
  const min = Math.min(...confidences)
  const max = Math.max(...confidences)
  return `between ${Math.round(min * 100)}% and ${Math.round(max * 100)}% (${confidences.length})`
})

// Handle event card click - seek to timestamp and toggle play/pause
function handleEventCardClick() {
  const video = hlsPlayer.videoRef.value
  if (!video) return

  if (props.playbackTimestamp && hlsPlayer.videoUrl.value) {
    // Seek back to the event timestamp
    hlsPlayer.seekToEventStart()

    // Toggle play/pause
    if (video.paused) {
      video.play()
      isHlsPlaying.value = true
    } else {
      video.pause()
      isHlsPlaying.value = false
      currentVideoTime.value = video.currentTime
    }
  }
}

// Update play state when video events occur
function setupVideoEventListeners() {
  const video = hlsPlayer.videoRef.value
  if (!video) return

  video.addEventListener('play', () => {
    isHlsPlaying.value = true
  })
  video.addEventListener('pause', () => {
    isHlsPlaying.value = false
    currentVideoTime.value = video.currentTime
  })
  // Track video position continuously for bounding box display
  video.addEventListener('timeupdate', () => {
    currentVideoTime.value = video.currentTime
  })
}

// Stop the current live player and clear video element
function stopLivePlayer() {
  if (livePlayer) {
    try {
      livePlayer.stop()
    } catch (e) {
      // Ignore errors during cleanup
    }
    livePlayer = null
  }

  // Clear the video element source to ensure clean restart
  if (videoRef.value) {
    videoRef.value.srcObject = null
    videoRef.value.src = ''
    videoRef.value.load()
  }

  isStreaming.value = false
}

// Stop the retry timer for offline cameras
function stopRetryTimer() {
  if (retryInterval) {
    clearInterval(retryInterval)
    retryInterval = null
  }
}

// Start a retry timer that re-checks camera status every 60 seconds
function startRetryTimer() {
  if (retryInterval) return // Already running
  retryInterval = setInterval(async () => {
    const result = await getCamera(props.camera.id, { include: ['status'] })
    if (result.error || !result.data) return
    if (isCameraOnline(result.data.status)) {
      stopRetryTimer()
      // Update camera status so the UI badge reflects the change
      props.camera.status = result.data.status
      initializeLiveVideo()
    }
  }, 60000)
}

// Initialize live video stream using Live Video SDK
async function initializeLiveVideo() {
  if (!isMounted.value) return

  // Stop any existing player
  stopLivePlayer()

  loading.value = true
  error.value = null

  // Check if camera is online
  if (!isOnline.value) {
    loading.value = false
    error.value = 'Camera is offline - retrying every 60s'
    startRetryTimer()
    return
  }

  // Check authentication
  if (!authStore.token || !authStore.baseUrl) {
    loading.value = false
    error.value = 'Authentication required'
    return
  }

  // Wait for next tick to ensure video element is in DOM
  await nextTick()

  if (!videoRef.value) {
    loading.value = false
    error.value = 'Video element not available'
    return
  }

  if (!isMounted.value) return

  try {
    // CRITICAL: Create LivePlayer with NO arguments
    livePlayer = new LivePlayer()

    // CRITICAL: Pass config to start() method, NOT constructor
    await livePlayer.start({
      videoElement: videoRef.value,
      cameraId: props.camera.id,
      baseUrl: authStore.baseUrl,
      jwt: authStore.token
    })

    if (isMounted.value) {
      isStreaming.value = true
      loading.value = false
      stopRetryTimer()
    }
  } catch (e) {
    if (isMounted.value) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to start live video'
      error.value = errorMessage
      loading.value = false
      stopLivePlayer()
    }
  }
}

// Watch for camera changes - stop current player and start new one
watch(() => props.camera.id, async (newId, oldId) => {
  if (newId !== oldId) {
    stopRetryTimer()
    stopPtzPositionPolling()
    ptzPresets.value = []
    ptzHomePreset.value = null
    ptzCurrentPosition.value = null
    // Stop HLS if playing
    hlsPlayer.resetVideo()
    // Small delay to ensure clean transition
    await new Promise(resolve => setTimeout(resolve, 100))
    if (isLiveMode.value) {
      initializeLiveVideo()
    }
    fetchPtzPresets()
  }
})

// Watch for playback mode changes
watch([() => props.playbackMode, () => props.playbackTimestamp], async ([newMode, newTimestamp], [oldMode]) => {
  if (newMode === 'recorded' && newTimestamp) {
    // Switch to HLS playback
    exportError.value = null
    stopRetryTimer()
    stopLivePlayer()
    await nextTick()
    await hlsPlayer.loadVideo(props.camera.id, newTimestamp)
    // Set up event listeners after video loads
    await nextTick()
    setupVideoEventListeners()
    isHlsPlaying.value = true // Reset to playing state
  } else if (newMode === 'live' && oldMode === 'recorded') {
    // Switch back to live
    hlsPlayer.resetVideo()
    await new Promise(resolve => setTimeout(resolve, 100))
    initializeLiveVideo()
  }
})

onMounted(() => {
  document.addEventListener('keydown', handlePlaybackKeys)
  if (isLiveMode.value) {
    initializeLiveVideo()
  }
  fetchPtzPresets()
})

onUnmounted(() => {
  isMounted.value = false
  stopRetryTimer()
  stopPtzPositionPolling()
  stopLivePlayer()
  hlsPlayer.destroyHls()
  document.removeEventListener('keydown', handleEscKey)
  document.removeEventListener('keydown', handlePlaybackKeys)
})
</script>

<template>
  <div class="main-video-player h-full flex gap-4" :data-camera-id="camera.id">
    <!-- Video Container -->
    <div class="flex-1 min-w-0 relative bg-gray-900 rounded-lg overflow-hidden">
      <!-- LIVE MODE -->
      <template v-if="isLiveMode">
        <!-- Loading Overlay - shown on top of video element -->
        <div
          v-if="loading"
          class="absolute inset-0 flex items-center justify-center bg-gray-800 z-10"
        >
          <div class="text-center">
            <svg
              class="w-12 h-12 mx-auto text-gray-500 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p class="mt-3 text-gray-400 text-sm">Loading HD stream...</p>
          </div>
        </div>

        <!-- Error Overlay - shown on top of video element -->
        <div
          v-if="error && !loading"
          class="absolute inset-0 flex items-center justify-center bg-gray-800 z-10"
        >
          <div class="text-center">
            <svg
              class="w-16 h-16 mx-auto text-gray-500 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p class="text-gray-400 text-sm">{{ error }}</p>
            <button
              @click="initializeLiveVideo"
              class="mt-4 px-4 py-2 bg-een-accent text-white rounded-lg hover:bg-een-accent-dark transition-colors text-sm"
            >
              Retry
            </button>
          </div>
        </div>

        <!-- Video Element - ALWAYS rendered in DOM, visibility controlled by CSS -->
        <div
          class="video-wrapper w-full h-full"
          :class="{ 'video-hidden': loading || error }"
        >
          <video
            ref="videoRef"
            :alt="camera.name"
            class="w-full h-full object-contain"
            autoplay
            muted
            playsinline
          />
        </div>

        <!-- Live Badge -->
        <div
          v-if="isStreaming && !loading && !error"
          class="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg z-20"
        >
          <span class="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span class="text-white text-xs font-medium">LIVE HD</span>
        </div>
      </template>

      <!-- RECORDED/HLS MODE -->
      <template v-else>
        <!-- Loading Overlay for HLS -->
        <div
          v-if="hlsPlayer.loadingVideo.value"
          class="absolute inset-0 flex items-center justify-center bg-gray-800 z-10"
        >
          <div class="text-center">
            <svg
              class="w-12 h-12 mx-auto text-gray-500 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                class="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                stroke-width="4"
              />
              <path
                class="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p class="mt-3 text-gray-400 text-sm">Loading recorded video...</p>
          </div>
        </div>

        <!-- Error Overlay for HLS -->
        <div
          v-if="hlsPlayer.videoError.value && !hlsPlayer.loadingVideo.value"
          class="absolute inset-0 flex items-center justify-center bg-gray-800 z-10"
        >
          <div class="text-center">
            <svg
              class="w-16 h-16 mx-auto text-gray-500 mb-3"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <p class="text-gray-400 text-sm">{{ hlsPlayer.videoError.value }}</p>
          </div>
        </div>

        <!-- HLS Video Element -->
        <div
          class="video-wrapper w-full h-full relative"
          :class="{ 'video-hidden': hlsPlayer.loadingVideo.value || hlsPlayer.videoError.value }"
        >
          <video
            :ref="(el) => hlsPlayer.videoRef.value = el as HTMLVideoElement | null"
            :alt="camera.name"
            class="w-full h-full object-contain"
            controls
            autoplay
            muted
            playsinline
          />
          <!-- Bounding Box Overlay (shown when video is within event time range) -->
          <BoundingBoxOverlay
            v-if="isWithinEventTimeRange && playbackBoundingBoxes && playbackBoundingBoxes.length > 0"
            :boxes="playbackBoundingBoxes"
            :showLabels="true"
            :thin="true"
            :isDark="isDark"
            :videoElement="hlsPlayer.videoRef.value"
          />
        </div>

        <!-- Recorded Badge -->
        <div
          v-if="hlsPlayer.videoUrl.value && !hlsPlayer.loadingVideo.value && !hlsPlayer.videoError.value"
          class="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 bg-black/60 rounded-lg z-20"
        >
          <span class="w-2 h-2 bg-green-500 rounded-full" />
          <span class="text-white text-xs font-medium">RECORDED</span>
        </div>
      </template>
    </div>

    <!-- Camera Info Panel -->
    <div
      class="w-80 flex-shrink-0 rounded-lg p-4 overflow-y-auto border"
      :class="isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'"
    >
      <div class="flex items-center justify-between mb-4">
        <h3 :class="isDark ? 'text-white' : 'text-gray-800'" class="font-semibold text-lg">Camera Information</h3>
        <button
          @click="fetchCameraDetails"
          class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border transition-colors focus:outline-none"
          :class="isDark ? 'border-teal-400 text-teal-400 hover:bg-teal-400 hover:text-gray-900' : 'border-teal-600 text-teal-600 hover:bg-teal-600 hover:text-white'"
          title="View full camera data"
        >
          i
        </button>
      </div>

      <div class="space-y-4">
        <!-- Camera Name -->
        <div class="flex items-center justify-between gap-2">
          <p :class="isDark ? 'text-white' : 'text-gray-800'" class="text-sm font-medium">{{ camera.name }}</p>
          <a
            v-if="googleMapsUrl"
            :href="googleMapsUrl"
            target="_blank"
            rel="noopener noreferrer"
            class="flex-shrink-0 transition-colors"
            :class="isDark ? 'text-red-400 hover:text-red-300' : 'text-red-500 hover:text-red-600'"
            :title="googleMapsTooltip"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </a>
        </div>

        <!-- Status -->
        <div class="flex items-center gap-2">
          <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide">Status:</label>
          <span
            class="w-2 h-2 rounded-full"
            :class="statusClass"
          />
          <span :class="isDark ? 'text-white' : 'text-gray-800'" class="text-sm capitalize">{{ statusString || 'Unknown' }}</span>
        </div>

        <!-- Camera ID -->
        <div class="flex items-baseline gap-2">
          <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide whitespace-nowrap">Camera ID:</label>
          <p :class="isDark ? 'text-white' : 'text-gray-800'" class="font-mono text-xs break-all">{{ camera.id }}</p>
        </div>

        <!-- Bridge ID (if available) -->
        <div v-if="camera.bridgeId" class="flex items-baseline gap-2">
          <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide whitespace-nowrap">Bridge ID:</label>
          <p :class="isDark ? 'text-white' : 'text-gray-800'" class="font-mono text-xs break-all">{{ camera.bridgeId }}</p>
        </div>

        <!-- PTZ Controls (shown for PTZ-capable cameras in live mode while streaming) -->
        <div v-if="isPtzCapable && isLiveMode && isStreaming">
          <div class="flex items-center justify-center gap-6">
            <!-- D-pad -->
            <div class="flex flex-col items-center">
              <button
                :disabled="ptzLoading"
                @click="handlePtzMove(['up'])"
                :class="[isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700', ptzLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer']"
                class="w-9 h-9 m-0.5 rounded-md flex items-center justify-center text-sm font-bold transition-colors"
                title="Pan Up"
              >&#9650;</button>
              <div class="flex items-center">
                <button
                  :disabled="ptzLoading"
                  @click="handlePtzMove(['left'])"
                  :class="[isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700', ptzLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer']"
                  class="w-9 h-9 m-0.5 rounded-md flex items-center justify-center text-sm font-bold transition-colors"
                  title="Pan Left"
                >&#9664;</button>
                <button
                  v-if="ptzHomePreset"
                  :disabled="ptzLoading"
                  @click="handlePtzHome"
                  :class="[isAtHome ? 'bg-green-600 hover:bg-green-500 text-white' : 'bg-red-600 hover:bg-red-500 text-white', ptzLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer']"
                  class="w-9 h-9 m-0.5 rounded-md flex items-center justify-center transition-colors"
                  :title="isAtHome ? 'At home position' : 'Move to home position'"
                ><svg class="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"/></svg></button>
                <div v-else class="w-9 h-9 m-0.5"></div>
                <button
                  :disabled="ptzLoading"
                  @click="handlePtzMove(['right'])"
                  :class="[isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700', ptzLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer']"
                  class="w-9 h-9 m-0.5 rounded-md flex items-center justify-center text-sm font-bold transition-colors"
                  title="Pan Right"
                >&#9654;</button>
              </div>
              <button
                :disabled="ptzLoading"
                @click="handlePtzMove(['down'])"
                :class="[isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700', ptzLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer']"
                class="w-9 h-9 m-0.5 rounded-md flex items-center justify-center text-sm font-bold transition-colors"
                title="Pan Down"
              >&#9660;</button>
            </div>
            <!-- Zoom controls -->
            <div class="flex flex-col gap-2">
              <button
                :disabled="ptzLoading"
                @click="handlePtzMove(['in'])"
                :class="[isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700', ptzLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer']"
                class="w-9 h-9 rounded-md flex items-center justify-center text-sm font-bold transition-colors"
                title="Zoom In"
              >+</button>
              <button
                :disabled="ptzLoading"
                @click="handlePtzMove(['out'])"
                :class="[isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700', ptzLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer']"
                class="w-9 h-9 rounded-md flex items-center justify-center text-sm font-bold transition-colors"
                title="Zoom Out"
              >-</button>
            </div>
          </div>
        </div>

        <!-- PTZ Presets (shown when PTZ-capable, live, streaming, and presets exist) -->
        <div v-if="isPtzCapable && isLiveMode && isStreaming && ptzPresets.length > 0" class="flex items-start gap-2">
          <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide whitespace-nowrap pt-0.5">Presets:</label>
          <div class="flex flex-wrap gap-1">
            <button
              v-for="preset in ptzPresets"
              :key="preset.name"
              :disabled="ptzLoading"
              @click="handlePtzPreset(preset)"
              :class="[isDark ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-200 hover:bg-gray-300 text-gray-700', ptzLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer']"
              class="px-2 py-0.5 rounded text-xs transition-colors"
              :title="`Move to ${preset.name}`"
            >{{ preset.name }}</button>
          </div>
        </div>

        <!-- Event/Alert Timestamp (shown for recorded playback) -->
        <div
          v-if="!isLiveMode && formattedPlaybackTimestamp"
          class="p-3 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
          :class="isDark ? 'border-orange-500 bg-orange-900/20' : 'border-orange-400 bg-orange-50'"
          @click="handleEventCardClick"
          title="Click to play/pause"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5">
              <!-- Bell Icon for Alerts (left of label) -->
              <svg v-if="isAlertSource" class="w-4 h-4 flex-shrink-0" :class="isDark ? 'text-orange-400' : 'text-orange-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
              </svg>
              <!-- Lightning Bolt Icon for Events (left of label) -->
              <svg v-else class="w-4 h-4 flex-shrink-0" :class="isDark ? 'text-orange-400' : 'text-orange-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide cursor-pointer">{{ playbackEventType || 'Event Time' }}</label>
            </div>
            <!-- Play/Pause Icon -->
            <div class="flex-shrink-0">
              <!-- Pause Icon (shown when playing) -->
              <svg v-if="isHlsPlaying" class="w-5 h-5" :class="isDark ? 'text-orange-400' : 'text-orange-600'" fill="currentColor" viewBox="0 0 24 24">
                <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
              </svg>
              <!-- Play Icon (shown when paused) -->
              <svg v-else class="w-5 h-5" :class="isDark ? 'text-orange-400' : 'text-orange-600'" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
            </div>
          </div>
          <div class="flex items-center justify-between mt-1">
            <p :class="isDark ? 'text-orange-400' : 'text-orange-600'" class="text-sm font-medium">{{ formattedPlaybackTimestamp }}</p>
            <div class="flex items-center gap-1.5">
              <!-- Info Icon -->
              <button
                v-if="playbackEventObject"
                @click.stop="showEventDataModal = true"
                class="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold border transition-colors focus:outline-none"
                :class="isDark ? 'border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-gray-900' : 'border-orange-600 text-orange-600 hover:bg-orange-600 hover:text-white'"
                :title="isAlertSource ? 'View alert data' : 'View event data'"
              >
                i
              </button>
              <!-- Download Icon -->
              <button
                v-if="playbackEventObject"
                @click="handleDownloadClick"
                :disabled="exportIsActive"
                class="w-5 h-5 rounded-full flex items-center justify-center border transition-colors focus:outline-none"
                :class="[
                  exportIsActive
                    ? (isDark ? 'border-gray-600 text-gray-600 cursor-not-allowed' : 'border-gray-400 text-gray-400 cursor-not-allowed')
                    : (isDark ? 'border-orange-400 text-orange-400 hover:bg-orange-400 hover:text-gray-900' : 'border-orange-600 text-orange-600 hover:bg-orange-600 hover:text-white')
                ]"
                :title="exportIsActive ? 'Export in progress' : 'Download event video'"
              >
                <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            </div>
          </div>
          <!-- Export Error Message -->
          <div v-if="exportError" class="mt-1">
            <span class="text-xs text-red-500">{{ exportError }}</span>
          </div>
          <!-- EEVA Reason (for eevaQueryEvent events) -->
          <div v-if="eevaReason" class="mt-1">
            <span :class="isDark ? 'text-orange-400/70' : 'text-orange-600/70'" class="text-xs block leading-4">{{ eevaReason }}</span>
          </div>
          <!-- Source (if available in event data) -->
          <div v-if="formattedCreatorId" class="mt-1">
            <span :class="isDark ? 'text-orange-400/70' : 'text-orange-600/70'" class="text-xs">Source: {{ formattedCreatorId }}</span>
          </div>
          <!-- Confidence (if available from objectClassification) -->
          <div v-if="formattedConfidence" class="mt-1">
            <span :class="isDark ? 'text-orange-400/70' : 'text-orange-600/70'" class="text-xs">Confidence: {{ formattedConfidence }}</span>
          </div>
          <!-- Event Duration (only for events, not alerts) -->
          <div v-if="!isAlertSource && eventDuration" class="mt-1">
            <span :class="isDark ? 'text-orange-400/70' : 'text-orange-600/70'" class="text-xs">Duration: {{ eventDuration }}</span>
          </div>
        </div>

        <!-- MAC Address (if available) -->
        <div v-if="camera.macAddress">
          <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide">MAC Address</label>
          <p :class="isDark ? 'text-white' : 'text-gray-800'" class="text-sm mt-1 font-mono">{{ camera.macAddress }}</p>
        </div>

        <!-- IP Address (if available) -->
        <div v-if="camera.ipAddress">
          <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide">IP Address</label>
          <p :class="isDark ? 'text-white' : 'text-gray-800'" class="text-sm mt-1 font-mono">{{ camera.ipAddress }}</p>
        </div>

        <!-- Timezone (if available) -->
        <div v-if="camera.timezone">
          <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide">Timezone</label>
          <p :class="isDark ? 'text-white' : 'text-gray-800'" class="text-sm mt-1">{{ camera.timezone }}</p>
        </div>

        <!-- GUID (if available) -->
        <div v-if="camera.guid">
          <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide">GUID</label>
          <p :class="isDark ? 'text-white' : 'text-gray-800'" class="text-sm mt-1 font-mono text-xs break-all">{{ camera.guid }}</p>
        </div>
      </div>
    </div>

    <!-- Event/Alert Data Modal -->
    <Teleport to="body">
      <div
        v-if="showEventDataModal && playbackEventObject"
        class="fixed inset-0 z-50 flex items-center justify-center"
        @click.self="showEventDataModal = false"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="showEventDataModal = false" />

        <!-- Modal -->
        <div
          class="relative rounded-lg shadow-xl max-h-[80vh] flex flex-col"
          :class="isDark ? 'bg-gray-800' : 'bg-white'"
          style="width: 80%"
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
            <h3 class="text-lg font-semibold" :class="isDark ? 'text-white' : 'text-gray-800'">{{ currentDataType }} Data</h3>
            <div class="flex items-center gap-2">
              <!-- Copy Button -->
              <button
                @click="copyDataToClipboard"
                class="p-1 rounded transition-colors"
                :class="[
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  copiedToClipboard ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600')
                ]"
                :title="copiedToClipboard ? 'Copied!' : 'Copy to clipboard'"
              >
                <!-- Checkmark icon when copied -->
                <svg v-if="copiedToClipboard" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <!-- Copy icon -->
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <!-- Close Button -->
              <button
                @click="showEventDataModal = false"
                class="p-1 rounded transition-colors"
                :class="[
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600'
                ]"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Data Schemas (for events only) -->
          <div v-if="eventDataSchemas.length > 0" class="px-4 pt-3 pb-1">
            <div class="text-xs mb-1" :class="isDark ? 'text-gray-400' : 'text-gray-500'">Available Data Schemas for <span class="font-bold" :class="isDark ? 'text-gray-200' : 'text-gray-700'">{{ playbackEventType }}</span> Event:</div>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="schema in eventDataSchemas"
                :key="schema"
                class="px-2 py-0.5 text-xs rounded-full font-mono"
                :class="isDark ? 'bg-blue-900/50 text-blue-300' : 'bg-blue-100 text-blue-700'"
              >{{ schema }}</span>
            </div>
          </div>

          <!-- Include values (for alerts only) -->
          <div v-if="alertIncludeValues.length > 0" class="px-4 pt-3 pb-1">
            <div class="text-xs mb-1" :class="isDark ? 'text-gray-400' : 'text-gray-500'">Include Parameter for <span class="font-bold" :class="isDark ? 'text-gray-200' : 'text-gray-700'">{{ playbackEventType }}</span> Alert:</div>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="value in alertIncludeValues"
                :key="value"
                class="px-2 py-0.5 text-xs rounded-full font-mono"
                :class="isDark ? 'bg-amber-900/50 text-amber-300' : 'bg-amber-100 text-amber-700'"
              >{{ value }}</span>
            </div>
          </div>

          <!-- Content -->
          <div class="p-4 overflow-auto flex-1">
            <pre
              class="text-xs font-mono p-4 rounded overflow-auto"
              :class="isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-100 text-gray-800'"
            >{{ JSON.stringify(playbackEventObject, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Camera Data Modal -->
    <Teleport to="body">
      <div
        v-if="showCameraDataModal"
        class="fixed inset-0 z-50 flex items-center justify-center"
        @click.self="showCameraDataModal = false"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="showCameraDataModal = false" />

        <!-- Modal -->
        <div
          class="relative rounded-lg shadow-xl max-h-[80vh] flex flex-col"
          :class="isDark ? 'bg-gray-800' : 'bg-white'"
          style="width: 80%"
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
            <h3 class="text-lg font-semibold" :class="isDark ? 'text-white' : 'text-gray-800'">{{ cameraModalTitle }}</h3>
            <div class="flex items-center gap-2">
              <!-- View buttons -->
              <div class="flex items-center gap-1">
                <button
                  @click="switchCameraModalView('details')"
                  :disabled="activeCameraModalLoading"
                  class="px-3 py-1 text-xs font-medium rounded transition-colors focus:outline-none"
                  :class="cameraModalView === 'details'
                    ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white')
                    : (isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300')"
                >Details</button>
                <button
                  @click="switchCameraModalView('settings')"
                  :disabled="activeCameraModalLoading"
                  class="px-3 py-1 text-xs font-medium rounded transition-colors focus:outline-none"
                  :class="cameraModalView === 'settings'
                    ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white')
                    : (isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300')"
                >Settings</button>
                <button
                  @click="switchCameraModalView('bridge')"
                  :disabled="activeCameraModalLoading"
                  class="px-3 py-1 text-xs font-medium rounded transition-colors focus:outline-none"
                  :class="cameraModalView === 'bridge'
                    ? (isDark ? 'bg-blue-600 text-white' : 'bg-blue-600 text-white')
                    : (isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300')"
                >Bridge</button>
              </div>
              <!-- Copy Button -->
              <button
                @click="copyCameraDataToClipboard"
                :disabled="activeCameraModalLoading"
                class="p-1 rounded transition-colors"
                :class="[
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  cameraDataCopied ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600')
                ]"
                :title="cameraDataCopied ? 'Copied!' : 'Copy to clipboard'"
              >
                <!-- Checkmark icon when copied -->
                <svg v-if="cameraDataCopied" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <!-- Copy icon -->
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <!-- Close Button -->
              <button
                @click="showCameraDataModal = false"
                class="p-1 rounded transition-colors"
                :class="[
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600'
                ]"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Include parameter values -->
          <div class="px-4 pt-3 pb-1">
            <div class="text-xs mb-1" :class="isDark ? 'text-gray-400' : 'text-gray-500'">Include Parameters:</div>
            <div class="flex flex-wrap gap-1">
              <span
                v-for="value in activeCameraModalIncludeValues"
                :key="value"
                class="px-2 py-0.5 text-xs rounded-full font-mono"
                :class="isDark ? 'bg-teal-900/50 text-teal-300' : 'bg-teal-100 text-teal-700'"
              >{{ value }}</span>
            </div>
          </div>

          <!-- Content -->
          <div class="p-4 overflow-auto flex-1">
            <!-- Loading state -->
            <div v-if="activeCameraModalLoading" class="flex items-center justify-center py-12">
              <div class="flex items-center gap-3">
                <svg class="animate-spin w-5 h-5" :class="isDark ? 'text-teal-400' : 'text-teal-600'" fill="none" viewBox="0 0 24 24">
                  <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
                  <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span class="text-sm" :class="isDark ? 'text-gray-400' : 'text-gray-500'">Loading camera {{ cameraModalView }}...</span>
              </div>
            </div>
            <!-- JSON response -->
            <pre
              v-else-if="activeCameraModalData"
              class="text-xs font-mono p-4 rounded overflow-auto"
              :class="isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-100 text-gray-800'"
            >{{ JSON.stringify(activeCameraModalData, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

<style scoped>
.main-video-player {
  min-height: 0;
}

/* CRITICAL: Use visibility/position to hide video, NOT v-if
   This ensures the video element is always in the DOM for the SDK */
.video-wrapper.video-hidden {
  visibility: hidden;
  position: absolute;
  pointer-events: none;
}
</style>
