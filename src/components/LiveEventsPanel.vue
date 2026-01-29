<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import {
  createEventSubscription,
  connectToEventSubscription,
  deleteEventSubscription
} from 'een-api-toolkit'
import type { Camera, EenError, SSEEvent, SSEConnection, SSEConnectionStatus } from 'een-api-toolkit'

const props = defineProps<{
  camera: Camera | null
  selectedTypes: string[]
  isDark?: boolean
}>()

const emit = defineEmits<{
  (e: 'sse-event', event: Record<string, unknown>): void
}>()

// State
const subscriptionId = ref<string | null>(null)
const sseConnection = ref<SSEConnection | null>(null)
const connectionStatus = ref<SSEConnectionStatus>('disconnected')
const connectionError = ref<EenError | null>(null)
const liveFeedEnabled = ref(false) // User's desired state - always reconnect when enabled

// Reconnection timer (SSE subscriptions expire after 15 minutes)
const SUBSCRIPTION_TTL_MS = 14 * 60 * 1000 // Reconnect at 14 minutes (before 15 min expiry)
let reconnectTimer: ReturnType<typeof setTimeout> | null = null
let isProactiveReconnecting = false // Flag to prevent double-reconnection

// Debounce timer for event type changes
const DEBOUNCE_DELAY_MS = 500 // Wait 500ms for event type changes to settle
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// Connection guard - tracks current connection attempt to prevent races
let connectionAttemptId = 0

// Computed
const isConnected = computed(() => connectionStatus.value === 'connected')
const isConnecting = computed(() => connectionStatus.value === 'connecting')
const canConnect = computed(() => {
  return props.camera && props.selectedTypes.length > 0 && !isConnected.value && !isConnecting.value
})

// Computed button label based on state
const feedButtonLabel = computed(() => {
  if (isConnecting.value) return 'Connecting...'
  if (isConnected.value) return 'Live Feed On'
  return 'Live Feed Off'
})

// Computed button styling based on state
const feedButtonClass = computed(() => {
  if (isConnecting.value) {
    return 'bg-yellow-600 hover:bg-yellow-700 text-white'
  }
  if (isConnected.value) {
    return 'bg-green-600 hover:bg-green-700 text-white'
  }
  return 'bg-gray-500 hover:bg-gray-600 text-white'
})

// Toggle live feed on/off
function toggleLiveFeed() {
  if (isConnected.value || isConnecting.value) {
    // Turn off - disconnect and disable
    liveFeedEnabled.value = false
    disconnect()
  } else {
    // Turn on - enable and connect
    liveFeedEnabled.value = true
    if (canConnect.value) {
      connect()
    }
  }
}

// Handle new SSE event - just emit to parent
function handleEvent(event: SSEEvent) {
  // Emit SSE event to parent for insertion into historic events
  emit('sse-event', event as unknown as Record<string, unknown>)
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

  if (!liveFeedEnabled.value) {
    return
  }

  reconnectTimer = setTimeout(() => {
    if (liveFeedEnabled.value && props.camera && props.selectedTypes.length > 0) {
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

    // Auto-reconnect if feed is enabled and we have camera/types
    if (liveFeedEnabled.value && props.camera && props.selectedTypes.length > 0) {
      // Small delay before reconnecting
      setTimeout(() => {
        if (liveFeedEnabled.value && !isConnected.value && !isConnecting.value && !isProactiveReconnecting) {
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

// Debounced reconnection handler - only reconnects if liveFeedEnabled
async function debouncedReconnect(cameraId: string, types: string[]) {
  // Clear any existing debounce timer
  clearDebounceTimer()

  // First, disconnect any existing connection immediately
  const wasConnected = isConnected.value || isConnecting.value
  if (wasConnected) {
    await disconnect()
  }

  // If no types selected or feed not enabled, don't reconnect
  if (types.length === 0 || !liveFeedEnabled.value) {
    return
  }

  // Debounce the reconnection to wait for rapid changes to settle
  debounceTimer = setTimeout(async () => {
    debounceTimer = null
    // Double-check we still have valid camera, types, and feed is enabled
    if (props.camera?.id === cameraId && props.selectedTypes.length > 0 && liveFeedEnabled.value) {
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

// Expose toggle function and state for parent component
defineExpose({
  toggleLiveFeed,
  feedButtonLabel,
  feedButtonClass,
  canConnect,
  isConnected,
  isConnecting,
  connectionError
})
</script>

<template>
  <div class="live-events-panel h-full flex flex-col">
    <div class="flex items-center justify-between mb-2 flex-shrink-0">
      <h3 class="text-sm font-semibold" :class="isDark ? 'text-gray-200' : 'text-gray-700'">Live Events</h3>
    </div>

    <!-- Error State -->
    <div v-if="connectionError" class="text-xs text-red-500 mb-2 px-1 py-1 rounded flex-shrink-0" :class="isDark ? 'bg-red-900/30' : 'bg-red-50'">
      {{ connectionError.message }}
    </div>

    <!-- Placeholder for future functionality -->
    <div class="flex-1 flex items-center justify-center">
      <div class="text-xs text-center" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
        <template v-if="!camera">
          Select a camera
        </template>
        <template v-else-if="selectedTypes.length === 0">
          Select event types
        </template>
        <template v-else-if="isConnected">
          Live feed active
        </template>
        <template v-else-if="isConnecting">
          Connecting...
        </template>
        <template v-else>
          Live feed off
        </template>
      </div>
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

/* Dark mode scrollbar */
.scrollbar-dark::-webkit-scrollbar {
  width: 8px;
}
.scrollbar-dark::-webkit-scrollbar-track {
  background: #374151; /* gray-700 */
  border-radius: 4px;
}
.scrollbar-dark::-webkit-scrollbar-thumb {
  background: #6b7280; /* gray-500 */
  border-radius: 4px;
}
.scrollbar-dark::-webkit-scrollbar-thumb:hover {
  background: #9ca3af; /* gray-400 */
}

/* Light mode scrollbar */
.scrollbar-light::-webkit-scrollbar {
  width: 8px;
}
.scrollbar-light::-webkit-scrollbar-track {
  background: #f3f4f6; /* gray-100 */
  border-radius: 4px;
}
.scrollbar-light::-webkit-scrollbar-thumb {
  background: #d1d5db; /* gray-300 */
  border-radius: 4px;
}
.scrollbar-light::-webkit-scrollbar-thumb:hover {
  background: #9ca3af; /* gray-400 */
}
</style>
