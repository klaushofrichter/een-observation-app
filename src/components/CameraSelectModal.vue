<script setup lang="ts">
import { ref, watch, computed, onUnmounted, inject } from 'vue'
import type { Ref } from 'vue'
import type { Camera } from 'een-api-toolkit'
import { getLiveImage, initMediaSession, getCameraStatusString } from 'een-api-toolkit'

const MAX_CAMERAS = 10

const props = defineProps<{
  show: boolean
  allCameras: Camera[]
  currentUrlCameraIds: string[]
}>()

const emit = defineEmits<{
  close: []
  confirm: [selectedIds: string[]]
}>()

const isDark = inject<Ref<boolean>>('isDark', ref(false))

// Selected camera IDs
const selectedIds = ref<Set<string>>(new Set())

// Reset selection when modal opens
watch(() => props.show, (isOpen) => {
  if (isOpen) {
    selectedIds.value = new Set(props.currentUrlCameraIds)
    document.addEventListener('keydown', handleEscKey)
  } else {
    document.removeEventListener('keydown', handleEscKey)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscKey)
})

function handleEscKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

const atLimit = computed(() => selectedIds.value.size >= MAX_CAMERAS)
const noneSelected = computed(() => selectedIds.value.size === 0)

function toggleCamera(cameraId: string) {
  const newSet = new Set(selectedIds.value)
  if (newSet.has(cameraId)) {
    newSet.delete(cameraId)
  } else {
    if (newSet.size >= MAX_CAMERAS) return
    newSet.add(cameraId)
  }
  selectedIds.value = newSet
}

function deselectAll() {
  selectedIds.value = new Set()
}

function handleConfirm() {
  emit('confirm', Array.from(selectedIds.value))
}

// URL preview based on selection
const selectionUrl = computed(() => {
  if (selectedIds.value.size === 0) return ''
  const base = window.location.origin + window.location.pathname
  const params = new URLSearchParams(window.location.search)
  params.set('id', Array.from(selectedIds.value).join(','))
  // Build query string without encoding commas and other safe characters
  const parts: string[] = []
  params.forEach((value, key) => {
    parts.push(key + '=' + value)
  })
  return base + '?' + parts.join('&')
})

const copySuccess = ref(false)
async function copyUrl() {
  if (!selectionUrl.value) return
  await navigator.clipboard.writeText(selectionUrl.value)
  copySuccess.value = true
  setTimeout(() => { copySuccess.value = false }, 1500)
}

// Camera status helper
function isCameraOnline(camera: Camera): boolean {
  const status = getCameraStatusString(camera.status)
  return status === 'online' || status === 'streaming'
}

// Hover preview state
const hoveredCameraId = ref<string | null>(null)
const hoverPosition = ref<{ top: number; left: number; flipLeft: boolean } | null>(null)
const hoverImageData = ref<string | null>(null)
const hoverImageLoading = ref(false)
const mediaSessionReady = ref(false)
const imageCache = new Map<string, string>()

async function ensureMediaSession() {
  if (mediaSessionReady.value) return
  const result = await initMediaSession()
  if (result.data) {
    mediaSessionReady.value = true
  }
}

async function handleCameraHover(camera: Camera, mouseEvent: MouseEvent) {
  hoveredCameraId.value = camera.id
  const target = mouseEvent.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  const popupWidth = 340 // 320px image + padding/border
  const spaceOnRight = window.innerWidth - rect.right
  const flipLeft = spaceOnRight < popupWidth
  hoverPosition.value = {
    top: rect.top,
    left: flipLeft ? rect.left - 10 : rect.right + 10,
    flipLeft
  }

  // Skip image fetch for offline cameras
  if (!isCameraOnline(camera)) return

  // Use cached image if available
  const cached = imageCache.get(camera.id)
  if (cached) {
    hoverImageData.value = cached
    return
  }

  hoverImageLoading.value = true
  hoverImageData.value = null

  await ensureMediaSession()

  // Abort if user already moved away
  if (hoveredCameraId.value !== camera.id) return

  const result = await getLiveImage({ deviceId: camera.id, type: 'preview' })
  if (result.data && hoveredCameraId.value === camera.id) {
    hoverImageData.value = result.data.imageData
    imageCache.set(camera.id, result.data.imageData)
  }
  hoverImageLoading.value = false
}

function clearHover() {
  hoveredCameraId.value = null
  hoverPosition.value = null
  hoverImageData.value = null
  hoverImageLoading.value = false
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="show"
      class="fixed inset-0 z-50 flex items-center justify-center"
      @click.self="$emit('close')"
    >
      <!-- Backdrop -->
      <div class="absolute inset-0 bg-black/50" @click="$emit('close')" />

      <!-- Modal -->
      <div
        class="relative rounded-lg shadow-xl w-[85vw] max-w-5xl mx-4"
        :class="isDark ? 'bg-gray-800' : 'bg-white'"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between p-4 border-b"
          :class="isDark ? 'border-gray-700' : 'border-gray-200'"
        >
          <div>
            <h3 class="text-lg font-semibold" :class="isDark ? 'text-white' : 'text-gray-800'">
              Select Cameras
            </h3>
            <p v-if="allCameras.length > MAX_CAMERAS" class="text-xs mt-0.5" :class="isDark ? 'text-gray-400' : 'text-gray-500'">
              Select up to {{ MAX_CAMERAS }} cameras
            </p>
          </div>
          <div class="flex items-center gap-1">
            <button
              v-if="selectionUrl"
              @click.prevent="copyUrl()"
              class="p-1 rounded transition-colors"
              :class="copySuccess
                ? 'text-green-500'
                : (isDark ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100')"
              :title="copySuccess ? 'Copied!' : 'Copy URL'"
            >
              <svg v-if="!copySuccess" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
              </svg>
            </button>
            <button
              @click="$emit('close')"
              class="p-1 rounded transition-colors"
              :class="isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-600'"
              title="Close (ESC)"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        <!-- Selection info -->
        <div
          class="flex items-center justify-between px-4 py-2 border-b text-xs"
          :class="isDark ? 'border-gray-700' : 'border-gray-200'"
        >
          <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">
            {{ selectedIds.size }} of {{ allCameras.length }} selected
            <span v-if="atLimit" class="ml-1 font-medium" :class="isDark ? 'text-yellow-400' : 'text-yellow-600'">(limit reached)</span>
          </span>
          <button
            v-if="selectedIds.size > 0"
            @click="deselectAll()"
            class="font-medium transition-colors"
            :class="isDark ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'"
          >
            Deselect All
          </button>
        </div>

        <!-- Camera Grid -->
        <div class="max-h-[60vh] overflow-y-auto p-3">
          <div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            <label
              v-for="camera in allCameras"
              :key="camera.id"
              class="block px-3 py-2.5 rounded-lg border cursor-pointer transition-colors"
              :class="[
                selectedIds.has(camera.id)
                  ? (isDark ? 'bg-blue-500/10 border-blue-500/40' : 'bg-blue-50 border-blue-300')
                  : (atLimit && !selectedIds.has(camera.id))
                    ? (isDark ? 'border-gray-700 opacity-50 cursor-not-allowed' : 'border-gray-200 opacity-50 cursor-not-allowed')
                    : (isDark ? 'border-gray-700 hover:border-gray-500 hover:bg-gray-700/50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50')
              ]"
              @mouseenter="handleCameraHover(camera, $event)"
              @mouseleave="clearHover()"
            >
              <div class="text-sm font-medium truncate" :class="isDark ? 'text-white' : 'text-gray-800'">
                {{ camera.name }}
              </div>
              <div class="text-xs truncate flex items-center gap-1.5 mt-0.5" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
                <input
                  type="checkbox"
                  :checked="selectedIds.has(camera.id)"
                  :disabled="atLimit && !selectedIds.has(camera.id)"
                  @change="toggleCamera(camera.id)"
                  class="w-3 h-3 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
                />
                <span
                  class="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  :class="isCameraOnline(camera) ? 'bg-green-500' : 'bg-red-500'"
                  :title="isCameraOnline(camera) ? 'Online' : 'Offline'"
                />
                <span class="truncate">{{ camera.id }}</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Actions -->
        <div
          class="flex justify-end gap-2 p-4 border-t"
          :class="isDark ? 'border-gray-700' : 'border-gray-200'"
        >
          <button
            @click="$emit('close')"
            class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
            :class="isDark
              ? 'bg-gray-700 text-white hover:bg-gray-600'
              : 'bg-gray-200 text-gray-800 hover:bg-gray-300'"
          >
            Cancel
          </button>
          <button
            @click="handleConfirm"
            :disabled="noneSelected"
            class="px-4 py-2 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            :class="noneSelected
              ? (isDark ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-500')
              : 'bg-een-accent text-white hover:bg-een-accent/90'"
          >
            Done
          </button>
        </div>
      </div>
    </div>

    <!-- Hover preview popup -->
    <div
      v-if="hoveredCameraId && hoverPosition && (hoverImageData || hoverImageLoading)"
      class="fixed z-[9999] rounded-lg shadow-xl p-2 pointer-events-none"
      :class="isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'"
      :style="{
        top: hoverPosition.top + 'px',
        left: hoverPosition.left + 'px',
        transform: hoverPosition.flipLeft ? 'translateX(-100%)' : 'none'
      }"
    >
      <img
        v-if="hoverImageData"
        :src="hoverImageData"
        alt="Camera preview"
        class="max-w-[320px] h-auto rounded"
      />
      <div
        v-else
        class="flex items-center justify-center w-[320px] h-[180px]"
      >
        <svg class="animate-spin h-6 w-6" :class="isDark ? 'text-gray-400' : 'text-gray-500'" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
      </div>
    </div>
  </Teleport>
</template>
