<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed, inject, watch } from 'vue'
import type { Ref } from 'vue'
import { getCurrentUser } from 'een-api-toolkit'
import type { Camera } from 'een-api-toolkit'
import { useRouter, useRoute } from 'vue-router'
import CameraSidebar from '../components/CameraSidebar.vue'
import MainVideoPlayer from '../components/MainVideoPlayer.vue'
import EventTypesPanel from '../components/EventTypesPanel.vue'
import EventsPanel from '../components/EventsPanel.vue'
import AlertsPanel from '../components/AlertsPanel.vue'
import type { BoundingBox } from '@/composables/useBoundingBoxes'
import { eventTypesToHashString } from '@/utils/eventTypeHash'

// Inject dark mode and mute state
const isDark = inject<Ref<boolean>>('isDark', ref(false))
const isMuted = inject<Ref<boolean>>('isMuted', ref(false))

interface UserProfile {
  id: string
  email: string
  firstName?: string
  lastName?: string
  timeZone?: string
}

interface EenError {
  code: string
  message: string
}

const router = useRouter()
const route = useRoute()
const user = ref<UserProfile | null>(null)
const loading = ref(true)
const error = ref<EenError | null>(null)

// Parse and deduplicate comma-separated IDs
function parseAndDedupeIds(idString: string): string[] {
  const ids = idString.split(',').map(id => id.trim()).filter(id => id.length > 0)
  return [...new Set(ids)]
}

// Get initial camera ID from sessionStorage (set by router guard)
const initialCameraId = computed(() => {
  // First try sessionStorage (set by router guard before navigation)
  const stored = sessionStorage.getItem('een_url_camera_ids')
  if (stored) {
    // Return deduplicated IDs as comma-separated string
    return parseAndDedupeIds(stored).join(',')
  }

  // Fallback to route.query
  const id = route.query.id
  if (typeof id === 'string') {
    return parseAndDedupeIds(id).join(',')
  }
  return null
})

// Get initial selected camera from sessionStorage
// Only valid if the selected ID is part of the id list
const initialSelectedCameraId = computed(() => {
  // First try sessionStorage
  let selected = sessionStorage.getItem('een_url_selected')
  if (!selected) {
    const querySelected = route.query.selected
    selected = typeof querySelected === 'string' ? querySelected : null
  }
  if (!selected) return null

  // Validate that selected is part of the id list
  const idParam = initialCameraId.value
  if (!idParam) return null

  const idList = parseAndDedupeIds(idParam)
  return idList.includes(selected) ? selected : null
})

// Get initial event type hashes from sessionStorage (set by router guard)
// This is more reliable than route.query which may not be ready on initial render
const initialEventHashes = computed(() => {
  // First try sessionStorage (set by router guard before navigation)
  const stored = sessionStorage.getItem('een_url_events')
  if (stored) return stored

  // Fallback to route.query
  const events = route.query.events
  return typeof events === 'string' ? events : null
})

// Duration URL values mapping
const DURATION_URL_TO_MINUTES: Record<string, number> = {
  '10m': 10,
  '1h': 60,
  '24h': 1440,
  '1w': 10080
}

const DURATION_MINUTES_TO_URL: Record<number, string> = {
  10: '10m',
  60: '1h',
  1440: '24h',
  10080: '1w'
}

// Parse duration URL value to minutes (returns null if invalid)
function parseDurationUrl(value: string | null): number | null {
  if (!value) return null
  const minutes = DURATION_URL_TO_MINUTES[value]
  return minutes !== undefined ? minutes : null
}

// Convert minutes to URL value
function durationToUrl(minutes: number): string | null {
  return DURATION_MINUTES_TO_URL[minutes] || null
}

// Get initial events duration from sessionStorage
const initialEventsDuration = computed(() => {
  const stored = sessionStorage.getItem('een_url_ed')
  if (stored) return parseDurationUrl(stored)

  const ed = route.query.ed
  return typeof ed === 'string' ? parseDurationUrl(ed) : null
})

// Get initial alerts duration from sessionStorage
const initialAlertsDuration = computed(() => {
  const stored = sessionStorage.getItem('een_url_ad')
  if (stored) return parseDurationUrl(stored)

  const ad = route.query.ad
  return typeof ad === 'string' ? parseDurationUrl(ad) : null
})

// Get initial events auto-refresh from sessionStorage (1 = enabled)
const initialEventsAutoRefresh = computed(() => {
  const stored = sessionStorage.getItem('een_url_er')
  if (stored) return stored === '1'

  const er = route.query.er
  return er === '1'
})

// Get initial alerts auto-refresh from sessionStorage (1 = enabled)
const initialAlertsAutoRefresh = computed(() => {
  const stored = sessionStorage.getItem('een_url_ar')
  if (stored) return stored === '1'

  const ar = route.query.ar
  return ar === '1'
})

// Get initial live events toggle from sessionStorage (1 = enabled)
const initialLiveFeed = computed(() => {
  const stored = sessionStorage.getItem('een_url_live')
  if (stored) return stored === '1'

  const live = route.query.live
  return live === '1'
})

// Get initial event filter for alerts from sessionStorage (1 = enabled)
const initialEventFilter = computed(() => {
  const stored = sessionStorage.getItem('een_url_filter')
  if (stored) return stored === '1'

  const filter = route.query.filter
  return filter === '1'
})

// Track fullscreen state for URL sync
const isFullscreen = ref(!!document.fullscreenElement)

// Selected camera state
const selectedCamera = ref<Camera | null>(null)

// Visible cameras state (for URL sync)
const visibleCameraIds = ref<string[]>([])

// Current event hashes for URL (updated when event selection changes)
const currentEventHashes = ref<string>('')

// Current duration values for URL (updated when duration selection changes)
const currentEventsDuration = ref<number>(60) // Default: 1h
const currentAlertsDuration = ref<number>(60) // Default: 1h

// Current auto-refresh values for URL (updated when checkbox changes)
const currentEventsAutoRefresh = ref<boolean>(false)
const currentAlertsAutoRefresh = ref<boolean>(false)

// Current live feed and event filter values for URL
const currentLiveFeed = ref<boolean>(initialLiveFeed.value)
const currentEventFilter = ref<boolean>(initialEventFilter.value)

// Update URL with visible cameras, selected camera, event types, and durations
function updateUrl() {
  const newQuery: Record<string, string> = {}

  if (visibleCameraIds.value.length > 0) {
    newQuery.id = visibleCameraIds.value.join(',')
  }

  if (selectedCamera.value) {
    newQuery.selected = selectedCamera.value.id
  }

  if (currentEventHashes.value) {
    newQuery.events = currentEventHashes.value
  }

  // Add duration parameters (only if not default value of 1h)
  const edUrl = durationToUrl(currentEventsDuration.value)
  if (edUrl && edUrl !== '1h') {
    newQuery.ed = edUrl
  }

  const adUrl = durationToUrl(currentAlertsDuration.value)
  if (adUrl && adUrl !== '1h') {
    newQuery.ad = adUrl
  }

  // Add auto-refresh parameters (only if enabled)
  if (currentEventsAutoRefresh.value) {
    newQuery.er = '1'
  }

  if (currentAlertsAutoRefresh.value) {
    newQuery.ar = '1'
  }

  // Add live feed parameter (only if enabled)
  if (currentLiveFeed.value) {
    newQuery.live = '1'
  }

  // Add event filter parameter (only if enabled)
  if (currentEventFilter.value) {
    newQuery.filter = '1'
  }

  // Add dark mode parameter (only if different from default)
  if (isDark.value) {
    newQuery.dark = '1'
  }

  // Add mute parameter (only if muted)
  if (isMuted.value) {
    newQuery.mute = '1'
  }

  // Add fullscreen parameter (only if enabled)
  if (isFullscreen.value) {
    newQuery.full = '1'
  }

  // Only update if different to avoid unnecessary history entries
  const currentId = route.query.id as string | undefined
  const currentSelected = route.query.selected as string | undefined
  const currentEvents = route.query.events as string | undefined
  const currentEd = route.query.ed as string | undefined
  const currentAd = route.query.ad as string | undefined
  const currentEr = route.query.er as string | undefined
  const currentAr = route.query.ar as string | undefined
  const currentLive = route.query.live as string | undefined
  const currentFilter = route.query.filter as string | undefined
  const currentDark = route.query.dark as string | undefined
  const currentMute = route.query.mute as string | undefined
  const currentFull = route.query.full as string | undefined
  if (currentId !== newQuery.id || currentSelected !== newQuery.selected || currentEvents !== newQuery.events || currentEd !== newQuery.ed || currentAd !== newQuery.ad || currentEr !== newQuery.er || currentAr !== newQuery.ar || currentLive !== newQuery.live || currentFilter !== newQuery.filter || currentDark !== newQuery.dark || currentMute !== newQuery.mute || currentFull !== newQuery.full) {
    router.replace({ query: newQuery })
  }
}

// Update URL when visible cameras change
function handleVisibleCamerasChanged(cameraIds: string[]) {
  visibleCameraIds.value = cameraIds
  updateUrl()
}

// Playback state - when an event is clicked, switch from live to recorded playback
const playbackMode = ref<'live' | 'recorded'>('live')
const playbackTimestamp = ref<string | null>(null)
const playbackEventType = ref<string | null>(null)
const playbackEventId = ref<string | null>(null)
const playbackBoundingBoxes = ref<BoundingBox[]>([])
const playbackEventObject = ref<Record<string, unknown> | null>(null)

// Active alert state
const activeAlertId = ref<string | null>(null)

// Track if current playback source is an alert (to show bell icon)
const isAlertSource = ref(false)

// Computed selected camera ID for sidebar
const selectedCameraId = computed(() => selectedCamera.value?.id || null)

// Handle camera selection from sidebar - reset to live mode
function handleCameraSelect(camera: Camera) {
  selectedCamera.value = camera
  // Reset to live mode when a camera is selected
  playbackMode.value = 'live'
  playbackTimestamp.value = null
  playbackEventType.value = null
  playbackEventId.value = null
  playbackBoundingBoxes.value = []
  playbackEventObject.value = null
  activeAlertId.value = null
  isAlertSource.value = false
  // Update URL with selected camera
  updateUrl()
}

// Handle event click - switch to recorded playback
function handleEventClick(event: { cameraId: string; timestamp: string; eventType: string; eventId: string; boundingBoxes: BoundingBox[]; eventObject: Record<string, unknown> }) {
  playbackMode.value = 'recorded'
  playbackTimestamp.value = event.timestamp
  playbackEventType.value = event.eventType
  playbackEventId.value = event.eventId
  playbackBoundingBoxes.value = event.boundingBoxes
  playbackEventObject.value = event.eventObject
  // Clear active alert when an event is selected
  activeAlertId.value = null
  isAlertSource.value = false
}

// Handle alert click - switch to recorded playback using alert timestamp
function handleAlertClick(alert: { alertId: string; alertObject: Record<string, unknown> }) {
  activeAlertId.value = alert.alertId
  isAlertSource.value = true

  // Extract alert type name
  const alertType = alert.alertObject.alertType as string | undefined
  const alertTypeName = alertType ? getAlertTypeName(alertType) : 'Alert'

  // Extract alert timestamp
  const alertTimestamp = alert.alertObject.timestamp as string | null

  // Switch to recorded playback mode using alert timestamp
  playbackMode.value = 'recorded'
  playbackTimestamp.value = alertTimestamp
  playbackEventType.value = alertTypeName
  playbackEventId.value = null // Clear event ID since this is an alert
  playbackBoundingBoxes.value = [] // Alerts don't have bounding boxes
  playbackEventObject.value = alert.alertObject
}

// Get human-readable alert type name
function getAlertTypeName(type: string): string {
  const match = type.match(/een\.(\w+)Alert\.v\d+/)
  if (match) {
    return match[1]
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
  }
  return type
}

// Selected event types state (shared between panels)
const selectedEventTypes = ref<string[]>([])

// References for cross-panel communication
const eventsPanelRef = ref<InstanceType<typeof EventsPanel> | null>(null)

// Handle event type selection changes
function handleEventTypesUpdate(types: string[]) {
  selectedEventTypes.value = types
  // Update URL with event type hashes
  currentEventHashes.value = eventTypesToHashString(types)
  updateUrl()
}

// Handle events duration change
function handleEventsDurationChange(duration: number) {
  currentEventsDuration.value = duration
  updateUrl()
}

// Handle alerts duration change
function handleAlertsDurationChange(duration: number) {
  currentAlertsDuration.value = duration
  updateUrl()
}

// Handle events auto-refresh change
function handleEventsAutoRefreshChange(enabled: boolean) {
  currentEventsAutoRefresh.value = enabled
  updateUrl()
}

// Handle alerts auto-refresh change
function handleAlertsAutoRefreshChange(enabled: boolean) {
  currentAlertsAutoRefresh.value = enabled
  updateUrl()
}

// Handle live feed change
function handleLiveFeedChange(enabled: boolean) {
  currentLiveFeed.value = enabled
  updateUrl()
}

// Handle event filter change
function handleEventFilterChange(enabled: boolean) {
  currentEventFilter.value = enabled
  updateUrl()
}

// Computed events list from EventsPanel (for MainVideoPlayer to check before API calls)
const eventsList = computed(() => eventsPanelRef.value?.events || [])

// Sync fullscreen state from document to URL
function handleFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
  updateUrl()
}

onMounted(async () => {
  const result = await getCurrentUser()

  if (result.error) {
    if (result.error.code === 'AUTH_REQUIRED') {
      router.push('/login')
      return
    }
    error.value = result.error
  } else {
    user.value = result.data
  }

  loading.value = false

  // Track fullscreen changes for URL sync
  document.addEventListener('fullscreenchange', handleFullscreenChange)
  // Sync initial state in case App.vue already entered fullscreen
  isFullscreen.value = !!document.fullscreenElement
})

onUnmounted(() => {
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})

// Watch for dark mode and mute changes and update URL
watch(isDark, () => {
  updateUrl()
})

watch(isMuted, () => {
  updateUrl()
})
</script>

<template>
  <div class="home-view h-[calc(100vh-48px)]">
    <!-- Loading State -->
    <div v-if="loading" class="flex items-center justify-center h-full">
      <div class="text-gray-600">Loading...</div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="p-6">
      <div class="bg-red-50 border border-red-200 rounded-lg p-6">
        <p class="text-red-600">Error: {{ error.message }}</p>
      </div>
    </div>

    <!-- Main Application Layout -->
    <div v-else-if="user" class="flex h-full">
      <!-- Camera Sidebar -->
      <CameraSidebar
        :selected-camera-id="selectedCameraId"
        :initial-camera-id="initialCameraId"
        :initial-selected-camera-id="initialSelectedCameraId"
        :is-live-playback="playbackMode === 'live'"
        @select-camera="handleCameraSelect"
        @visible-cameras-changed="handleVisibleCamerasChanged"
      />

      <!-- Main Content Area -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- Video Section (Top) -->
        <div class="flex-1 min-h-0 p-4" :class="isDark ? 'bg-gray-800' : 'bg-gray-100'">
          <div v-if="selectedCamera" class="h-full">
            <MainVideoPlayer
              :camera="selectedCamera"
              :playback-mode="playbackMode"
              :playback-timestamp="playbackTimestamp"
              :playback-event-type="playbackEventType"
              :playback-bounding-boxes="playbackBoundingBoxes"
              :playback-event-object="playbackEventObject"
              :is-alert-source="isAlertSource"
              :is-dark="isDark"
              :events-list="eventsList"
            />
          </div>

          <!-- No Camera Selected -->
          <div v-else class="h-full flex items-center justify-center">
            <div class="text-center" :class="isDark ? 'text-gray-400' : 'text-gray-500'">
              <svg
                class="w-16 h-16 mx-auto mb-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                />
              </svg>
              <p class="text-sm">Select a camera from the sidebar</p>
            </div>
          </div>
        </div>

        <!-- Events Section (Bottom) -->
        <div class="h-64 border-t" :class="isDark ? 'border-gray-700 bg-gray-800' : 'border-gray-200 bg-white'">
          <div class="h-full flex">
            <!-- Event Types Panel -->
            <div class="w-48 border-r p-3" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
              <EventTypesPanel
                :camera="selectedCamera"
                :is-dark="isDark"
                :initial-event-hashes="initialEventHashes"
                @update:selected-types="handleEventTypesUpdate"
              />
            </div>

            <!-- Events Panel -->
            <div class="flex-1 min-w-0 border-r p-3" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
              <EventsPanel
                ref="eventsPanelRef"
                :camera="selectedCamera"
                :selected-types="selectedEventTypes"
                :is-dark="isDark"
                :active-event-id="playbackEventId"
                :initial-duration="initialEventsDuration"
                :initial-auto-refresh="initialEventsAutoRefresh"
                :initial-live-feed="initialLiveFeed"
                @event-clicked="handleEventClick"
                @duration-changed="handleEventsDurationChange"
                @auto-refresh-changed="handleEventsAutoRefreshChange"
                @live-feed-changed="handleLiveFeedChange"
              />
            </div>

            <!-- Alerts Panel -->
            <div class="flex-1 min-w-0 p-3">
              <AlertsPanel
                :camera="selectedCamera"
                :selected-types="selectedEventTypes"
                :is-dark="isDark"
                :active-alert-id="activeAlertId"
                :initial-duration="initialAlertsDuration"
                :initial-auto-refresh="initialAlertsAutoRefresh"
                :initial-event-filter="initialEventFilter"
                @alert-clicked="handleAlertClick"
                @duration-changed="handleAlertsDurationChange"
                @auto-refresh-changed="handleAlertsAutoRefreshChange"
                @event-filter-changed="handleEventFilterChange"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Ensure proper height calculation accounting for header */
.home-view {
  height: calc(100vh - 48px);
}
</style>
