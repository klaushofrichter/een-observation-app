<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed, nextTick } from 'vue'
import { useAuthStore } from 'een-api-toolkit'
import type { Camera, CameraStatus } from 'een-api-toolkit'
import LivePlayer from '@een/live-video-web-sdk'
import { useHlsPlayer } from '@/composables/useHlsPlayer'
import BoundingBoxOverlay from './BoundingBoxOverlay.vue'
import type { BoundingBox } from '@/composables/useBoundingBoxes'

const props = defineProps<{
  camera: Camera
  playbackMode?: 'live' | 'recorded'
  playbackTimestamp?: string | null
  playbackEventType?: string | null
  playbackBoundingBoxes?: BoundingBox[]
  isDark?: boolean
}>()

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

// HLS playback state
const isHlsPlaying = ref(true) // Assume playing initially since autoplay is enabled

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
    error.value = 'Camera is offline'
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
    // Stop HLS if playing
    hlsPlayer.resetVideo()
    // Small delay to ensure clean transition
    await new Promise(resolve => setTimeout(resolve, 100))
    if (isLiveMode.value) {
      initializeLiveVideo()
    }
  }
})

// Watch for playback mode changes
watch([() => props.playbackMode, () => props.playbackTimestamp], async ([newMode, newTimestamp], [oldMode]) => {
  if (newMode === 'recorded' && newTimestamp) {
    // Switch to HLS playback
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
  if (isLiveMode.value) {
    initializeLiveVideo()
  }
})

onUnmounted(() => {
  isMounted.value = false
  stopLivePlayer()
  hlsPlayer.destroyHls()
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
          <!-- Bounding Box Overlay (shown only when paused) -->
          <BoundingBoxOverlay
            v-if="!isHlsPlaying && playbackBoundingBoxes && playbackBoundingBoxes.length > 0"
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
      class="w-72 flex-shrink-0 rounded-lg p-4 overflow-y-auto border"
      :class="isDark ? 'bg-gray-900 border-gray-700' : 'bg-white border-gray-200'"
    >
      <h3 :class="isDark ? 'text-white' : 'text-gray-800'" class="font-semibold text-lg mb-4">Camera Information</h3>

      <div class="space-y-4">
        <!-- Camera Name -->
        <div>
          <p :class="isDark ? 'text-white' : 'text-gray-800'" class="text-sm font-medium">{{ camera.name }}</p>
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

        <!-- Event Timestamp (only shown for recorded playback) -->
        <div
          v-if="!isLiveMode && formattedPlaybackTimestamp"
          class="p-3 rounded-lg border cursor-pointer hover:opacity-80 transition-opacity"
          :class="isDark ? 'border-orange-500 bg-orange-900/20' : 'border-orange-400 bg-orange-50'"
          @click="handleEventCardClick"
          title="Click to play/pause"
        >
          <div class="flex items-center justify-between">
            <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide cursor-pointer">{{ playbackEventType || 'Event Time' }}</label>
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
          <p :class="isDark ? 'text-orange-400' : 'text-orange-600'" class="text-sm mt-1 font-medium">{{ formattedPlaybackTimestamp }}</p>
        </div>

        <!-- Location ID (if available) -->
        <div v-if="camera.locationId">
          <label :class="isDark ? 'text-gray-400' : 'text-gray-500'" class="text-xs uppercase tracking-wide">Location ID</label>
          <p :class="isDark ? 'text-white' : 'text-gray-800'" class="text-sm mt-1 font-mono text-xs break-all">{{ camera.locationId }}</p>
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
