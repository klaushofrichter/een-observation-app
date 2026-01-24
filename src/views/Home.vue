<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { getCurrentUser } from 'een-api-toolkit'
import type { Camera } from 'een-api-toolkit'
import { useRouter } from 'vue-router'
import CameraSidebar from '../components/CameraSidebar.vue'
import MainVideoPlayer from '../components/MainVideoPlayer.vue'
import EventTypesPanel from '../components/EventTypesPanel.vue'
import HistoricEventsPanel from '../components/HistoricEventsPanel.vue'
import LiveEventsPanel from '../components/LiveEventsPanel.vue'

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

// Computed selected camera ID for sidebar
const selectedCameraId = computed(() => selectedCamera.value?.id || null)

// Handle camera selection from sidebar
function handleCameraSelect(camera: Camera) {
  selectedCamera.value = camera
}

// Selected event types state (shared between panels)
const selectedEventTypes = ref<string[]>([])

// Handle event type selection changes
function handleEventTypesUpdate(types: string[]) {
  selectedEventTypes.value = types
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
        <div class="flex-1 min-h-0 bg-gray-900 p-4">
          <div v-if="selectedCamera" class="h-full flex flex-col">
            <!-- Camera Title -->
            <div class="flex items-center justify-between mb-3">
              <h2 class="text-lg font-semibold text-white">
                {{ selectedCamera.name }}
              </h2>
              <span class="text-sm text-gray-400">
                ID: {{ selectedCamera.id }}
              </span>
            </div>

            <!-- HD Video Player -->
            <div class="flex-1 min-h-0">
              <MainVideoPlayer :camera="selectedCamera" />
            </div>
          </div>

          <!-- No Camera Selected -->
          <div v-else class="h-full flex items-center justify-center">
            <div class="text-center text-gray-400">
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
        <div class="h-64 border-t border-gray-200 bg-white">
          <div class="h-full flex">
            <!-- Event Types Panel -->
            <div class="w-48 border-r border-gray-200 p-3">
              <EventTypesPanel
                :camera="selectedCamera"
                @update:selected-types="handleEventTypesUpdate"
              />
            </div>

            <!-- Historic Events Panel -->
            <div class="flex-1 border-r border-gray-200 p-3">
              <HistoricEventsPanel
                :camera="selectedCamera"
                :selected-types="selectedEventTypes"
              />
            </div>

            <!-- Live SSE Events Panel -->
            <div class="flex-1 p-3">
              <LiveEventsPanel
                :camera="selectedCamera"
                :selected-types="selectedEventTypes"
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
