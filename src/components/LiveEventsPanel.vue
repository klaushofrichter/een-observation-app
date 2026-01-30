<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import {
  createEventSubscription,
  connectToEventSubscription,
  deleteEventSubscription,
  listAlerts
} from 'een-api-toolkit'
import type { Camera, EenError, SSEEvent, SSEConnection, SSEConnectionStatus, Alert } from 'een-api-toolkit'

const props = defineProps<{
  camera: Camera | null
  selectedTypes: string[]
  isDark?: boolean
  activeAlertId?: string | null
}>()

const emit = defineEmits<{
  (e: 'sse-event', event: Record<string, unknown>): void
  (e: 'alert-clicked', alert: { alertId: string; alertObject: Record<string, unknown> }): void
}>()

// SSE State
const subscriptionId = ref<string | null>(null)
const sseConnection = ref<SSEConnection | null>(null)
const connectionStatus = ref<SSEConnectionStatus>('disconnected')
const connectionError = ref<EenError | null>(null)
const liveFeedEnabled = ref(false) // User's desired state - always reconnect when enabled

// Alerts State
const alerts = ref<Alert[]>([])
const alertsLoading = ref(false)
const alertsError = ref<EenError | null>(null)
const alertsNextPageToken = ref<string | undefined>(undefined)

// Auto-refresh state for alerts
const autoRefresh = ref(false)
const refreshCountdown = ref(0) // seconds until next refresh
const AUTO_REFRESH_INTERVAL = 60 // 1 minute in seconds
let refreshTimer: ReturnType<typeof setInterval> | null = null

// Time range options (in minutes)
const timeRangeOptions = [
  { label: 'Last 10 min', value: 10 },
  { label: 'Last 1h', value: 60 },
  { label: 'Last 24h', value: 60 * 24 },
  { label: 'Last week', value: 60 * 24 * 7 }
]
const selectedTimeRange = ref(60) // Default: 1 hour

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

// Alerts computed
const hasMoreAlerts = computed(() => !!alertsNextPageToken.value)
const hasNoAlerts = computed(() => !alertsLoading.value && alerts.value.length === 0 && !alertsError.value)

// Computed refresh button label for alerts
const refreshButtonLabel = computed(() => {
  if (alertsLoading.value) return 'Loading...'
  if (!autoRefresh.value) return 'Refresh Now'

  if (refreshCountdown.value < 60) {
    return `Refresh in ${refreshCountdown.value}s`
  }
  return `Refresh in ${Math.ceil(refreshCountdown.value / 60)}m`
})

// Computed button label based on state
const feedButtonLabel = computed(() => {
  if (isConnecting.value) return 'Connecting...'
  if (isConnected.value) return 'Disable Live Events'
  return 'Turn Live Events On'
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

// ==================== ALERTS FUNCTIONALITY ====================

// Get start timestamp for the time range
function getStartTimestamp(): string {
  const now = Date.now()
  return new Date(now - selectedTimeRange.value * 60 * 1000).toISOString()
}

// Format timestamp for display
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Format alert age
function formatAge(timestamp: string): string {
  const now = Date.now()
  const alertTime = new Date(timestamp).getTime()
  const diffMs = now - alertTime

  const seconds = Math.floor(diffMs / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) return `${days}d ago`
  if (hours > 0) return `${hours}h ago`
  if (minutes > 0) return `${minutes}m ago`
  return 'Just now'
}

// Get human-readable alert type name
function getAlertTypeName(type: string): string {
  // Parse the type string (e.g., "een.motionDetectionAlert.v1" -> "Motion Detection")
  const match = type.match(/een\.(\w+)Alert\.v\d+/)
  if (match) {
    return match[1]
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
  }
  return type
}

// Handle alert click - emit alert data for display
function handleAlertClick(alert: Alert) {
  emit('alert-clicked', {
    alertId: alert.id,
    alertObject: alert as unknown as Record<string, unknown>
  })
}

// Fetch alerts
async function fetchAlerts(append = false) {
  if (!props.camera) {
    alerts.value = []
    alertsNextPageToken.value = undefined
    return
  }

  alertsLoading.value = true
  if (!append) {
    alertsError.value = null
  }

  const result = await listAlerts({
    actorId__in: [props.camera.id],
    timestamp__gte: getStartTimestamp(),
    timestamp__lte: new Date().toISOString(),
    pageSize: 20,
    pageToken: append ? alertsNextPageToken.value : undefined,
    include: ['data', 'actions', 'description'],
    sort: ['-timestamp']
  })

  if (result.error) {
    alertsError.value = result.error
    if (!append) {
      alerts.value = []
    }
    alertsNextPageToken.value = undefined
  } else {
    const newAlerts = result.data.results
    if (append) {
      alerts.value = [...alerts.value, ...newAlerts]
    } else {
      alerts.value = newAlerts
    }
    alertsNextPageToken.value = result.data.nextPageToken
  }

  alertsLoading.value = false
}

// Load more alerts
async function loadMoreAlerts() {
  if (!alertsNextPageToken.value) return
  await fetchAlerts(true)
}

// Start auto-refresh timer for alerts
function startRefreshTimer() {
  stopRefreshTimer()
  refreshCountdown.value = AUTO_REFRESH_INTERVAL

  refreshTimer = setInterval(() => {
    refreshCountdown.value--

    if (refreshCountdown.value <= 0) {
      fetchAlerts()
      refreshCountdown.value = AUTO_REFRESH_INTERVAL
    }
  }, 1000)
}

// Stop auto-refresh timer
function stopRefreshTimer() {
  if (refreshTimer) {
    clearInterval(refreshTimer)
    refreshTimer = null
  }
  refreshCountdown.value = 0
}

// Watch auto-refresh checkbox changes
watch(autoRefresh, (enabled) => {
  if (enabled) {
    startRefreshTimer()
  } else {
    stopRefreshTimer()
  }
})

// Watch for camera changes - fetch alerts
watch(
  () => props.camera?.id,
  () => {
    alerts.value = []
    fetchAlerts()
  }
)

// Watch for time range changes - fetch new alerts
watch(
  selectedTimeRange,
  () => {
    fetchAlerts()
  }
)

// Initial alerts fetch
if (props.camera) {
  fetchAlerts()
}

// Cleanup on unmount
onUnmounted(async () => {
  await disconnect()
  stopRefreshTimer()
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
      <h3 class="text-sm font-semibold" :class="isDark ? 'text-gray-200' : 'text-gray-700'">Alerts</h3>
      <div class="flex items-center gap-2">
        <select
          v-model="selectedTimeRange"
          class="text-xs rounded px-1 py-0.5 focus:outline-none cursor-pointer"
          :class="isDark ? 'text-gray-300 bg-gray-700 border border-gray-600 hover:border-gray-500 focus:border-blue-500' : 'text-gray-600 bg-white border border-gray-300 hover:border-gray-400 focus:border-blue-500'"
        >
          <option v-for="option in timeRangeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>

        <button
          @click="fetchAlerts()"
          :disabled="alertsLoading"
          class="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[100px]"
          title="Refresh alerts"
        >
          {{ refreshButtonLabel }}
        </button>

        <!-- Auto-refresh Checkbox -->
        <input
          type="checkbox"
          v-model="autoRefresh"
          class="w-3 h-3 cursor-pointer accent-blue-600"
          title="Auto-refresh every minute"
        />
      </div>
    </div>

    <!-- SSE Connection Error -->
    <div v-if="connectionError" class="text-xs text-red-500 mb-2 px-1 py-1 rounded flex-shrink-0" :class="isDark ? 'bg-red-900/30' : 'bg-red-50'">
      SSE: {{ connectionError.message }}
    </div>

    <!-- Alerts Error -->
    <div v-if="alertsError" class="text-xs text-red-500 mb-2 px-1 py-1 rounded flex-shrink-0" :class="isDark ? 'bg-red-900/30' : 'bg-red-50'">
      {{ alertsError.message }}
    </div>

    <!-- Loading State -->
    <div v-if="alertsLoading && alerts.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs flex items-center" :class="isDark ? 'text-gray-400' : 'text-gray-500'">
        <svg class="animate-spin h-3 w-3 mr-1" :class="isDark ? 'text-gray-500' : 'text-gray-400'" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading alerts...
      </div>
    </div>

    <!-- No Camera Selected -->
    <div v-else-if="!camera" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-center" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
        Select a camera to view alerts
      </div>
    </div>

    <!-- No Alerts -->
    <div v-else-if="hasNoAlerts" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-center" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
        No alerts found
      </div>
    </div>

    <!-- Alerts List -->
    <div
      v-else
      class="flex-1 overflow-y-auto min-h-0 space-y-1"
      :class="isDark ? 'scrollbar-dark' : 'scrollbar-light'"
    >
      <div
        v-for="alert in alerts"
        :key="alert.id"
        class="flex items-center gap-2 p-1.5 rounded transition-colors cursor-pointer"
        :class="[
          activeAlertId === alert.id
            ? (isDark ? 'border-4 bg-yellow-800/70 border-orange-500' : 'border-4 bg-yellow-200 border-orange-400')
            : (isDark ? 'border-2 bg-yellow-900/30 hover:bg-yellow-900/50 border-transparent' : 'border-2 bg-yellow-50 hover:bg-yellow-100 border-transparent')
        ]"
        @click="handleAlertClick(alert)"
      >
        <!-- Alert Icon -->
        <div
          class="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
          :class="isDark ? 'bg-yellow-800' : 'bg-yellow-200'"
        >
          <svg class="w-4 h-4" :class="isDark ? 'text-yellow-300' : 'text-yellow-700'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
          </svg>
        </div>

        <!-- Alert Info -->
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium truncate" :class="isDark ? 'text-gray-200' : 'text-gray-700'">
            {{ alert.alertName || getAlertTypeName(alert.alertType) }}
          </div>
          <div class="text-xs flex justify-between" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
            <span>{{ formatTimestamp(alert.timestamp) }}</span>
            <span :class="isDark ? 'text-gray-300' : 'text-gray-700'">{{ formatAge(alert.timestamp) }}</span>
          </div>
        </div>

        <!-- Priority Badge (if available, range 0-10) -->
        <div
          v-if="alert.priority !== undefined && alert.priority > 0"
          class="px-1.5 py-0.5 text-xs rounded flex-shrink-0"
          :class="alert.priority >= 8 ? (isDark ? 'bg-red-800 text-red-200' : 'bg-red-200 text-red-800') : alert.priority >= 5 ? (isDark ? 'bg-orange-800 text-orange-200' : 'bg-orange-200 text-orange-800') : (isDark ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700')"
        >
          P{{ alert.priority }}
        </div>
      </div>

      <!-- Load More Button -->
      <button
        v-if="hasMoreAlerts"
        @click="loadMoreAlerts"
        :disabled="alertsLoading"
        class="w-full py-1 text-xs rounded transition-colors disabled:opacity-50"
        :class="isDark ? 'text-blue-400 hover:text-blue-300 hover:bg-gray-700' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'"
      >
        {{ alertsLoading ? 'Loading...' : 'Load more' }}
      </button>
    </div>

    <!-- Alert Count -->
    <div v-if="alerts.length > 0" class="text-xs mt-1 flex-shrink-0 pt-1 border-t" :class="isDark ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-100'">
      {{ alerts.length }} alert{{ alerts.length !== 1 ? 's' : '' }}
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
