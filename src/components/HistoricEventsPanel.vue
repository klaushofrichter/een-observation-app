<script setup lang="ts">
import { ref, watch, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { listEvents, listEventTypes } from 'een-api-toolkit'
import type { Camera, Event, EenError } from 'een-api-toolkit'
import { useImageCache } from '@/composables/useImageCache'
import { useEventAge } from '@/composables/useEventAge'
import { extractBoundingBoxes, type BoundingBox } from '@/composables/useBoundingBoxes'
import BoundingBoxOverlay from './BoundingBoxOverlay.vue'

const props = defineProps<{
  camera: Camera | null
  selectedTypes: string[]
  isDark?: boolean
  activeEventId?: string | null
  initialDuration?: number | null
  initialAutoRefresh?: boolean
  liveFeedButtonLabel?: string
  liveFeedButtonClass?: string
  liveFeedCanToggle?: boolean
  sseError?: { message: string } | null
}>()

const emit = defineEmits<{
  (e: 'event-clicked', event: { cameraId: string; timestamp: string; eventType: string; eventId: string; boundingBoxes: BoundingBox[]; eventObject: Record<string, unknown> }): void
  (e: 'toggle-live-feed'): void
  (e: 'duration-changed', duration: number): void
  (e: 'auto-refresh-changed', enabled: boolean): void
}>()

// Use shared image cache
const { loadImage, getImage } = useImageCache()

// Use event age formatting
const { formatAge } = useEventAge()

// Constants
const MAX_EVENTS = 500 // Maximum number of events to store

// State
const loading = ref(false)
const error = ref<EenError | null>(null)
const events = ref<Event[]>([])
const nextPageToken = ref<string | undefined>(undefined)
const eventTypeNames = ref<Map<string, string>>(new Map())
const hoveredEventId = ref<string | null>(null)
const hoverPosition = ref<{ bottom: number; right: number } | null>(null)
const isAtTop = ref(true)
const boundingBoxesMap = ref<Map<string, BoundingBox[]>>(new Map())
const sseInsertedIds = ref<Set<string>>(new Set()) // Track events inserted via SSE (shown with blue background)

// Auto-refresh state (initialize from prop)
const autoRefresh = ref(props.initialAutoRefresh ?? false)
const refreshCountdown = ref(0) // seconds until next refresh
const AUTO_REFRESH_INTERVAL = 60 // 1 minute in seconds
let refreshTimer: ReturnType<typeof setInterval> | null = null

// Refs
const eventsContainer = ref<HTMLElement | null>(null)

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

// Computed
const hasMoreEvents = computed(() => !!nextPageToken.value)
const hasNoEvents = computed(() => !loading.value && events.value.length === 0 && !error.value)

// Computed refresh button label
const refreshButtonLabel = computed(() => {
  if (loading.value) return 'Loading...'
  if (!autoRefresh.value) return 'Refresh Now'

  if (refreshCountdown.value < 60) {
    return `Refresh in ${refreshCountdown.value}s`
  }
  return `Refresh in ${Math.ceil(refreshCountdown.value / 60)}m`
})

// Get start timestamp for the time range
function getStartTimestamp(): string {
  const now = Date.now()
  return new Date(now - selectedTimeRange.value * 60 * 1000).toISOString()
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

// Get formatted duration from event start/end timestamps
function getEventDuration(event: Event): string | null {
  if (!event.endTimestamp || !event.startTimestamp) return null

  const startMs = new Date(event.startTimestamp).getTime()
  const endMs = new Date(event.endTimestamp).getTime()
  const diffMs = endMs - startMs

  // Show nothing when duration is 0
  if (diffMs <= 0) return null

  // Show ms when below 1 second
  if (diffMs < 1000) {
    return `${diffMs}ms`
  }

  const diffSeconds = Math.floor(diffMs / 1000)

  // Show seconds when below 2 minutes
  if (diffSeconds < 120) {
    return `${diffSeconds}s`
  }

  const diffMinutes = Math.floor(diffSeconds / 60)

  // Show minutes and seconds when below 1 hour
  if (diffSeconds < 3600) {
    const remainingSeconds = diffSeconds % 60
    return remainingSeconds > 0 ? `${diffMinutes}m ${remainingSeconds}s` : `${diffMinutes}m`
  }

  const diffHours = Math.floor(diffSeconds / 3600)

  // Show hours and minutes when below 24 hours
  if (diffSeconds < 86400) {
    const remainingMinutes = Math.floor((diffSeconds % 3600) / 60)
    return remainingMinutes > 0 ? `${diffHours}h ${remainingMinutes}m` : `${diffHours}h`
  }

  // Show days and hours for anything else
  const diffDays = Math.floor(diffSeconds / 86400)
  const remainingHours = Math.floor((diffSeconds % 86400) / 3600)
  return remainingHours > 0 ? `${diffDays}d ${remainingHours}h` : `${diffDays}d`
}

// Get confidence display text from event data (handles single and multiple values)
function getEventConfidence(event: Event): string | null {
  const data = event.data as Array<Record<string, unknown>> | undefined
  if (!data || !Array.isArray(data)) return null

  // Find all objectClassification entries and extract confidence values
  const confidences = data
    .filter(item => item.type === 'een.objectClassification.v1')
    .map(item => item.confidence as number)
    .filter(c => typeof c === 'number')

  if (confidences.length === 0) return null

  if (confidences.length === 1) {
    return `${Math.round(confidences[0] * 100)}%`
  }

  // Multiple confidence values - show range
  const min = Math.min(...confidences)
  const max = Math.max(...confidences)
  return `${Math.round(min * 100)}%-${Math.round(max * 100)}%`
}

// Format timestamp for display
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// Check if active event is still in the list
function isActiveEventInList(): boolean {
  if (!props.activeEventId) return false
  return events.value.some(e => e.id === props.activeEventId)
}

// Get the active event's position relative to the container viewport (for scroll anchoring)
// Returns null if active event is not visible
function getActiveEventViewportOffset(): number | null {
  if (!props.activeEventId || !eventsContainer.value) return null

  const container = eventsContainer.value
  const activeElement = container.querySelector(`[data-event-id="${props.activeEventId}"]`) as HTMLElement
  if (!activeElement) return null

  const containerRect = container.getBoundingClientRect()
  const elementRect = activeElement.getBoundingClientRect()

  // Check if element is at least partially visible in the container
  const isVisible = elementRect.top < containerRect.bottom && elementRect.bottom > containerRect.top
  if (!isVisible) return null

  // Return the element's position relative to the container's top
  return elementRect.top - containerRect.top
}

// Restore the active event to its previous viewport position (scroll anchoring)
function restoreActiveEventPosition(previousOffset: number): void {
  if (!props.activeEventId) return

  nextTick(() => {
    const container = eventsContainer.value
    if (!container) return

    const activeElement = container.querySelector(`[data-event-id="${props.activeEventId}"]`) as HTMLElement
    if (!activeElement) return

    const containerRect = container.getBoundingClientRect()
    const elementRect = activeElement.getBoundingClientRect()

    // Calculate current offset from container top
    const currentOffset = elementRect.top - containerRect.top

    // Adjust scroll to restore the previous offset
    const scrollAdjustment = currentOffset - previousOffset
    container.scrollTop = container.scrollTop + scrollAdjustment
  })
}

// Merge new events into the existing list (upsert by ID, sort by startTimestamp, trim to MAX_EVENTS)
// If previousViewportOffset is provided, will restore the active event to that position
// If fromRefresh is true, events in newEvents will have their SSE-inserted status cleared (become green)
function mergeEvents(newEvents: Event[], previousViewportOffset: number | null = null, fromRefresh = false): void {
  // Create a map of existing events by ID for quick lookup
  const eventMap = new Map<string, Event>()
  for (const event of events.value) {
    eventMap.set(event.id, event)
  }

  // Upsert new events (replace if exists, add if new)
  for (const event of newEvents) {
    eventMap.set(event.id, event)
    // If from refresh, remove SSE-inserted status (event becomes green)
    if (fromRefresh) {
      sseInsertedIds.value.delete(event.id)
    }
  }

  // Convert back to array and sort by startTimestamp (newest first)
  let mergedEvents = Array.from(eventMap.values())
  mergedEvents.sort((a, b) => {
    return new Date(b.startTimestamp).getTime() - new Date(a.startTimestamp).getTime()
  })

  // Filter out events older than the selected time range
  const cutoffTime = Date.now() - selectedTimeRange.value * 60 * 1000
  mergedEvents = mergedEvents.filter(e => {
    const eventTime = new Date(e.startTimestamp).getTime()
    const keep = eventTime >= cutoffTime
    // Clean up SSE-inserted tracking for removed events
    if (!keep) {
      sseInsertedIds.value.delete(e.id)
    }
    return keep
  })

  // Trim to MAX_EVENTS (remove oldest)
  if (mergedEvents.length > MAX_EVENTS) {
    mergedEvents.length = MAX_EVENTS
  }

  events.value = mergedEvents

  // Load images and extract bounding boxes for new events
  loadEventImages(newEvents)
  extractEventBoundingBoxes(newEvents)

  // Restore active event to its previous viewport position if it was visible
  if (previousViewportOffset !== null) {
    restoreActiveEventPosition(previousViewportOffset)
  }
}

// Insert a single event from SSE (exposed for parent component)
function insertEvent(event: Event): void {
  // Only insert if event type matches selected types
  if (!props.selectedTypes.includes(event.type)) {
    return
  }

  // Get active event's viewport position BEFORE the merge
  const viewportOffset = getActiveEventViewportOffset()
  // Track this event as SSE-inserted (will show with blue background)
  sseInsertedIds.value.add(event.id)
  mergeEvents([event], viewportOffset)
}

// Expose insertEvent for parent component
defineExpose({ insertEvent, events })

// Fetch historic events
async function fetchEvents(append = false) {
  if (!props.camera || props.selectedTypes.length === 0) {
    events.value = []
    nextPageToken.value = undefined
    return
  }

  loading.value = true
  if (!append) {
    error.value = null
  }

  const result = await listEvents({
    actor: `camera:${props.camera.id}`,
    type__in: props.selectedTypes,
    startTimestamp__gte: getStartTimestamp(),
    endTimestamp__lte: new Date().toISOString(),
    pageSize: 100,
    pageToken: append ? nextPageToken.value : undefined,
    sort: '-startTimestamp',
    include: [
      'data.een.fullFrameImageUrl.v1',
      'data.een.objectDetection.v1',
      'data.een.objectClassification.v1'
    ]
  })

  if (result.error) {
    error.value = result.error
    if (!append) {
      events.value = []
    }
    nextPageToken.value = undefined
  } else {
    const newEvents = result.data.results

    // Get active event's viewport position BEFORE the merge
    const viewportOffset = getActiveEventViewportOffset()

    // Merge new events into existing list (upsert by ID)
    // fromRefresh=true clears SSE-inserted status for these events (they become green)
    mergeEvents(newEvents, viewportOffset, true)

    nextPageToken.value = result.data.nextPageToken

    // Scroll to top on refresh if no active event or if active event was ejected from list
    if (!append && !isActiveEventInList()) {
      nextTick(() => scrollToTop())
    }
  }

  loading.value = false
}

// Load images for events
async function loadEventImages(eventsToLoad: Event[]) {
  for (const event of eventsToLoad) {
    if (event.actorType !== 'camera') continue
    loadImage(event.id, event.actorId, event.startTimestamp)
  }
}

// Get image for an event
function getEventImage(event: Event): string | null {
  return getImage(event.id)
}

// Extract and store bounding boxes for events
function extractEventBoundingBoxes(eventsToProcess: Event[]) {
  for (const event of eventsToProcess) {
    const boxes = extractBoundingBoxes(event)
    if (boxes.length > 0) {
      boundingBoxesMap.value.set(event.id, boxes)
    }
  }
}

// Get bounding boxes for an event
function getBoundingBoxes(eventId: string): BoundingBox[] {
  return boundingBoxesMap.value.get(eventId) || []
}

// Check if an event was inserted via SSE (should show blue background)
function isSseInserted(eventId: string): boolean {
  return sseInsertedIds.value.has(eventId)
}

// Filter events to only keep those matching the selected types
function filterEventsBySelectedTypes() {
  if (props.selectedTypes.length === 0) {
    events.value = []
    sseInsertedIds.value.clear()
    return
  }

  const selectedTypesSet = new Set(props.selectedTypes)
  const removedEventIds = new Set<string>()

  // Find events to remove
  for (const event of events.value) {
    if (!selectedTypesSet.has(event.type)) {
      removedEventIds.add(event.id)
    }
  }

  // Filter events
  events.value = events.value.filter(e => selectedTypesSet.has(e.type))

  // Clean up SSE-inserted tracking for removed events
  for (const eventId of removedEventIds) {
    sseInsertedIds.value.delete(eventId)
  }
}

// Handle thumbnail hover - capture position for popup
function handleThumbnailHover(event: Event, mouseEvent: MouseEvent) {
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
function handleEventClick(event: Event) {
  emit('event-clicked', {
    cameraId: event.actorId,
    timestamp: event.startTimestamp,
    eventType: getEventTypeName(event.type),
    eventId: event.id,
    boundingBoxes: getBoundingBoxes(event.id),
    eventObject: event as unknown as Record<string, unknown>
  })
}

// Load more events
async function loadMore() {
  if (!nextPageToken.value) return
  await fetchEvents(true)
}

// Handle scroll to detect position
function handleScroll() {
  if (!eventsContainer.value) return
  isAtTop.value = eventsContainer.value.scrollTop < 10
}

// Scroll to top of list
function scrollToTop() {
  if (eventsContainer.value) {
    eventsContainer.value.scrollTop = 0
    isAtTop.value = true
  }
}

// Start auto-refresh timer
function startRefreshTimer() {
  stopRefreshTimer()
  refreshCountdown.value = AUTO_REFRESH_INTERVAL

  refreshTimer = setInterval(() => {
    refreshCountdown.value--

    if (refreshCountdown.value <= 0) {
      fetchEvents()
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

// Start auto-refresh timer on mount if enabled
onMounted(() => {
  if (autoRefresh.value) {
    startRefreshTimer()
  }
})

// Cleanup on unmount
onUnmounted(() => {
  stopRefreshTimer()
})

// Initialize event type names
fetchEventTypeNames()

// Watch for camera changes - clear and fetch
watch(
  () => props.camera?.id,
  () => {
    events.value = []
    sseInsertedIds.value.clear()
    fetchEvents()
  }
)

// Watch for selected types changes - filter existing events then fetch
watch(
  () => props.selectedTypes,
  () => {
    filterEventsBySelectedTypes()
    fetchEvents()
  },
  { immediate: true, deep: true }
)

// Watch for time range changes - just fetch new events and emit change
watch(
  selectedTimeRange,
  (newValue) => {
    fetchEvents()
    emit('duration-changed', newValue)
  }
)
</script>

<template>
  <div class="historic-events-panel h-full flex flex-col">
    <div class="flex items-center justify-between mb-2 flex-shrink-0">
      <h3 class="text-sm font-semibold" :class="isDark ? 'text-gray-200' : 'text-gray-700'" title="Display of Events matching the selected Event Types on the left">Events</h3>
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

        <!-- Live Feed Toggle Button -->
        <button
          v-if="liveFeedButtonLabel"
          @click="emit('toggle-live-feed')"
          :disabled="!liveFeedCanToggle"
          class="px-2 py-0.5 text-xs rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          :class="liveFeedButtonClass"
          title="Toggle live event feed"
        >
          {{ liveFeedButtonLabel }}
        </button>
        <button
          @click="fetchEvents()"
          :disabled="loading"
          class="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors min-w-[100px]"
          title="Refresh events"
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
    <div v-if="sseError" class="text-xs text-red-500 mb-2 px-1 py-1 rounded flex-shrink-0" :class="isDark ? 'bg-red-900/30' : 'bg-red-50'">
      SSE: {{ sseError.message }}
    </div>

    <!-- Loading State -->
    <div v-if="loading && events.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs flex items-center" :class="isDark ? 'text-gray-400' : 'text-gray-500'">
        <svg class="animate-spin h-3 w-3 mr-1" :class="isDark ? 'text-gray-500' : 'text-gray-400'" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading events...
      </div>
    </div>

    <!-- No Camera Selected -->
    <div v-else-if="!camera" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-center" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
        Select a camera to view events
      </div>
    </div>

    <!-- No Types Selected -->
    <div v-else-if="selectedTypes.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-center" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
        Select event types to view
      </div>
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-red-500 text-center px-2">
        Error: {{ error.message }}
      </div>
    </div>

    <!-- No Events -->
    <div v-else-if="hasNoEvents" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-center" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
        No events found
      </div>
    </div>

    <!-- Events List -->
    <div
      v-else
      ref="eventsContainer"
      class="flex-1 overflow-y-auto min-h-0 space-y-1"
      :class="isDark ? 'scrollbar-dark' : 'scrollbar-light'"
      @scroll="handleScroll"
    >
      <div
        v-for="event in events"
        :key="event.id"
        :data-event-id="event.id"
        class="relative flex items-center gap-2 p-1.5 rounded transition-colors cursor-pointer"
        :class="[
          activeEventId === event.id
            ? (isSseInserted(event.id)
                ? (isDark ? 'border-4 bg-blue-800/70 border-orange-500' : 'border-4 bg-blue-200 border-orange-400')
                : (isDark ? 'border-4 bg-green-800/70 border-orange-500' : 'border-4 bg-green-200 border-orange-400'))
            : (isSseInserted(event.id)
                ? (isDark ? 'border-2 bg-blue-900/30 hover:bg-blue-900/50 border-transparent' : 'border-2 bg-blue-50 hover:bg-blue-100 border-transparent')
                : (isDark ? 'border-2 bg-green-900/30 hover:bg-green-900/50 border-transparent' : 'border-2 bg-green-50 hover:bg-green-100 border-transparent'))
        ]"
        @click="handleEventClick(event)"
      >
        <!-- Thumbnail -->
        <div
          class="w-12 h-8 rounded overflow-hidden flex-shrink-0 relative"
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
          <BoundingBoxOverlay
            v-if="getEventImage(event) && getBoundingBoxes(event.id).length > 0"
            :boxes="getBoundingBoxes(event.id)"
            :isDark="isDark"
          />
          <div v-if="!getEventImage(event)" class="w-full h-full flex items-center justify-center">
            <svg class="w-4 h-4" :class="isDark ? 'text-gray-500' : 'text-gray-400'" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        </div>

        <!-- Event Info -->
        <div class="flex-1 min-w-0">
          <div class="text-xs font-medium truncate" :class="isDark ? 'text-gray-200' : 'text-gray-700'">
            {{ getEventTypeName(event.type) }}<span v-if="getEventDuration(event)" :class="isDark ? 'text-gray-400' : 'text-gray-400'"> ({{ getEventDuration(event) }})</span><span v-if="getEventConfidence(event)" :class="isDark ? 'text-gray-400' : 'text-gray-400'"> - {{ getEventConfidence(event) }} confidence</span>
          </div>
          <div class="text-xs flex justify-between" :class="isDark ? 'text-gray-400' : 'text-gray-400'">
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
          <div class="relative">
            <img
              :src="getImage(hoveredEventId) || ''"
              alt="Event preview"
              class="max-w-[384px] h-auto rounded"
            />
            <BoundingBoxOverlay
              v-if="getBoundingBoxes(hoveredEventId).length > 0"
              :boxes="getBoundingBoxes(hoveredEventId)"
              :showLabels="true"
              :isDark="isDark"
            />
          </div>
        </div>
      </Teleport>

      <!-- Load More Button -->
      <button
        v-if="hasMoreEvents"
        @click="loadMore"
        :disabled="loading"
        class="w-full py-1 text-xs rounded transition-colors disabled:opacity-50"
        :class="isDark ? 'text-blue-400 hover:text-blue-300 hover:bg-gray-700' : 'text-blue-600 hover:text-blue-800 hover:bg-blue-50'"
      >
        {{ loading ? 'Loading...' : 'Load more' }}
      </button>
    </div>

    <!-- Event Count -->
    <div v-if="events.length > 0" class="text-xs mt-1 flex-shrink-0 pt-1 border-t" :class="isDark ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-100'">
      {{ events.length }} event{{ events.length !== 1 ? 's' : '' }}
    </div>

    <!-- Scroll to top indicator -->
    <div
      v-if="events.length > 0 && !isAtTop"
      class="text-xs text-center py-1 cursor-pointer"
      :class="isDark ? 'text-gray-500 hover:text-blue-400' : 'text-gray-400 hover:text-blue-600'"
      @click="scrollToTop"
    >
      Click to scroll to top
    </div>
  </div>
</template>

<style scoped>
.historic-events-panel {
  min-width: 0; /* Allow content to shrink */
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
