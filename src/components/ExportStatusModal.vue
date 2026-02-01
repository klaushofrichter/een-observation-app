<script setup lang="ts">
import { watch, onUnmounted, inject, type Ref } from 'vue'
import { useVideoExport } from '@/composables/useVideoExport'

const props = defineProps<{
  show: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

// Dark mode from parent
const isDark = inject<Ref<boolean>>('isDark')

// Video export state
const {
  status,
  progressPercent,
  errorMessage,
  cameraName,
  eventType,
  startTimestamp,
  endTimestamp,
  downloadInfo,
  videoDurationMs,
  wasClipped,
  cancelExport,
  clearExport
} = useVideoExport()

// Handle ESC key to close modal
function handleEscKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

// Watch modal state to add/remove ESC key listener
watch(() => props.show, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleEscKey)
  } else {
    document.removeEventListener('keydown', handleEscKey)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscKey)
})

// Format timestamp for display
function formatTimestampDisplay(timestamp: string | null): string {
  if (!timestamp) return '-'
  const date = new Date(timestamp)
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// Handle cancel
async function handleCancel() {
  await cancelExport()
  emit('close')
}

// Handle dismiss error
function handleDismissError() {
  clearExport()
  emit('close')
}

// Handle close after completion
function handleCloseComplete() {
  clearExport()
  emit('close')
}

// Format file size for display
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

// Format duration for display (omits zero values)
function formatDuration(ms: number | null): string {
  if (ms === null || ms <= 0) return '-'
  const totalSeconds = Math.floor(ms / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  const parts: string[] = []

  if (hours > 0) {
    parts.push(`${hours}h`)
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`)
  }
  if (seconds > 0 || parts.length === 0) {
    // Always show seconds if it's the only unit (e.g., "0s" for exactly 0, but we return '-' for that)
    // Or show seconds if there are actual seconds
    parts.push(`${seconds}s`)
  }

  return parts.join(' ')
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
        class="relative rounded-lg shadow-xl max-w-md w-full mx-4"
        :class="isDark ? 'bg-gray-800' : 'bg-white'"
      >
        <!-- Header -->
        <div
          class="flex items-center justify-between p-4 border-b"
          :class="isDark ? 'border-gray-700' : 'border-gray-200'"
        >
          <h3 class="text-lg font-semibold" :class="isDark ? 'text-white' : 'text-gray-800'">
            <template v-if="status === 'exporting'">Exporting Video</template>
            <template v-else-if="status === 'export_complete'">Export Complete</template>
            <template v-else-if="status === 'downloading'">Downloading Video</template>
            <template v-else-if="status === 'complete'">Download Complete</template>
            <template v-else-if="status === 'error'">Export Error</template>
            <template v-else>Export Status</template>
          </h3>
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

        <!-- Content -->
        <div class="p-4 space-y-4">
          <!-- Status Message Banner -->
          <div
            v-if="status === 'export_complete'"
            class="p-3 rounded-lg flex items-center gap-2"
            :class="isDark ? 'bg-blue-500/10 border border-blue-500/30' : 'bg-blue-50 border border-blue-200'"
          >
            <svg class="w-5 h-5 text-blue-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <p class="text-sm" :class="isDark ? 'text-blue-400' : 'text-blue-700'">
              Export complete. Starting download...
            </p>
          </div>

          <div
            v-if="status === 'complete'"
            class="p-3 rounded-lg flex items-center gap-2"
            :class="isDark ? 'bg-green-500/10 border border-green-500/30' : 'bg-green-50 border border-green-200'"
          >
            <svg class="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
            </svg>
            <p class="text-sm" :class="isDark ? 'text-green-400' : 'text-green-700'">
              Video downloaded successfully!
            </p>
          </div>

          <!-- Clipping Warning -->
          <div
            v-if="wasClipped"
            class="p-3 rounded-lg flex items-start gap-2"
            :class="isDark ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-yellow-50 border border-yellow-200'"
          >
            <svg class="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <p class="text-sm font-medium" :class="isDark ? 'text-yellow-400' : 'text-yellow-700'">
                Video was clipped to 10 minutes
              </p>
              <p class="text-xs mt-0.5" :class="isDark ? 'text-yellow-400/70' : 'text-yellow-600'">
                The original clip exceeded the maximum export duration. A 10-minute segment centered on the event was exported.
              </p>
            </div>
          </div>

          <!-- Progress Bar (shown only during exporting - has real incremental progress) -->
          <div v-if="status === 'exporting'">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm" :class="isDark ? 'text-gray-300' : 'text-gray-600'">
                Processing on server...
              </span>
              <span class="text-sm font-medium" :class="isDark ? 'text-white' : 'text-gray-800'">
                {{ progressPercent }}%
              </span>
            </div>
            <div class="w-full h-2 rounded-full" :class="isDark ? 'bg-gray-700' : 'bg-gray-200'">
              <div
                class="h-full rounded-full bg-een-accent transition-all duration-300"
                :style="{ width: `${progressPercent}%` }"
              />
            </div>
          </div>

          <!-- Download in progress indicator (no incremental progress available) -->
          <div v-if="status === 'downloading'" class="flex items-center gap-3">
            <svg
              class="w-5 h-5 animate-spin text-een-accent"
              xmlns="http://www.w3.org/2000/svg"
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
            <span class="text-sm" :class="isDark ? 'text-gray-300' : 'text-gray-600'">
              Download in progress...
            </span>
          </div>

          <!-- Error Message -->
          <div v-if="status === 'error' && errorMessage" class="p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <p class="text-sm text-red-500">{{ errorMessage }}</p>
          </div>

          <!-- Export Details -->
          <div class="space-y-2">
            <h4 class="text-sm font-medium" :class="isDark ? 'text-gray-300' : 'text-gray-600'">
              {{ status === 'complete' ? 'Clip Information' : 'Export Details' }}
            </h4>
            <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
              <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">Camera:</span>
              <span :class="isDark ? 'text-white' : 'text-gray-800'">{{ cameraName || '-' }}</span>

              <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">Event Type:</span>
              <span :class="isDark ? 'text-white' : 'text-gray-800'">{{ eventType || '-' }}</span>

              <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">Start:</span>
              <span :class="isDark ? 'text-white' : 'text-gray-800'">{{ formatTimestampDisplay(startTimestamp) }}</span>

              <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">End:</span>
              <span :class="isDark ? 'text-white' : 'text-gray-800'">{{ formatTimestampDisplay(endTimestamp) }}</span>

              <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">Duration:</span>
              <span :class="isDark ? 'text-white' : 'text-gray-800'">{{ formatDuration(videoDurationMs) }}</span>

              <!-- File info shown when download is complete -->
              <template v-if="status === 'complete' && downloadInfo">
                <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">File Size:</span>
                <span :class="isDark ? 'text-white' : 'text-gray-800'">{{ formatFileSize(downloadInfo.size) }}</span>

                <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">Filename:</span>
                <span :class="isDark ? 'text-white' : 'text-gray-800'" class="truncate" :title="downloadInfo.filename">
                  {{ downloadInfo.filename }}
                </span>
              </template>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-2 pt-2">
            <button
              v-if="status === 'error'"
              @click="handleDismissError"
              class="px-4 py-2 text-sm font-medium rounded-lg transition-colors"
              :class="isDark
                ? 'bg-gray-700 text-white hover:bg-gray-600'
                : 'bg-gray-200 text-gray-800 hover:bg-gray-300'"
            >
              Dismiss
            </button>
            <button
              v-if="status === 'complete'"
              @click="handleCloseComplete"
              class="px-4 py-2 text-sm font-medium rounded-lg bg-een-accent text-white hover:bg-een-accent/90 transition-colors"
            >
              Done
            </button>
            <button
              v-if="status === 'exporting' || status === 'export_complete' || status === 'downloading'"
              @click="handleCancel"
              class="px-4 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
            >
              Cancel Export
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>
