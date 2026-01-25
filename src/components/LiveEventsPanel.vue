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
}>()

const emit = defineEmits<{
  (e: 'event-clicked', event: { cameraId: string; timestamp: string }): void
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
    timestamp: event.startTimestamp
  })
}

// Clear the reconnect timer
function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
    console.log('[SSE] Reconnect timer cleared')
  }
}

// Start the reconnect timer (proactive reconnection before TTL expires)
function startReconnectTimer() {
  clearReconnectTimer()

  if (!autoReconnect.value) {
    console.log('[SSE] Auto-reconnect disabled, not starting timer')
    return
  }

  console.log(`[SSE] Starting reconnect timer for ${SUBSCRIPTION_TTL_MS / 1000 / 60} minutes`)
  reconnectTimer = setTimeout(() => {
    console.log('[SSE] Reconnect timer fired - subscription TTL approaching')
    if (autoReconnect.value && props.camera && props.selectedTypes.length > 0) {
      console.log('[SSE] Triggering proactive reconnection...')
      // Don't clear events on proactive reconnect
      reconnect()
    }
  }, SUBSCRIPTION_TTL_MS)
}

// Reconnect without clearing events
async function reconnect() {
  console.log('[SSE] Reconnecting (proactive)...')

  // Set flag to prevent handleStatusChange from triggering another connect
  isProactiveReconnecting = true

  // Close existing connection
  if (sseConnection.value) {
    sseConnection.value.close()
    sseConnection.value = null
  }

  // Delete old subscription
  if (subscriptionId.value) {
    console.log(`[SSE] Deleting old subscription: ${subscriptionId.value}`)
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
  console.log(`[SSE] Status changed: ${connectionStatus.value} -> ${status}`)
  connectionStatus.value = status

  if (status === 'error' || status === 'disconnected') {
    console.log('[SSE] Connection lost or errored')
    clearReconnectTimer()

    // Clean up if connection lost
    if (sseConnection.value) {
      sseConnection.value = null
    }

    // Skip auto-reconnect if we're doing a proactive reconnection
    if (isProactiveReconnecting) {
      console.log('[SSE] Proactive reconnection in progress, skipping auto-reconnect')
      return
    }

    // Auto-reconnect if enabled and we have camera/types
    if (autoReconnect.value && props.camera && props.selectedTypes.length > 0) {
      console.log('[SSE] Auto-reconnect enabled, will reconnect in 2 seconds...')
      // Small delay before reconnecting
      setTimeout(() => {
        if (autoReconnect.value && !isConnected.value && !isConnecting.value && !isProactiveReconnecting) {
          console.log('[SSE] Executing auto-reconnect')
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

  console.log('[SSE] Connect called - clearing events and images')
  connectionStatus.value = 'connecting'
  connectionError.value = null
  events.value = []
  clearImages() // Clear images to prevent showing thumbnails from previous camera

  await createAndConnectSubscription()
}

// Connect without clearing events (for proactive reconnection)
async function connectWithoutClearingEvents() {
  if (!props.camera || props.selectedTypes.length === 0) return

  console.log('[SSE] ConnectWithoutClearingEvents called - preserving events')
  connectionStatus.value = 'connecting'
  connectionError.value = null

  await createAndConnectSubscription()
}

// Core subscription creation and connection logic
async function createAndConnectSubscription() {
  console.log('[SSE] Creating new subscription...')

  // Create subscription
  const subscriptionResult = await createEventSubscription({
    deliveryConfig: { type: 'serverSentEvents.v1' },
    filters: [{
      actors: [`camera:${props.camera!.id}`],
      types: props.selectedTypes.map(type => ({ id: type }))
    }]
  })

  if (subscriptionResult.error) {
    console.log('[SSE] Subscription creation failed:', subscriptionResult.error.message)
    connectionError.value = subscriptionResult.error
    connectionStatus.value = 'error'
    return
  }

  subscriptionId.value = subscriptionResult.data.id
  console.log(`[SSE] Subscription created: ${subscriptionId.value}`)

  // Get SSE URL
  const sseUrl = subscriptionResult.data.deliveryConfig.type === 'serverSentEvents.v1'
    ? subscriptionResult.data.deliveryConfig.sseUrl
    : null

  if (!sseUrl) {
    console.log('[SSE] No SSE URL returned')
    connectionError.value = {
      code: 'API_ERROR',
      message: 'No SSE URL returned from subscription'
    }
    connectionStatus.value = 'error'
    return
  }

  console.log('[SSE] Connecting to SSE stream...')

  // Connect to SSE stream
  const connectionResult = connectToEventSubscription(sseUrl, {
    onEvent: handleEvent,
    onError: handleError,
    onStatusChange: handleStatusChange
  })

  if (connectionResult.error) {
    console.log('[SSE] Connection failed:', connectionResult.error.message)
    connectionError.value = connectionResult.error
    connectionStatus.value = 'error'
    return
  }

  sseConnection.value = connectionResult.data
  console.log('[SSE] SSE connection established')
}

// Disconnect from SSE stream
async function disconnect() {
  console.log('[SSE] Disconnect called')

  // Clear reconnect timer
  clearReconnectTimer()

  // Close SSE connection
  if (sseConnection.value) {
    console.log('[SSE] Closing SSE connection')
    sseConnection.value.close()
    sseConnection.value = null
  }

  // Delete subscription
  if (subscriptionId.value) {
    console.log(`[SSE] Deleting subscription: ${subscriptionId.value}`)
    await deleteEventSubscription(subscriptionId.value)
    subscriptionId.value = null
  }

  connectionStatus.value = 'disconnected'
  connectionError.value = null
  console.log('[SSE] Disconnected')
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

// Watch for camera or selected types changes - reconnect automatically
watch(
  [() => props.camera?.id, () => props.selectedTypes],
  async ([newCameraId, newTypes], [oldCameraId, oldTypes]) => {
    const cameraChanged = newCameraId !== oldCameraId
    const typesChanged = JSON.stringify(newTypes) !== JSON.stringify(oldTypes)
    const wasConnected = isConnected.value || isConnecting.value

    // If camera or types changed, disconnect first
    if (wasConnected && (cameraChanged || typesChanged)) {
      await disconnect()
    }

    // Auto-connect when camera or event types change (if we have a camera and event types)
    if ((cameraChanged || typesChanged) && newCameraId && newTypes && newTypes.length > 0) {
      await connect()
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
      <h3 class="text-sm font-semibold text-gray-700">Live Events</h3>
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
    <div v-if="connectionError" class="text-xs text-red-500 mb-2 px-1 py-1 bg-red-50 rounded flex-shrink-0">
      {{ connectionError.message }}
    </div>

    <!-- No Camera Selected -->
    <div v-if="!camera" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-gray-400 text-center">
        Select a camera to stream live events
      </div>
    </div>

    <!-- No Types Selected -->
    <div v-else-if="selectedTypes.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-gray-400 text-center">
        Select event types to stream
      </div>
    </div>

    <!-- Not Connected -->
    <div v-else-if="!isConnected && !isConnecting && events.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-gray-400 text-center">
        Click Connect to start<br/>streaming live events
      </div>
    </div>

    <!-- Connecting -->
    <div v-else-if="isConnecting && events.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-gray-500 flex items-center">
        <svg class="animate-spin h-3 w-3 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24">
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
      <div v-if="events.length === 0 && isConnected" class="text-xs text-gray-400 text-center py-4">
        Waiting for new live events...
      </div>

      <!-- Event Items -->
      <div
        v-for="event in events"
        :key="event.id"
        class="relative flex items-center gap-2 p-1.5 bg-blue-50 rounded border-l-2 border-blue-400 animate-fade-in cursor-pointer"
        @click="handleEventClick(event)"
      >
        <!-- Thumbnail -->
        <div
          class="w-12 h-8 bg-gray-200 rounded overflow-hidden flex-shrink-0"
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
            <svg class="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        <!-- Event Info -->
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium text-gray-700 truncate">
            {{ getEventTypeName(event.type) }}
          </div>
          <div class="text-xs text-gray-400 flex justify-between">
            <span>{{ formatTimestamp(event.startTimestamp) }}</span>
            <span class="text-gray-700">{{ formatAge(event.startTimestamp) }}</span>
          </div>
        </div>
      </div>

      <!-- Hover preview popup (teleported to body, positioned to the left of thumbnail) -->
      <Teleport to="body">
        <div
          v-if="hoveredEventId && hoverPosition && getImage(hoveredEventId)"
          class="fixed z-[9999] bg-white rounded-lg shadow-xl border border-gray-200 p-2 pointer-events-none"
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
    <div v-if="events.length > 0" class="flex items-center justify-between text-xs text-gray-400 mt-1 flex-shrink-0 pt-1 border-t border-gray-100">
      <span>{{ events.length }} event{{ events.length !== 1 ? 's' : '' }}</span>
      <button
        @click="clearEvents"
        class="text-gray-500 hover:text-gray-700 transition-colors"
        title="Clear events"
      >
        Clear
      </button>
    </div>

    <!-- Auto-scroll indicator -->
    <div
      v-if="events.length > 0 && !autoScroll"
      class="text-xs text-center text-gray-400 py-1 cursor-pointer hover:text-blue-600"
      @click="autoScroll = true; scrollToTop()"
    >
      Click to resume auto-scroll
    </div>

    <!-- At bottom / max events indicator -->
    <div
      v-if="isAtBottom"
      class="text-xs text-center text-orange-500 py-1 bg-orange-50 rounded"
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
