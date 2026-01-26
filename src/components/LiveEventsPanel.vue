<script setup lang="ts">
import { ref, watch, computed, onUnmounted, nextTick } from 'vue'
import {
  createEventSubscription,
  connectToEventSubscription,
  deleteEventSubscription,
  listEventTypes
} from 'een-api-toolkit'
import type { Camera, EenError, SSEEvent, SSEConnection, SSEConnectionStatus } from 'een-api-toolkit'
import { useImageCache } from '@/composables/useImageCache'
import { useEventAge } from '@/composables/useEventAge'

const props = defineProps<{
  camera: Camera | null
  selectedTypes: string[]
  isDark?: boolean
  activeEventId?: string | null
}>()

const emit = defineEmits<{
  (e: 'event-clicked', event: { cameraId: string; timestamp: string; eventType: string; eventId: string }): void
}>()

// Use shared image cache
const { loadImage, getImage, clearImages } = useImageCache()

// Use event age formatting
const { formatAge } = useEventAge()

// State
const subscriptionId = ref<string | null>(null)
const sseConnection = ref<SSEConnection | null>(null)
const connectionStatus = ref<SSEConnectionStatus>('disconnected')
const connectionError = ref<EenError | null>(null)
const events = ref<SSEEvent[]>([])
const eventTypeNames = ref<Map<string, string>>(new Map())
const autoScroll = ref(true)
const autoReconnect = ref(false)
const hoveredEventId = ref<string | null>(null)

// Reconnection timer (SSE subscriptions expire after 15 minutes)
const SUBSCRIPTION_TTL_MS = 14 * 60 * 1000 // Reconnect at 14 minutes (before 15 min expiry)
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let isProactiveReconnecting = false // Flag to prevent double-reconnection
const hoverPosition = ref<{ bottom: number; right: number } | null>(null)
const isAtBottom = ref(false) // Track if scrolled to bottom

// Debounce timer for event type changes
const DEBOUNCE_DELAY_MS = 500 // Wait 500ms for event type changes to settle
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Connection guard - tracks current connection attempt to prevent races
let connectionAttemptId = 0

// Refs
const eventsContainer = ref<HTMLElement | null>(null)

// Constants
const MAX_EVENTS = 100

// Computed
const isConnected = computed(() => connectionStatus.value === 'connected')
const isConnecting = computed(() => connectionStatus.value === 'connecting')
const canConnect = computed(() => {
  return props.camera && props.selectedTypes.length > 0 && !isConnected.value && !isConnecting.value
})

// Get human-readable event type name
function getEventTypeName(type: string): string {
  const name = eventTypeNames.value.get(type)
  if (name) return name

  // Fallback: parse the type string
  const match = type.match(/een\.(\w+)Event\.v\d+/)
  if (match) {
    return match[1]
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
  }
  return type
}

// Format timestamp for display
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Fetch event type display names
async function fetchEventTypeNames() {
  const result = await listEventTypes({ pageSize: 100 })
  if (!result.error && result.data) {
    const nameMap = new Map<string, string>()
    for (const et of result.data.results) {
      nameMap.set(et.type, et.name)
    }
    eventTypeNames.value = nameMap
  }
}

// Scroll to top (newest events)
function scrollToTop() {
  if (eventsContainer.value && autoScroll.value) {
    eventsContainer.value.scrollTop = 0
  }
}

// Handle new SSE event
function handleEvent(event: SSEEvent) {
  // Check for duplicates by event ID
  const isDuplicate = events.value.some(e => e.id === event.id)
  if (isDuplicate) {
    return // Skip duplicate events
  }

  // Add event to the beginning (newest first)
  events.value.unshift(event)

  // Load thumbnail for the event
  if (event.actorType === 'camera') {
    loadImage(event.id, event.actorId, event.startTimestamp)
  }

  // Trim to max events
  if (events.value.length > MAX_EVENTS) {
    events.value = events.value.slice(0, MAX_EVENTS)
  }

  // Auto-scroll to show new event
  nextTick(() => {
    scrollToTop()
  })
}

// Get image for an event
function getEventImage(event: SSEEvent): string | null {
  return getImage(event.id)
}

// Handle thumbnail hover - capture position for popup
function handleThumbnailHover(event: SSEEvent, mouseEvent: MouseEvent) {
  hoveredEventId.value = event.id
  const target = mouseEvent.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  hoverPosition.value = {
    bottom: rect.bottom, // Align bottom of preview with bottom of thumbnail
    right: rect.left - 10 // Position preview 10px to the left of thumbnail
  }
}

// Clear hover state
function clearHover() {
  hoveredEventId.value = null
  hoverPosition.value = null
}

// Handle event card click - emit event for playback
function handleEventClick(event: SSEEvent) {
  emit('event-clicked', {
    cameraId: event.actorId,
    timestamp: event.startTimestamp,
    eventType: getEventTypeName(event.type),
    eventId: event.id
  })
}

// Clear the reconnect timer
function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
}

// Clear the debounce timer
function clearDebounceTimer() {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
}

// Start the reconnect timer (proactive reconnection before TTL expires)
function startReconnectTimer() {
  clearReconnectTimer()

  if (!autoReconnect.value) {
    return
  }

  reconnectTimer = setTimeout(() => {
    if (autoReconnect.value && props.camera && props.selectedTypes.length > 0) {
      // Don't clear events on proactive reconnect
      reconnect()
    }
  }, SUBSCRIPTION_TTL_MS)
}

// Reconnect without clearing events
async function reconnect() {
  // Set flag to prevent handleStatusChange from triggering another connect
  isProactiveReconnecting = true

  // Close existing connection
  if (sseConnection.value) {
    sseConnection.value.close()
    sseConnection.value = null
  }

  // Delete old subscription
  if (subscriptionId.value) {
    await deleteEventSubscription(subscriptionId.value)
    subscriptionId.value = null
  }

  // Create new subscription (don't clear events)
  await connectWithoutClearingEvents()

  // Clear the flag
  isProactiveReconnecting = false
}

// Handle status change
function handleStatusChange(status: SSEConnectionStatus) {
  connectionStatus.value = status

  if (status === 'error' || status === 'disconnected') {
    clearReconnectTimer()

    // Clean up if connection lost
    if (sseConnection.value) {
      sseConnection.value = null
    }

    // Skip auto-reconnect if we're doing a proactive reconnection
    if (isProactiveReconnecting) {
      return
    }

    // Auto-reconnect if enabled and we have camera/types
    if (autoReconnect.value && props.camera && props.selectedTypes.length > 0) {
      // Small delay before reconnecting
      setTimeout(() => {
        if (autoReconnect.value && !isConnected.value && !isConnecting.value && !isProactiveReconnecting) {
          connect()
        }
      }, 2000)
    }
  } else if (status === 'connected') {
    // Start the proactive reconnect timer when connected
    startReconnectTimer()
  }
}

// Handle SSE error
function handleError(error: Error) {
  connectionError.value = {
    code: 'NETWORK_ERROR',
    message: error.message || 'SSE connection error'
  }
}

// Connect to SSE stream
async function connect() {
  if (!props.camera || props.selectedTypes.length === 0) return

  // Increment connection attempt ID to invalidate any pending connections
  connectionAttemptId++
  const currentAttemptId = connectionAttemptId

  connectionStatus.value = 'connecting'
  connectionError.value = null
  events.value = []
  clearImages() // Clear images to prevent showing thumbnails from previous camera

  await createAndConnectSubscription(currentAttemptId)
}

// Connect without clearing events (for proactive reconnection)
async function connectWithoutClearingEvents() {
  if (!props.camera || props.selectedTypes.length === 0) return

  // Increment connection attempt ID to invalidate any pending connections
  connectionAttemptId++
  const currentAttemptId = connectionAttemptId

  connectionStatus.value = 'connecting'
  connectionError.value = null

  await createAndConnectSubscription(currentAttemptId)
}

// Core subscription creation and connection logic
async function createAndConnectSubscription(attemptId: number) {
  // Create subscription
  const subscriptionResult = await createEventSubscription({
    deliveryConfig: { type: 'serverSentEvents.v1' },
    filters: [{
      actors: [`camera:${props.camera!.id}`],
      types: props.selectedTypes.map(type => ({ id: type }))
    }]
  })

  // Check if this attempt is still current (another connection might have been requested)
  if (attemptId !== connectionAttemptId) {
    // This attempt is stale, clean up and abort
    if (!subscriptionResult.error && subscriptionResult.data?.id) {
      deleteEventSubscription(subscriptionResult.data.id)
    }
    return
  }

  if (subscriptionResult.error) {
    connectionError.value = subscriptionResult.error
    connectionStatus.value = 'error'
    return
  }

  subscriptionId.value = subscriptionResult.data.id

  // Get SSE URL
  const sseUrl = subscriptionResult.data.deliveryConfig.type === 'serverSentEvents.v1'
    ? subscriptionResult.data.deliveryConfig.sseUrl
    : null

  if (!sseUrl) {
    connectionError.value = {
      code: 'API_ERROR',
      message: 'No SSE URL returned from subscription'
    }
    connectionStatus.value = 'error'
    return
  }

  // Check again before connecting
  if (attemptId !== connectionAttemptId) {
    // This attempt is stale, clean up and abort
    deleteEventSubscription(subscriptionResult.data.id)
    subscriptionId.value = null
    return
  }

  // Connect to SSE stream
  const connectionResult = connectToEventSubscription(sseUrl, {
    onEvent: handleEvent,
    onError: handleError,
    onStatusChange: handleStatusChange
  })

  if (connectionResult.error) {
    connectionError.value = connectionResult.error
    connectionStatus.value = 'error'
    return
  }

  sseConnection.value = connectionResult.data
}

// Disconnect from SSE stream
async function disconnect() {
  // Increment attempt ID to cancel any pending connection attempts
  connectionAttemptId++

  // Clear timers
  clearReconnectTimer()
  clearDebounceTimer()

  // Close SSE connection
  if (sseConnection.value) {
    sseConnection.value.close()
    sseConnection.value = null
  }

  // Delete subscription
  if (subscriptionId.value) {
    await deleteEventSubscription(subscriptionId.value)
    subscriptionId.value = null
  }

  connectionStatus.value = 'disconnected'
  connectionError.value = null
}

// Clear events
function clearEvents() {
  events.value = []
  clearImages()
}

// Remove events by timestamps (called when historic events are refreshed)
function removeEventsByTimestamps(timestampsToRemove: string[]) {
  if (timestampsToRemove.length === 0) return
  const timestampsSet = new Set(timestampsToRemove)
  events.value = events.value.filter(event => !timestampsSet.has(event.startTimestamp))
}

// Expose methods to parent
defineExpose({
  removeEventsByTimestamps
})

// Handle scroll to detect manual scrolling and bottom position
function handleScroll() {
  if (!eventsContainer.value) return

  const container = eventsContainer.value

  // If user scrolls down (away from top), disable auto-scroll
  // If user scrolls back to top, re-enable auto-scroll
  autoScroll.value = container.scrollTop < 10

  // Check if at bottom (within 20px threshold)
  const atBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 20
  isAtBottom.value = atBottom && events.value.length >= MAX_EVENTS
}

// Fetch event type names on mount
fetchEventTypeNames()

// Debounced reconnection handler
async function debouncedReconnect(cameraId: string, types: string[]) {
  // Clear any existing debounce timer
  clearDebounceTimer()

  // First, disconnect any existing connection immediately
  const wasConnected = isConnected.value || isConnecting.value
  if (wasConnected) {
    await disconnect()
  }

  // If no types selected, don't reconnect
  if (types.length === 0) {
    return
  }

  // Debounce the reconnection to wait for rapid changes to settle
  debounceTimer = setTimeout(async () => {
    debounceTimer = null
    // Double-check we still have valid camera and types
    if (props.camera?.id === cameraId && props.selectedTypes.length > 0) {
      await connect()
    }
  }, DEBOUNCE_DELAY_MS)
}

// Watch for camera or selected types changes - reconnect automatically with debouncing
watch(
  [() => props.camera?.id, () => props.selectedTypes],
  ([newCameraId, newTypes], [oldCameraId, oldTypes]) => {
    const cameraChanged = newCameraId !== oldCameraId
    const typesChanged = JSON.stringify(newTypes) !== JSON.stringify(oldTypes)

    // Only act if something actually changed
    if (!cameraChanged && !typesChanged) {
      return
    }

    // Use debounced reconnection
    if (newCameraId && newTypes) {
      debouncedReconnect(newCameraId, newTypes)
    } else if (!newCameraId || newTypes.length === 0) {
      // No camera or no types - just disconnect
      disconnect()
    }
  },
  { deep: true }
)

// Cleanup on unmount
onUnmounted(async () => {
  await disconnect()
})
</script>

<template>
  <div class="live-events-panel h-full flex flex-col">
    <div class="flex items-center justify-between mb-2 flex-shrink-0">
      <h3 class="text-sm font-semibold" :class="isDark ? 'text-gray-200' : 'text-gray-700'">Live Events</h3>
      <div class="flex items-center gap-1">
        <!-- Connection Status Indicator -->
        <span
          class="w-2 h-2 rounded-full"
          :class="{
            'bg-green-500': isConnected,
            'bg-yellow-500 animate-pulse': isConnecting,
            'bg-gray-400': connectionStatus === 'disconnected',
            'bg-red-500': connectionStatus === 'error'
          }"
          :title="connectionStatus"
        ></span>

        <!-- Connect/Disconnect Button -->
        <button
          v-if="!isConnected && !isConnecting"
          @click="connect"
          :disabled="!canConnect"
          class="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Start live event stream"
        >
          Connect
        </button>
        <button
          v-else
          @click="disconnect"
          class="px-2 py-0.5 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
          title="Stop live event stream"
        >
          {{ isConnecting ? 'Cancel' : 'Disconnect' }}
        </button>

        <!-- Auto-reconnect Checkbox -->
        <input
          type="checkbox"
          v-model="autoReconnect"
          class="w-3 h-3 cursor-pointer accent-blue-600"
          title="Auto-reconnect when subscription expires"
        />
      </div>
    </div>

    <!-- Error State -->
    <div v-if="connectionError" class="text-xs text-red-500 mb-2 px-1 py-1 rounded flex-shrink-0" :class="isDark ? 'bg-red-900/30' : 'bg-red-50'">
      {{ connectionError.message }}
    </div>

    <!-- No Camera Selected -->
    <div v-if="!camera" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-center" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
        Select a camera to stream live events
      </div>
    </div>

    <!-- No Types Selected -->
    <div v-else-if="selectedTypes.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-center" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
        Select event types to stream
      </div>
    </div>

    <!-- Not Connected -->
    <div v-else-if="!isConnected && !isConnecting && events.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-center" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
        Click Connect to start<br/>streaming live events
      </div>
    </div>

    <!-- Connecting -->
    <div v-else-if="isConnecting && events.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs flex items-center" :class="isDark ? 'text-gray-400' : 'text-gray-500'">
        <svg class="animate-spin h-3 w-3 mr-1" :class="isDark ? 'text-gray-500' : 'text-gray-400'" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Connecting...
      </div>
    </div>

    <!-- Events List -->
    <div
      v-else
      ref="eventsContainer"
      class="flex-1 overflow-y-auto min-h-0 space-y-1"
      @scroll="handleScroll"
    >
      <!-- Waiting for events -->
      <div v-if="events.length === 0 && isConnected" class="text-xs text-center py-4" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
        Waiting for new live events...
      </div>

      <!-- Event Items -->
      <div
        v-for="event in events"
        :key="event.id"
        class="relative flex items-center gap-2 p-1.5 rounded animate-fade-in cursor-pointer"
        :class="[
          activeEventId === event.id
            ? (isDark ? 'border-4 bg-blue-800/70 border-orange-500' : 'border-4 bg-blue-200 border-orange-400')
            : (isDark ? 'border-2 bg-blue-900/30 hover:bg-blue-900/50 border-transparent' : 'border-2 bg-blue-50 hover:bg-blue-100 border-transparent')
        ]"
        @click="handleEventClick(event)"
      >
        <!-- Thumbnail -->
        <div
          class="w-12 h-8 rounded overflow-hidden flex-shrink-0"
          :class="isDark ? 'bg-gray-700' : 'bg-gray-200'"
          @mouseenter="handleThumbnailHover(event, $event)"
          @mouseleave="clearHover"
        >
          <img
            v-if="getEventImage(event)"
            :src="getEventImage(event) || ''"
            :alt="event.type"
            class="w-full h-full object-cover cursor-pointer"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <svg class="w-4 h-4" :class="isDark ? 'text-gray-500' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        <!-- Event Info -->
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium truncate" :class="isDark ? 'text-gray-200' : 'text-gray-700'">
            {{ getEventTypeName(event.type) }}
          </div>
          <div class="text-xs flex justify-between" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
            <span>{{ formatTimestamp(event.startTimestamp) }}</span>
            <span :class="isDark ? 'text-gray-300' : 'text-gray-700'">{{ formatAge(event.startTimestamp) }}</span>
          </div>
        </div>
      </div>

      <!-- Hover preview popup (teleported to body, positioned to the left of thumbnail) -->
      <Teleport to="body">
        <div
          v-if="hoveredEventId && hoverPosition && getImage(hoveredEventId)"
          class="fixed z-[9999] rounded-lg shadow-xl p-2 pointer-events-none"
          :class="isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'"
          :style="{
            top: hoverPosition.bottom + 'px',
            left: hoverPosition.right + 'px',
            transform: 'translateX(-100%) translateY(-100%)'
          }"
        >
          <img
            :src="getImage(hoveredEventId) || ''"
            alt="Event preview"
            class="max-w-[384px] h-auto rounded"
          />
        </div>
      </Teleport>
    </div>

    <!-- Footer -->
    <div v-if="events.length > 0" class="flex items-center justify-between text-xs mt-1 flex-shrink-0 pt-1 border-t" :class="isDark ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-100'">
      <span>{{ events.length }} event{{ events.length !== 1 ? 's' : '' }}</span>
      <button
        @click="clearEvents"
        class="transition-colors"
        :class="isDark ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'"
        title="Clear events"
      >
        Clear
      </button>
    </div>

    <!-- Auto-scroll indicator -->
    <div
      v-if="events.length > 0 && !autoScroll"
      class="text-xs text-center py-1 cursor-pointer"
      :class="isDark ? 'text-gray-500 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'"
      @click="autoScroll = true; scrollToTop()"
    >
      Click to resume auto-scroll
    </div>

    <!-- At bottom / max events indicator -->
    <div
      v-if="isAtBottom"
      class="text-xs text-center py-1 rounded"
      :class="isDark ? 'text-orange-400 bg-orange-900/30' : 'text-orange-500 bg-orange-50'"
    >
      Reached max events. Refresh Historic Events to archive.
    </div>
  </div>
</template>

<style scoped>
.live-events-panel {
  min-width: 0; /* Allow content to shrink */
}

@keyframes fade-in {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fade-in {
  animation: fade-in 0.3s ease-out;
}
</style>
