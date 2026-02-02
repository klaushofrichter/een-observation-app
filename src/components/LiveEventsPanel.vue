<script setup lang="ts">
import { ref, watch, computed, onMounted, onUnmounted } from 'vue'
import {
  createEventSubscription,
  connectToEventSubscription,
  deleteEventSubscription,
  listAlerts,
  listNotifications,
  listEventAlertConditionRules,
  listAlertActions
} from 'een-api-toolkit'
import type { Camera, EenError, SSEEvent, SSEConnection, SSEConnectionStatus, Alert, Notification, EventAlertConditionRule, AutomationAlertAction } from 'een-api-toolkit'

// Extended alert type with optional notification and rule data
interface AlertWithNotification extends Alert {
  notifications?: Notification[]
  eventAlertConditionRule?: EventAlertConditionRule
}
import { useImageCache } from '@/composables/useImageCache'
import { useEventAge } from '@/composables/useEventAge'

const props = defineProps<{
  camera: Camera | null
  selectedTypes: string[]
  isDark?: boolean
  activeAlertId?: string | null
  initialDuration?: number | null
  initialAutoRefresh?: boolean
  initialLiveFeed?: boolean
  initialEventFilter?: boolean
}>()

const emit = defineEmits<{
  (e: 'sse-event', event: Record<string, unknown>): void
  (e: 'alert-clicked', alert: { alertId: string; alertObject: Record<string, unknown> }): void
  (e: 'duration-changed', duration: number): void
  (e: 'auto-refresh-changed', enabled: boolean): void
  (e: 'live-feed-changed', enabled: boolean): void
  (e: 'event-filter-changed', enabled: boolean): void
}>()

// Use shared image cache
const { loadImage, getImage } = useImageCache()

// Use event age formatting (updates every second)
const { formatAge } = useEventAge()

// SSE State
const subscriptionId = ref<string | null>(null)
const sseConnection = ref<SSEConnection | null>(null)
const connectionStatus = ref<SSEConnectionStatus>('disconnected')
const connectionError = ref<EenError | null>(null)
const liveFeedEnabled = ref(props.initialLiveFeed ?? false) // User's desired state - always reconnect when enabled

// Alerts State
const alerts = ref<AlertWithNotification[]>([])
const alertsLoading = ref(false)
const alertsError = ref<EenError | null>(null)
const alertsNextPageToken = ref<string | undefined>(undefined)

// Hover preview state
const hoveredAlertId = ref<string | null>(null)
const hoverPosition = ref<{ bottom: number; right: number } | null>(null)

// Notification modal state
const showNotificationModal = ref(false)
const selectedNotification = ref<Notification | null>(null)
const notificationCopied = ref(false)

// Event Alert Condition Rule modal state
const showRuleModal = ref(false)
const selectedRule = ref<EventAlertConditionRule | null>(null)
const ruleCopied = ref(false)

// Action modal state
const showActionModal = ref(false)
const selectedAction = ref<AutomationAlertAction | null>(null)
const selectedActionExecution = ref<Record<string, unknown> | null>(null) // Execution data from alert
const actionCopied = ref(false)

// Store for all event alert condition rules
const eventAlertConditionRules = ref<Map<string, EventAlertConditionRule>>(new Map())

// Store for all alert actions (definitions)
const alertActionsMap = ref<Map<string, AutomationAlertAction>>(new Map())

// Event type filter state for alerts (initialize from prop)
const eventFilterEnabled = ref(props.initialEventFilter ?? false)

// Auto-refresh state for alerts (initialize from prop)
const autoRefresh = ref(props.initialAutoRefresh ?? false)
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
// Valid duration values for validation
const validDurations = new Set([10, 60, 1440, 10080])
// Initialize from prop if valid, otherwise default to 1 hour
const getInitialDuration = () => {
  if (props.initialDuration && validDurations.has(props.initialDuration)) {
    return props.initialDuration
  }
  return 60
}
const selectedTimeRange = ref(getInitialDuration())

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

// Computed event filter button label
const eventFilterButtonLabel = computed(() => {
  return eventFilterEnabled.value ? 'Disable Event Filter' : 'Enable Event Filter'
})

// Computed event filter button styling
const eventFilterButtonClass = computed(() => {
  if (eventFilterEnabled.value) {
    return 'bg-green-600 hover:bg-green-700 text-white'
  }
  return 'bg-gray-500 hover:bg-gray-600 text-white'
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
    emit('live-feed-changed', false)
    disconnect()
  } else {
    // Turn on - enable and connect
    liveFeedEnabled.value = true
    emit('live-feed-changed', true)
    if (canConnect.value) {
      connect()
    }
  }
}

// Toggle event type filter for alerts
function toggleEventFilter() {
  eventFilterEnabled.value = !eventFilterEnabled.value
  emit('event-filter-changed', eventFilterEnabled.value)
  // Refresh alerts with new filter setting
  fetchAlerts()
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

// Handle alert click - emit alert data for display (exclude notifications as they're accessible via icons)
function handleAlertClick(alert: AlertWithNotification) {
  // Create a copy without the notifications property (they're accessible via their own icons)
  const { notifications, eventAlertConditionRule, ...alertData } = alert
  emit('alert-clicked', {
    alertId: alert.id,
    alertObject: alertData as unknown as Record<string, unknown>
  })
}

// Load images for alerts
async function loadAlertImages(alertsToLoad: Alert[]) {
  for (const alert of alertsToLoad) {
    if (alert.actorType !== 'camera') continue
    loadImage(alert.id, alert.actorId, alert.timestamp)
  }
}

// Get image for an alert
function getAlertImage(alert: Alert): string | null {
  return getImage(alert.id)
}

// Handle thumbnail hover - capture position for popup
function handleThumbnailHover(alert: Alert, mouseEvent: MouseEvent) {
  hoveredAlertId.value = alert.id
  const target = mouseEvent.currentTarget as HTMLElement
  const rect = target.getBoundingClientRect()
  hoverPosition.value = {
    bottom: rect.bottom,
    right: rect.left - 10
  }
}

// Clear hover state
function clearHover() {
  hoveredAlertId.value = null
  hoverPosition.value = null
}

// Fetch notifications for the same time range and merge with alerts
async function fetchAndMergeNotifications() {
  if (!props.camera || alerts.value.length === 0) return

  const result = await listNotifications({
    actorId: props.camera.id,
    timestamp__gte: getStartTimestamp(),
    timestamp__lte: new Date().toISOString(),
    pageSize: 100,
    sort: ['-timestamp']
  })

  if (result.error) {
    // Silently fail - notifications are supplementary
    return
  }

  // Create a map of alertId -> notifications array (can have multiple per alert)
  const notificationsByAlertId = new Map<string, Notification[]>()
  for (const notification of result.data.results) {
    if (notification.alertId) {
      const existing = notificationsByAlertId.get(notification.alertId) || []
      existing.push(notification)
      notificationsByAlertId.set(notification.alertId, existing)
    }
  }

  // Merge notifications into alerts
  for (const alert of alerts.value) {
    const notifications = notificationsByAlertId.get(alert.id)
    if (notifications && notifications.length > 0) {
      alert.notifications = notifications
    }
  }
}

// Helper to get serviceRuleId from notification (may not be typed)
function getServiceRuleIdFromNotification(notification: Notification): string | undefined {
  // serviceRuleId exists in the API response but may not be typed
  return (notification as unknown as { serviceRuleId?: string }).serviceRuleId
}

// Helper to get serviceRuleId directly from alert (may not be typed)
function getServiceRuleIdFromAlert(alert: Alert): string | undefined {
  return (alert as unknown as { serviceRuleId?: string }).serviceRuleId
}

// Get notification actions for display (returns array of action types)
function getNotificationActions(notification: Notification): string[] {
  const actions = notification.notificationActions
  if (!actions || actions.length === 0) {
    return ['unknown']
  }
  return actions
}

// Get tooltip text for notification action (includes description if available)
function getNotificationActionTooltip(action: string, notification?: Notification): string {
  const tooltips: Record<string, string> = {
    email: 'Email notification',
    sms: 'SMS notification',
    push: 'Push notification',
    gui: 'GUI notification'
  }
  const baseTooltip = tooltips[action] || 'Notification (unknown type)'

  // Add description on second line if available
  const description = (notification as unknown as { description?: string })?.description
  if (description) {
    return `${baseTooltip}\n${description}`
  }
  return baseTooltip
}

// Get actions from alert (e.g., zapier, webhook) - actions is an object with UUIDs as keys
// Returns array with id (the key) and execution data
function getAlertActions(alert: AlertWithNotification): Array<{ id: string; type: string; name?: string; execution: Record<string, unknown> }> {
  // Actions can be on the alert itself (from the raw alert data)
  const alertData = alert as unknown as { actions?: Record<string, { type: string; name?: string }> }
  const actions = alertData.actions

  if (!actions || typeof actions !== 'object') return []

  // Convert object entries to array with id included
  return Object.entries(actions).map(([id, execution]) => ({
    id,
    type: execution.type,
    name: execution.name,
    execution: execution as Record<string, unknown>
  }))
}

// Fetch event alert condition rules and match to alerts
async function fetchAndMatchEventAlertConditionRules() {
  // Get unique serviceRuleIds from alerts (directly or from notifications)
  const uniqueRuleIds = new Set<string>()
  for (const alert of alerts.value) {
    // Check alert's own serviceRuleId
    const alertRuleId = getServiceRuleIdFromAlert(alert)
    if (alertRuleId) {
      uniqueRuleIds.add(alertRuleId)
    }
    // Also check notifications' serviceRuleIds
    if (alert.notifications) {
      for (const notification of alert.notifications) {
        const notificationRuleId = getServiceRuleIdFromNotification(notification)
        if (notificationRuleId) {
          uniqueRuleIds.add(notificationRuleId)
        }
      }
    }
  }

  if (uniqueRuleIds.size === 0) return

  // Only fetch rules we don't already have
  const ruleIdsToFetch = Array.from(uniqueRuleIds).filter(id => !eventAlertConditionRules.value.has(id))

  if (ruleIdsToFetch.length > 0) {
    // Fetch all event alert condition rules
    const result = await listEventAlertConditionRules({
      pageSize: 100
    })

    if (!result.error && result.data) {
      // Store rules in map for quick lookup
      for (const rule of result.data.results) {
        eventAlertConditionRules.value.set(rule.id, rule)
      }
    }
  }

  // Match rules to alerts (check alert's serviceRuleId first, then notifications')
  for (const alert of alerts.value) {
    // Try alert's own serviceRuleId first
    const alertRuleId = getServiceRuleIdFromAlert(alert)
    if (alertRuleId) {
      const rule = eventAlertConditionRules.value.get(alertRuleId)
      if (rule) {
        alert.eventAlertConditionRule = rule
        continue
      }
    }
    // Fall back to notifications' serviceRuleId
    if (alert.notifications) {
      for (const notification of alert.notifications) {
        const notificationRuleId = getServiceRuleIdFromNotification(notification)
        if (notificationRuleId) {
          const rule = eventAlertConditionRules.value.get(notificationRuleId)
          if (rule) {
            alert.eventAlertConditionRule = rule
            break
          }
        }
      }
    }
  }
}

// Fetch all alert actions (definitions) and store in map
async function fetchAlertActions() {
  // Only fetch if we don't have any yet
  if (alertActionsMap.value.size > 0) return

  let pageToken: string | undefined = undefined

  do {
    const result = await listAlertActions({
      pageSize: 100,
      ...(pageToken ? { pageToken } : {})
    })

    if (result.error) {
      // Silently fail - alert actions are supplementary
      return
    }

    // Add each action to the Map by its id
    for (const action of result.data.results) {
      alertActionsMap.value.set(action.id, action)
    }

    pageToken = result.data.nextPageToken
  } while (pageToken)
}

// Show notification modal
function showNotificationDetails(notification: Notification, event: MouseEvent) {
  event.stopPropagation() // Prevent alert click
  selectedNotification.value = notification
  showNotificationModal.value = true
}

// Show rule modal
function showRuleDetails(rule: EventAlertConditionRule, event: MouseEvent) {
  event.stopPropagation() // Prevent alert click
  selectedRule.value = rule
  showRuleModal.value = true
}

// Show action modal - looks up action definition by ID
function showActionDetails(actionId: string, execution: Record<string, unknown>, event: MouseEvent) {
  event.stopPropagation() // Prevent alert click

  // Look up the action definition
  const actionDefinition = alertActionsMap.value.get(actionId)
  selectedAction.value = actionDefinition || null
  selectedActionExecution.value = execution
  showActionModal.value = true
}

// Copy action data to clipboard
async function copyActionToClipboard() {
  if (!selectedAction.value) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(selectedAction.value, null, 2))
    actionCopied.value = true
    setTimeout(() => {
      actionCopied.value = false
    }, 2000)
  } catch {
    // Clipboard access denied or not supported
  }
}

// Copy rule data to clipboard
async function copyRuleToClipboard() {
  if (!selectedRule.value) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(selectedRule.value, null, 2))
    ruleCopied.value = true
    setTimeout(() => {
      ruleCopied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
  }
}

// Copy notification data to clipboard
async function copyNotificationToClipboard() {
  if (!selectedNotification.value) return
  try {
    await navigator.clipboard.writeText(JSON.stringify(selectedNotification.value, null, 2))
    notificationCopied.value = true
    setTimeout(() => {
      notificationCopied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy to clipboard:', err)
  }
}

// Handle ESC key to close modals
function handleModalEscKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    showNotificationModal.value = false
    showRuleModal.value = false
    showActionModal.value = false
  }
}

// Watch notification modal state to add/remove ESC key listener
watch(showNotificationModal, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleModalEscKey)
  } else {
    document.removeEventListener('keydown', handleModalEscKey)
    selectedNotification.value = null
  }
})

// Watch rule modal state to add/remove ESC key listener
watch(showRuleModal, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleModalEscKey)
  } else {
    document.removeEventListener('keydown', handleModalEscKey)
    selectedRule.value = null
  }
})

// Watch action modal state to add/remove ESC key listener
watch(showActionModal, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleModalEscKey)
  } else {
    document.removeEventListener('keydown', handleModalEscKey)
    selectedAction.value = null
    selectedActionExecution.value = null
  }
})

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

  // Convert event types to alert types (e.g., "een.motionDetectionEvent.v1" -> "een.motionDetectionAlert.v1")
  const alertTypes = eventFilterEnabled.value && props.selectedTypes.length > 0
    ? props.selectedTypes.map(type => type.replace('Event', 'Alert'))
    : undefined

  const result = await listAlerts({
    actorId__in: [props.camera.id],
    timestamp__gte: getStartTimestamp(),
    timestamp__lte: new Date().toISOString(),
    alertType__in: alertTypes,
    pageSize: 100,
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

    // Load images for alerts
    loadAlertImages(newAlerts)

    // Fetch notifications and merge with alerts
    await fetchAndMergeNotifications()

    // Fetch event alert condition rules and match to notifications
    await fetchAndMatchEventAlertConditionRules()

    // Fetch alert action definitions
    await fetchAlertActions()
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
  emit('auto-refresh-changed', enabled)
})

// Watch for camera changes - fetch alerts
watch(
  () => props.camera?.id,
  () => {
    alerts.value = []
    fetchAlerts()
  }
)

// Watch for time range changes - fetch new alerts and emit change
watch(
  selectedTimeRange,
  (newValue) => {
    fetchAlerts()
    emit('duration-changed', newValue)
  }
)

// Initial alerts fetch
if (props.camera) {
  fetchAlerts()
}

// Start auto-refresh timer and live feed on mount if enabled
onMounted(() => {
  if (autoRefresh.value) {
    startRefreshTimer()
  }
  // Start live feed connection if enabled and we have camera and types
  if (liveFeedEnabled.value && props.camera && props.selectedTypes.length > 0) {
    connect()
  }
})

// Cleanup on unmount
onUnmounted(async () => {
  await disconnect()
  stopRefreshTimer()
  document.removeEventListener('keydown', handleModalEscKey)
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
      <h3 class="text-sm font-semibold" :class="isDark ? 'text-gray-200' : 'text-gray-700'" title="Display of Alerts and associated Notifications without Alert Type Filter">Alerts</h3>
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

        <!-- Event Filter Toggle Button -->
        <button
          @click="toggleEventFilter"
          class="px-2 py-0.5 text-xs rounded transition-colors"
          :class="eventFilterButtonClass"
          title="Filter alerts by selected event types"
        >
          {{ eventFilterButtonLabel }}
        </button>

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
        <!-- Thumbnail -->
        <div
          class="w-12 h-8 rounded overflow-hidden flex-shrink-0"
          :class="isDark ? 'bg-gray-700' : 'bg-gray-200'"
          @mouseenter="handleThumbnailHover(alert, $event)"
          @mouseleave="clearHover"
        >
          <img
            v-if="getAlertImage(alert)"
            :src="getAlertImage(alert) || ''"
            :alt="alert.alertType"
            class="w-full h-full object-cover cursor-pointer"
          />
          <div v-else class="w-full h-full flex items-center justify-center">
            <svg class="w-4 h-4" :class="isDark ? 'text-gray-500' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        <!-- Alert Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-1">
            <span class="text-xs font-medium truncate" :class="isDark ? 'text-gray-200' : 'text-gray-700'">
              {{ alert.alertName || getAlertTypeName(alert.alertType) }}
            </span>
            <!-- 1. Event Alert Condition Rule Icon (first, as every alert has this) -->
            <button
              v-if="alert.eventAlertConditionRule"
              @click="showRuleDetails(alert.eventAlertConditionRule!, $event)"
              class="flex-shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
              title="View event alert condition rule"
            >
              <svg class="w-3.5 h-3.5" :class="isDark ? 'text-purple-400' : 'text-purple-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
              </svg>
            </button>
            <!-- 2. Action Icons (zapier, webhook, etc.) -->
            <template v-if="getAlertActions(alert).length > 0">
              <span class="text-xs" :class="isDark ? 'text-gray-500' : 'text-gray-400'">-</span>
              <template v-for="actionItem in getAlertActions(alert)" :key="actionItem.id">
                <!-- Zapier icon -->
                <button
                  v-if="actionItem.type === 'zapier'"
                  class="flex-shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
                  :title="actionItem.name || 'Zapier action'"
                  @click="showActionDetails(actionItem.id, actionItem.execution, $event)"
                >
                  <svg class="w-3.5 h-3.5" :class="isDark ? 'text-orange-400' : 'text-orange-500'" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 14.025h-3.19v3.19c0 .433-.351.785-.785.785h-3.838a.786.786 0 01-.785-.785v-3.19h-3.19a.786.786 0 01-.785-.785v-2.48c0-.434.351-.785.785-.785h3.19v-3.19c0-.434.351-.785.785-.785h3.838c.434 0 .785.351.785.785v3.19h3.19c.434 0 .785.351.785.785v2.48a.786.786 0 01-.785.785z"/>
                  </svg>
                </button>
                <!-- Webhook icon (hook) -->
                <button
                  v-else-if="actionItem.type === 'webhook'"
                  class="flex-shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
                  :title="actionItem.name || 'Webhook action'"
                  @click="showActionDetails(actionItem.id, actionItem.execution, $event)"
                >
                  <svg class="w-3.5 h-3.5" :class="isDark ? 'text-indigo-400' : 'text-indigo-500'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                  </svg>
                </button>
                <!-- Unknown action type -->
                <button
                  v-else
                  class="text-xs flex-shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
                  :class="isDark ? 'text-gray-400' : 'text-gray-500'"
                  :title="actionItem.name || actionItem.type"
                  @click="showActionDetails(actionItem.id, actionItem.execution, $event)"
                >
                  {{ actionItem.type }}
                </button>
              </template>
            </template>
            <!-- 3. Notification Icons (for all notifications associated with this alert) -->
            <template v-if="alert.notifications && alert.notifications.length > 0">
              <template v-for="notification in alert.notifications" :key="notification.id">
                <button
                  v-for="action in getNotificationActions(notification)"
                  :key="`${notification.id}-${action}`"
                  @click="showNotificationDetails(notification, $event)"
                  class="flex-shrink-0 p-0.5 rounded hover:bg-black/10 transition-colors"
                  :title="getNotificationActionTooltip(action, notification)"
                >
                  <!-- Email icon -->
                  <svg v-if="action === 'email'" class="w-3.5 h-3.5" :class="isDark ? 'text-blue-400' : 'text-blue-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <!-- SMS icon (chat bubble) -->
                  <svg v-else-if="action === 'sms'" class="w-3.5 h-3.5" :class="isDark ? 'text-green-400' : 'text-green-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                  <!-- Push notification icon (bell) -->
                  <svg v-else-if="action === 'push'" class="w-3.5 h-3.5" :class="isDark ? 'text-yellow-400' : 'text-yellow-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  <!-- GUI icon (desktop/monitor) -->
                  <svg v-else-if="action === 'gui'" class="w-3.5 h-3.5" :class="isDark ? 'text-cyan-400' : 'text-cyan-600'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                  <!-- Unknown/default icon (drum) -->
                  <svg v-else class="w-3.5 h-3.5" :class="isDark ? 'text-gray-400' : 'text-gray-500'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <ellipse cx="12" cy="8" rx="8" ry="4" stroke-width="2" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8v8c0 2.21 3.58 4 8 4s8-1.79 8-4V8" />
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 12c0 2.21 3.58 4 8 4s8-1.79 8-4" />
                  </svg>
                </button>
              </template>
            </template>
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

      <!-- Hover preview popup (teleported to body, positioned to the left of thumbnail) -->
      <Teleport to="body">
        <div
          v-if="hoveredAlertId && hoverPosition && getImage(hoveredAlertId)"
          class="fixed z-[9999] rounded-lg shadow-xl p-2 pointer-events-none"
          :class="isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'"
          :style="{
            top: hoverPosition.bottom + 'px',
            left: hoverPosition.right + 'px',
            transform: 'translateX(-100%) translateY(-100%)'
          }"
        >
          <img
            :src="getImage(hoveredAlertId) || ''"
            alt="Alert preview"
            class="max-w-[384px] h-auto rounded"
          />
        </div>
      </Teleport>

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

    <!-- Notification Data Modal -->
    <Teleport to="body">
      <div
        v-if="showNotificationModal && selectedNotification"
        class="fixed inset-0 z-50 flex items-center justify-center"
        @click.self="showNotificationModal = false"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="showNotificationModal = false" />

        <!-- Modal -->
        <div
          class="relative rounded-lg shadow-xl max-h-[80vh] flex flex-col"
          :class="isDark ? 'bg-gray-800' : 'bg-white'"
          style="width: 80%"
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
            <h3 class="text-lg font-semibold" :class="isDark ? 'text-white' : 'text-gray-800'">Notification Data</h3>
            <div class="flex items-center gap-2">
              <!-- Copy Button -->
              <button
                @click="copyNotificationToClipboard"
                class="p-1 rounded transition-colors"
                :class="[
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  notificationCopied ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600')
                ]"
                :title="notificationCopied ? 'Copied!' : 'Copy to clipboard'"
              >
                <!-- Checkmark icon when copied -->
                <svg v-if="notificationCopied" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <!-- Copy icon -->
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <!-- Close Button -->
              <button
                @click="showNotificationModal = false"
                class="p-1 rounded transition-colors"
                :class="[
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600'
                ]"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="p-4 overflow-auto flex-1">
            <pre
              class="text-xs font-mono p-4 rounded overflow-auto"
              :class="isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-100 text-gray-800'"
            >{{ JSON.stringify(selectedNotification, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Event Alert Condition Rule Modal -->
    <Teleport to="body">
      <div
        v-if="showRuleModal && selectedRule"
        class="fixed inset-0 z-50 flex items-center justify-center"
        @click.self="showRuleModal = false"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="showRuleModal = false" />

        <!-- Modal -->
        <div
          class="relative rounded-lg shadow-xl max-h-[80vh] flex flex-col"
          :class="isDark ? 'bg-gray-800' : 'bg-white'"
          style="width: 80%"
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
            <h3 class="text-lg font-semibold" :class="isDark ? 'text-white' : 'text-gray-800'">Event Alert Condition Rule</h3>
            <div class="flex items-center gap-2">
              <!-- Copy Button -->
              <button
                @click="copyRuleToClipboard"
                class="p-1 rounded transition-colors"
                :class="[
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  ruleCopied ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600')
                ]"
                :title="ruleCopied ? 'Copied!' : 'Copy to clipboard'"
              >
                <!-- Checkmark icon when copied -->
                <svg v-if="ruleCopied" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <!-- Copy icon -->
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <!-- Close Button -->
              <button
                @click="showRuleModal = false"
                class="p-1 rounded transition-colors"
                :class="[
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600'
                ]"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="p-4 overflow-auto flex-1">
            <pre
              class="text-xs font-mono p-4 rounded overflow-auto"
              :class="isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-100 text-gray-800'"
            >{{ JSON.stringify(selectedRule, null, 2) }}</pre>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Action Modal -->
    <Teleport to="body">
      <div
        v-if="showActionModal && (selectedAction || selectedActionExecution)"
        class="fixed inset-0 z-50 flex items-center justify-center"
        @click.self="showActionModal = false"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="showActionModal = false" />

        <!-- Modal -->
        <div
          class="relative rounded-lg shadow-xl max-h-[80vh] flex flex-col"
          :class="isDark ? 'bg-gray-800' : 'bg-white'"
          style="width: 80%"
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
            <h3 class="text-lg font-semibold" :class="isDark ? 'text-white' : 'text-gray-800'">
              Action: {{ selectedAction?.name || (selectedActionExecution as Record<string, unknown>)?.name || 'Unknown' }}
            </h3>
            <div class="flex items-center gap-2">
              <!-- Copy Button -->
              <button
                @click="copyActionToClipboard"
                class="p-1 rounded transition-colors"
                :class="[
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  actionCopied ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600')
                ]"
                :title="actionCopied ? 'Copied!' : 'Copy to clipboard'"
              >
                <!-- Checkmark icon when copied -->
                <svg v-if="actionCopied" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                </svg>
                <!-- Copy icon -->
                <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </button>
              <!-- Close Button -->
              <button
                @click="showActionModal = false"
                class="p-1 rounded transition-colors"
                :class="[
                  isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600'
                ]"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          <!-- Content -->
          <div class="p-4 overflow-auto flex-1">
            <!-- Show action definition if available -->
            <template v-if="selectedAction">
              <h4 class="text-sm font-semibold mb-2" :class="isDark ? 'text-gray-300' : 'text-gray-700'">Action Definition</h4>
              <pre
                class="text-xs font-mono p-4 rounded overflow-auto"
                :class="isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-100 text-gray-800'"
              >{{ JSON.stringify(selectedAction, null, 2) }}</pre>
            </template>
            <!-- Fallback to execution data if no definition found -->
            <template v-else-if="selectedActionExecution">
              <h4 class="text-sm font-semibold mb-2" :class="isDark ? 'text-yellow-400' : 'text-yellow-600'">Action Execution Data (definition not found)</h4>
              <pre
                class="text-xs font-mono p-4 rounded overflow-auto"
                :class="isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-100 text-gray-800'"
              >{{ JSON.stringify(selectedActionExecution, null, 2) }}</pre>
            </template>
          </div>
        </div>
      </div>
    </Teleport>
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
