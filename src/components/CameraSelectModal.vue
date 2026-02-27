<script setup lang="ts">
import { ref, watch, computed, onUnmounted, inject } from 'vue'
import type { Ref } from 'vue'
import type { Camera } from 'een-api-toolkit'

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
            <p class="text-xs mt-0.5" :class="isDark ? 'text-gray-400' : 'text-gray-500'">
              Select up to {{ MAX_CAMERAS }} cameras
            </p>
          </div>
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
              class="flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-colors"
              :class="[
                selectedIds.has(camera.id)
                  ? (isDark ? 'bg-blue-500/10 border-blue-500/40' : 'bg-blue-50 border-blue-300')
                  : (atLimit && !selectedIds.has(camera.id))
                    ? (isDark ? 'border-gray-700 opacity-50 cursor-not-allowed' : 'border-gray-200 opacity-50 cursor-not-allowed')
                    : (isDark ? 'border-gray-700 hover:border-gray-500 hover:bg-gray-700/50' : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50')
              ]"
            >
              <input
                type="checkbox"
                :checked="selectedIds.has(camera.id)"
                :disabled="atLimit && !selectedIds.has(camera.id)"
                @change="toggleCamera(camera.id)"
                class="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 flex-shrink-0"
              />
              <div class="min-w-0 flex-1">
                <div class="text-sm font-medium truncate" :class="isDark ? 'text-white' : 'text-gray-800'">
                  {{ camera.name }}
                </div>
                <div class="text-xs truncate" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
                  {{ camera.id }}
                </div>
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
  </Teleport>
</template>
