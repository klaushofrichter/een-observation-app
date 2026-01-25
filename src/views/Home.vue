<script setup lang="ts">
import { ref, onMounted, computed, inject } from 'vue'
import type { Ref } from 'vue'
import { getCurrentUser } from 'een-api-toolkit'
import type { Camera } from 'een-api-toolkit'
import { useRouter } from 'vue-router'
import CameraSidebar from '../components/CameraSidebar.vue'
import MainVideoPlayer from '../components/MainVideoPlayer.vue'
import EventTypesPanel from '../components/EventTypesPanel.vue'
import HistoricEventsPanel from '../components/HistoricEventsPanel.vue'
import LiveEventsPanel from '../components/LiveEventsPanel.vue'

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
const user = ref<UserProfile | null>(null)
const loading = ref(true)
const error = ref<EenError | null>(null)

// Selected camera state
const selectedCamera = ref<Camera | null>(null)

// Playback state - when an event is clicked, switch from live to recorded playback
const playbackMode = ref<'live' | 'recorded'>('live')
const playbackTimestamp = ref<string | null>(null)

// Computed selected camera ID for sidebar
const selectedCameraId = computed(() => selectedCamera.value?.id || null)

// Handle camera selection from sidebar - reset to live mode
function handleCameraSelect(camera: Camera) {
  selectedCamera.value = camera
  // Reset to live mode when a camera is selected
  playbackMode.value = 'live'
  playbackTimestamp.value = null
}

// Handle event click - switch to recorded playback
function handleEventClick(event: { cameraId: string; timestamp: string }) {
  playbackMode.value = 'recorded'
  playbackTimestamp.value = event.timestamp
}

// Selected event types state (shared between panels)
const selectedEventTypes = ref<string[]>([])

// Reference to LiveEventsPanel for cross-panel communication
const liveEventsPanelRef = ref<InstanceType<typeof LiveEventsPanel> | null>(null)

// Handle event type selection changes
function handleEventTypesUpdate(types: string[]) {
  selectedEventTypes.value = types
}

// Handle historic events refresh - remove duplicates from live events
function handleHistoricEventsRefreshed(eventTimestamps: string[]) {
  liveEventsPanelRef.value?.removeEventsByTimestamps(eventTimestamps)
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
})
</script>

<template>
  <div class="home-view h-[calc(100vh-56px)]">
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
              :is-dark="isDark"
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
                :camera="selectedCamera"
                :selected-types="selectedEventTypes"
                :is-dark="isDark"
                @events-refreshed="handleHistoricEventsRefreshed"
                @event-clicked="handleEventClick"
              />
            </div>

            <!-- Live SSE Events Panel -->
            <div class="flex-1 p-3">
              <LiveEventsPanel
                ref="liveEventsPanelRef"
                :camera="selectedCamera"
                :selected-types="selectedEventTypes"
                :is-dark="isDark"
                @event-clicked="handleEventClick"
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
  height: calc(100vh - 56px);
}
</style>
