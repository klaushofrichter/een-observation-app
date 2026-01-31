<script setup lang="ts">
import { ref, onMounted, computed, inject, watch } from 'vue'
import type { Ref } from 'vue'
import { getCurrentUser } from 'een-api-toolkit'
import type { Camera } from 'een-api-toolkit'
import { useRouter, useRoute } from 'vue-router'
import CameraSidebar from '../components/CameraSidebar.vue'
import MainVideoPlayer from '../components/MainVideoPlayer.vue'
import EventTypesPanel from '../components/EventTypesPanel.vue'
import HistoricEventsPanel from '../components/HistoricEventsPanel.vue'
import LiveEventsPanel from '../components/LiveEventsPanel.vue'
import type { BoundingBox } from '@/composables/useBoundingBoxes'

// Inject dark mode state
const isDark = inject<Ref<boolean>>('isDark', ref(false))

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

// Get initial camera ID from URL query parameter
const initialCameraId = computed(() => {
  const id = route.query.id
  return typeof id === 'string' ? id : null
})

// Selected camera state
const selectedCamera = ref<Camera | null>(null)

// Update URL when camera selection changes
watch(selectedCamera, (camera) => {
  const newQuery = camera ? { id: camera.id } : {}
  // Only update if different to avoid unnecessary history entries
  if (route.query.id !== newQuery.id) {
    router.replace({ query: newQuery })
  }
})

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
const historicEventsPanelRef = ref<InstanceType<typeof HistoricEventsPanel> | null>(null)
const liveEventsPanelRef = ref<InstanceType<typeof LiveEventsPanel> | null>(null)

// Handle event type selection changes
function handleEventTypesUpdate(types: string[]) {
  selectedEventTypes.value = types
}

// Handle SSE event from LiveEventsPanel - insert into HistoricEventsPanel
function handleSseEvent(event: Record<string, unknown>) {
  historicEventsPanelRef.value?.insertEvent(event as unknown as Parameters<typeof historicEventsPanelRef.value.insertEvent>[0])
}

// Computed events list from HistoricEventsPanel (for MainVideoPlayer to check before API calls)
const eventsList = computed(() => historicEventsPanelRef.value?.events || [])

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
        :is-live-playback="playbackMode === 'live'"
        @select-camera="handleCameraSelect"
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
                @update:selected-types="handleEventTypesUpdate"
              />
            </div>

            <!-- Historic Events Panel -->
            <div class="flex-1 border-r p-3" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
              <HistoricEventsPanel
                ref="historicEventsPanelRef"
                :camera="selectedCamera"
                :selected-types="selectedEventTypes"
                :is-dark="isDark"
                :active-event-id="playbackEventId"
                :live-feed-button-label="liveEventsPanelRef?.feedButtonLabel"
                :live-feed-button-class="liveEventsPanelRef?.feedButtonClass"
                :live-feed-can-toggle="liveEventsPanelRef?.canConnect || liveEventsPanelRef?.isConnected || liveEventsPanelRef?.isConnecting"
                @event-clicked="handleEventClick"
                @toggle-live-feed="liveEventsPanelRef?.toggleLiveFeed()"
              />
            </div>

            <!-- Live SSE Events Panel (Alerts) -->
            <div class="flex-1 p-3">
              <LiveEventsPanel
                ref="liveEventsPanelRef"
                :camera="selectedCamera"
                :selected-types="selectedEventTypes"
                :is-dark="isDark"
                :active-alert-id="activeAlertId"
                @alert-clicked="handleAlertClick"
                @sse-event="handleSseEvent"
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
