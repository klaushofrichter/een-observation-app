<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { getCameras } from 'een-api-toolkit'
import type { Camera, ListCamerasParams, EenError } from 'een-api-toolkit'
import CameraCard from './CameraCard.vue'

const props = defineProps<{
  selectedCameraId: string | null
}>()

const emit = defineEmits<{
  'select-camera': [camera: Camera]
}>()

// Camera data state
const cameras = ref<Camera[]>([])
const loading = ref(false)
const error = ref<EenError | null>(null)
const totalSize = ref<number>(0)

// Pagination state - using dynamic calculation based on viewport
const currentPage = ref(1)
const camerasPerPage = ref(4) // Default, will be recalculated

// Container ref for height calculation
const cardContainerRef = ref<HTMLElement | null>(null)

// Constants for card dimensions (matching CameraCard styling)
const CARD_HEIGHT = 140 // Approximate height of card with aspect-video + info bar
const CARD_GAP = 12 // Gap between cards (gap-3 = 12px)
const PAGINATION_HEIGHT = 48 // Height reserved for pagination controls
const MIN_CARDS = 2 // Minimum cards to show
const MAX_CARDS = 8 // Maximum cards to show

// Calculate how many cards can fit based on available height
function calculateCardsPerPage() {
  if (!cardContainerRef.value) return MIN_CARDS

  // Get available height (container height minus pagination controls)
  const containerHeight = cardContainerRef.value.clientHeight - PAGINATION_HEIGHT

  if (containerHeight <= 0) return MIN_CARDS

  // Calculate how many cards fit
  const cardTotalHeight = CARD_HEIGHT + CARD_GAP
  const fittingCards = Math.floor(containerHeight / cardTotalHeight)

  // Clamp to reasonable bounds
  return Math.max(MIN_CARDS, Math.min(MAX_CARDS, fittingCards))
}

// Computed pagination values
const totalPages = computed(() => Math.ceil(totalSize.value / camerasPerPage.value))
const hasNextPage = computed(() => currentPage.value < totalPages.value)
const hasPrevPage = computed(() => currentPage.value > 1)

// Current page cameras (slice from loaded cameras or fetch specific page)
const currentPageCameras = computed(() => {
  const start = (currentPage.value - 1) * camerasPerPage.value
  const end = start + camerasPerPage.value
  return cameras.value.slice(start, end)
})

// Fetch cameras from API
async function fetchCameras(append = false) {
  loading.value = true
  error.value = null

  const params: ListCamerasParams = {
    pageSize: 100, // Fetch all cameras for local pagination
    include: ['status', 'deviceInfo']
  }

  const result = await getCameras(params)

  if (result.error) {
    error.value = result.error
    if (!append) {
      cameras.value = []
      totalSize.value = 0
    }
  } else if (result.data) {
    cameras.value = result.data.results || []
    totalSize.value = result.data.totalSize || cameras.value.length
  }

  loading.value = false
}

// Pagination navigation
function nextPage() {
  if (hasNextPage.value) {
    currentPage.value++
  }
}

function prevPage() {
  if (hasPrevPage.value) {
    currentPage.value--
  }
}

// Camera selection handler
function handleCameraSelect(camera: Camera) {
  emit('select-camera', camera)
}

// Refresh cameras
async function refresh() {
  await fetchCameras()
}

// Recalculate cards per page on resize
function handleResize() {
  const newCardsPerPage = calculateCardsPerPage()
  if (newCardsPerPage !== camerasPerPage.value) {
    // Preserve approximate position when resizing
    const currentFirstCameraIndex = (currentPage.value - 1) * camerasPerPage.value
    camerasPerPage.value = newCardsPerPage

    // Recalculate current page to keep roughly same cameras visible
    const newPage = Math.floor(currentFirstCameraIndex / newCardsPerPage) + 1
    currentPage.value = Math.max(1, Math.min(newPage, totalPages.value))
  }
}

// ResizeObserver for dynamic resizing
let resizeObserver: ResizeObserver | null = null

onMounted(async () => {
  await fetchCameras()

  // Set up resize observer
  if (cardContainerRef.value) {
    camerasPerPage.value = calculateCardsPerPage()

    resizeObserver = new ResizeObserver(handleResize)
    resizeObserver.observe(cardContainerRef.value)
  }

  // Also listen to window resize as fallback
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect()
  }
  window.removeEventListener('resize', handleResize)
})

// Auto-select first camera if none selected
watch(cameras, (newCameras) => {
  if (newCameras.length > 0 && !props.selectedCameraId) {
    emit('select-camera', newCameras[0])
  }
}, { immediate: true })
</script>

<template>
  <div class="camera-sidebar h-full flex flex-col bg-gray-50 border-r border-gray-200">
    <!-- Header with Pagination Controls -->
    <div class="sidebar-header px-3 py-2 bg-white border-b border-gray-200">
      <div class="flex items-center justify-between mb-2">
        <h2 class="text-sm font-semibold text-gray-700">Cameras</h2>
        <button
          @click="refresh"
          :disabled="loading"
          class="p-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
          title="Refresh cameras"
        >
          <svg
            class="w-4 h-4"
            :class="{ 'animate-spin': loading }"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
        </button>
      </div>

      <!-- Pagination Controls -->
      <div v-if="totalPages > 1" class="flex items-center justify-between text-xs">
        <button
          @click="prevPage"
          :disabled="!hasPrevPage || loading"
          class="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Prev
        </button>

        <span class="text-gray-600">
          Page {{ currentPage }} of {{ totalPages }}
        </span>

        <button
          @click="nextPage"
          :disabled="!hasNextPage || loading"
          class="px-2 py-1 rounded bg-gray-100 hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          Next
        </button>
      </div>

      <!-- Camera count -->
      <div v-else class="text-xs text-gray-500">
        {{ totalSize }} camera{{ totalSize !== 1 ? 's' : '' }}
      </div>
    </div>

    <!-- Camera Cards Container -->
    <div
      ref="cardContainerRef"
      class="flex-1 overflow-hidden"
    >
      <!-- Loading State -->
      <div v-if="loading && cameras.length === 0" class="p-4 text-center text-gray-500">
        <div class="animate-pulse">Loading cameras...</div>
      </div>

      <!-- Error State -->
      <div v-else-if="error" class="p-4">
        <div class="bg-red-50 border border-red-200 rounded p-3">
          <p class="text-red-600 text-sm">{{ error.message }}</p>
          <button
            @click="refresh"
            class="mt-2 text-sm text-red-700 hover:underline"
          >
            Try again
          </button>
        </div>
      </div>

      <!-- No Cameras State -->
      <div v-else-if="cameras.length === 0" class="p-4 text-center text-gray-500">
        <p class="text-sm">No cameras found</p>
      </div>

      <!-- Camera Cards Grid -->
      <div v-else class="p-3 space-y-3 h-full overflow-y-auto">
        <CameraCard
          v-for="camera in currentPageCameras"
          :key="camera.id"
          :camera="camera"
          :selected="camera.id === selectedCameraId"
          @select="handleCameraSelect"
        />
      </div>
    </div>
  </div>
</template>

<style scoped>
.camera-sidebar {
  width: 240px;
  min-width: 200px;
  max-width: 280px;
}

/* Hide scrollbar but keep functionality */
.overflow-y-auto {
  scrollbar-width: thin;
  scrollbar-color: rgba(156, 163, 175, 0.5) transparent;
}

.overflow-y-auto::-webkit-scrollbar {
  width: 6px;
}

.overflow-y-auto::-webkit-scrollbar-track {
  background: transparent;
}

.overflow-y-auto::-webkit-scrollbar-thumb {
  background-color: rgba(156, 163, 175, 0.5);
  border-radius: 3px;
}
</style>
