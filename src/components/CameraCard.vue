<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { listFeeds, initMediaSession, getCamera } from 'een-api-toolkit'
import type { Camera, CameraStatus, Feed } from 'een-api-toolkit'

const props = defineProps<{
  camera: Camera
  selected: boolean
  isPlaying?: boolean
  isDark?: boolean
}>()

const emit = defineEmits<{
  select: [camera: Camera]
}>()

// Multipart stream state
const previewUrl = ref<string | null>(null)
const loading = ref(true)
const error = ref<string | null>(null)
const isMounted = ref(true)

// Track if media session was initialized
const mediaSessionInitialized = ref(false)

// Retry timer for offline cameras
let retryInterval: ReturnType<typeof setInterval> | null = null

// Helper to extract status string from the union type
function getStatusString(status?: CameraStatus | { connectionStatus?: CameraStatus }): CameraStatus | undefined {
  if (!status) return undefined
  if (typeof status === 'string') return status
  return status.connectionStatus
}

// Check if camera is in a viewable state
function isCameraOnline(status?: CameraStatus | { connectionStatus?: CameraStatus }): boolean {
  const statusStr = getStatusString(status)
  return statusStr === 'online' || statusStr === 'streaming' || statusStr === 'registered'
}

// Computed status values
const statusString = computed(() => getStatusString(props.camera.status))
const isOnline = computed(() => isCameraOnline(props.camera.status))

// Status badge styling
const statusClass = computed(() => {
  const statusStr = statusString.value
  switch (statusStr) {
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
})

// Stop the retry timer for offline cameras
function stopRetryTimer() {
  if (retryInterval) {
    clearInterval(retryInterval)
    retryInterval = null
  }
}

// Start a retry timer that re-checks camera status every 60 seconds
function startRetryTimer() {
  if (retryInterval) return
  retryInterval = setInterval(async () => {
    const result = await getCamera(props.camera.id, { include: ['status'] })
    if (result.error || !result.data) return
    if (isCameraOnline(result.data.status)) {
      stopRetryTimer()
      props.camera.status = result.data.status
      initializePreview()
    }
  }, 60000)
}

// Initialize media session and fetch preview feed
async function initializePreview() {
  if (!isMounted.value) return

  loading.value = true
  error.value = null
  previewUrl.value = null

  // Check if camera is online
  if (!isOnline.value) {
    loading.value = false
    error.value = 'Camera offline - retrying every 60s'
    startRetryTimer()
    return
  }

  try {
    // Initialize media session if not already done
    if (!mediaSessionInitialized.value) {
      const sessionResult = await initMediaSession()
      if (sessionResult.error) {
        error.value = 'Media session error'
        loading.value = false
        return
      }
      mediaSessionInitialized.value = true
    }

    if (!isMounted.value) return

    // Fetch preview feed with multipartUrl
    const feedsResult = await listFeeds({
      deviceId: props.camera.id,
      type: 'preview',
      include: ['multipartUrl']
    })

    if (!isMounted.value) return

    if (feedsResult.error) {
      error.value = 'Failed to load feed'
      loading.value = false
      return
    }

    // Find a feed with multipartUrl
    const previewFeed = feedsResult.data?.results?.find((f: Feed) => f.multipartUrl)

    if (previewFeed?.multipartUrl) {
      previewUrl.value = previewFeed.multipartUrl
      stopRetryTimer()
    } else {
      error.value = 'No preview available'
    }
  } catch (e) {
    if (isMounted.value) {
      error.value = 'Connection error'
    }
  } finally {
    if (isMounted.value) {
      loading.value = false
    }
  }
}

// Handle card click
function handleClick() {
  emit('select', props.camera)
}

// Watch for camera changes
watch(() => props.camera.id, () => {
  stopRetryTimer()
  initializePreview()
})

onMounted(() => {
  initializePreview()
})

onUnmounted(() => {
  isMounted.value = false
  stopRetryTimer()
  previewUrl.value = null
})
</script>

<template>
  <div
    class="camera-card cursor-pointer rounded-lg overflow-hidden transition-all duration-200 hover:shadow-lg"
    :class="[
      isPlaying
        ? (isDark ? 'border-4 border-orange-500 shadow-lg' : 'border-4 border-orange-400 shadow-lg')
        : selected
          ? (isDark ? 'border-4 border-white shadow-lg' : 'border-4 border-gray-900 shadow-lg')
          : (isDark ? 'border-2 border-gray-600 hover:border-gray-500' : 'border-2 border-gray-200 hover:border-gray-300')
    ]"
    @click="handleClick"
    :data-camera-id="camera.id"
  >
    <!-- Preview Area -->
    <div class="relative aspect-video bg-gray-900">
      <!-- Loading State -->
      <div
        v-if="loading"
        class="absolute inset-0 flex items-center justify-center bg-gray-800"
      >
        <div class="animate-pulse text-gray-400 text-xs">Loading...</div>
      </div>

      <!-- Error/Offline State -->
      <div
        v-else-if="error || !previewUrl"
        class="absolute inset-0 flex items-center justify-center bg-gray-800"
      >
        <div class="text-center">
          <svg
            class="w-8 h-8 mx-auto text-gray-500 mb-1"
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
          <div class="text-gray-400 text-xs">{{ error || 'No preview' }}</div>
        </div>
      </div>

      <!-- Live Preview Image -->
      <img
        v-else
        :src="previewUrl"
        :alt="camera.name"
        class="w-full h-full object-cover"
        loading="lazy"
      />

      <!-- Status Badge -->
      <div
        class="absolute top-2 right-2 px-2 py-0.5 rounded-full text-white text-xs font-medium"
        :class="statusClass"
      >
        {{ statusString || 'unknown' }}
      </div>

    </div>

    <!-- Camera Info -->
    <div
      class="p-2"
      :class="[
        isPlaying
          ? (isDark ? 'bg-violet-900' : 'bg-violet-300')
          : (isDark ? 'bg-gray-700' : 'bg-white')
      ]"
    >
      <h3 class="text-sm font-medium truncate" :class="isDark ? 'text-gray-200' : 'text-gray-800'" :title="camera.name">
        {{ camera.name }}
      </h3>
    </div>
  </div>
</template>

<style scoped>
.camera-card {
  min-width: 0; /* Allow text truncation */
}
</style>
