<script setup lang="ts">
import { ref, watch, computed, nextTick } from 'vue'
import { listEvents, listEventTypes } from 'een-api-toolkit'
import type { Camera, Event, EenError } from 'een-api-toolkit'
import { useImageCache } from '@/composables/useImageCache'
import { useEventAge } from '@/composables/useEventAge'

const props = defineProps<{
  camera: Camera | null
  selectedTypes: string[]
}>()

const emit = defineEmits<{
  (e: 'events-refreshed', eventTimestamps: string[]): void
  (e: 'event-clicked', event: { cameraId: string; timestamp: string }): void
}>()

// Use shared image cache
const { loadImage, getImage, clearImages } = useImageCache()

// Use event age formatting
const { formatAge } = useEventAge()

// State
const loading = ref(false)
const error = ref<EenError | null>(null)
const events = ref<Event[]>([])
const nextPageToken = ref<string | undefined>(undefined)
const eventTypeNames = ref<Map<string, string>>(new Map())
const hoveredEventId = ref<string | null>(null)
const hoverPosition = ref<{ bottom: number; right: number } | null>(null)
const isAtTop = ref(true)

// Refs
const eventsContainer = ref<HTMLElement | null>(null)

// Time range options (in minutes)
const timeRangeOptions = [
  { label: 'Last 10 min', value: 10 },
  { label: 'Last 1h', value: 60 },
  { label: 'Last 24h', value: 60 * 24 },
  { label: 'Last week', value: 60 * 24 * 7 }
]
const selectedTimeRange = ref(60) // Default: 1 hour

// Computed
const hasMoreEvents = computed(() => !!nextPageToken.value)
const hasNoEvents = computed(() => !loading.value && events.value.length === 0 && !error.value)

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

// Format timestamp for display
function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

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
    pageSize: 20,
    pageToken: append ? nextPageToken.value : undefined,
    sort: '-startTimestamp',
    include: ['data.een.fullFrameImageUrl.v1']
  })

  if (result.error) {
    error.value = result.error
    if (!append) {
      events.value = []
    }
    nextPageToken.value = undefined
  } else {
    const newEvents = result.data.results
    if (append) {
      events.value = [...events.value, ...newEvents]
    } else {
      events.value = newEvents
      clearImages()
      // Emit event timestamps so live events can filter out duplicates
      emit('events-refreshed', newEvents.map(e => e.startTimestamp))
      // Scroll to top on refresh
      nextTick(() => scrollToTop())
    }
    nextPageToken.value = result.data.nextPageToken

    // Load images for the new events
    loadEventImages(newEvents)
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
    timestamp: event.startTimestamp
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

// Initialize event type names
fetchEventTypeNames()

// Watch for camera, selected types, or time range changes
watch(
  [() => props.camera?.id, () => props.selectedTypes, selectedTimeRange],
  () => {
    fetchEvents()
  },
  { immediate: true, deep: true }
)
</script>

<template>
  <div class="historic-events-panel h-full flex flex-col">
    <div class="flex items-center justify-between mb-2 flex-shrink-0">
      <h3 class="text-sm font-semibold text-gray-700">Historic Events</h3>
      <div class="flex items-center gap-2">
        <select
          v-model="selectedTimeRange"
          class="text-xs text-gray-600 bg-white border border-gray-300 rounded px-1 py-0.5 hover:border-gray-400 focus:outline-none focus:border-blue-500 cursor-pointer"
        >
          <option v-for="option in timeRangeOptions" :key="option.value" :value="option.value">
            {{ option.label }}
          </option>
        </select>
        <button
          @click="fetchEvents()"
          :disabled="loading"
          class="px-2 py-0.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Refresh events and move matching Live Events here"
        >
          {{ loading ? 'Loading...' : 'Refresh' }}
        </button>
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="loading && events.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-gray-500 flex items-center">
        <svg class="animate-spin h-3 w-3 mr-1 text-gray-400" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
        Loading events...
      </div>
    </div>

    <!-- No Camera Selected -->
    <div v-else-if="!camera" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-gray-400 text-center">
        Select a camera to view events
      </div>
    </div>

    <!-- No Types Selected -->
    <div v-else-if="selectedTypes.length === 0" class="flex-1 flex items-center justify-center">
      <div class="text-xs text-gray-400 text-center">
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
      <div class="text-xs text-gray-400 text-center">
        No events found
      </div>
    </div>

    <!-- Events List -->
    <div
      v-else
      ref="eventsContainer"
      class="flex-1 overflow-y-auto min-h-0 space-y-1"
      @scroll="handleScroll"
    >
      <div
        v-for="event in events"
        :key="event.id"
        class="relative flex items-center gap-2 p-1.5 bg-green-50 rounded hover:bg-green-100 transition-colors cursor-pointer"
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

      <!-- Load More Button -->
      <button
        v-if="hasMoreEvents"
        @click="loadMore"
        :disabled="loading"
        class="w-full py-1 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors disabled:opacity-50"
      >
        {{ loading ? 'Loading...' : 'Load more' }}
      </button>
    </div>

    <!-- Event Count -->
    <div v-if="events.length > 0" class="text-xs text-gray-400 mt-1 flex-shrink-0 pt-1 border-t border-gray-100">
      {{ events.length }} event{{ events.length !== 1 ? 's' : '' }}
    </div>

    <!-- Scroll to top indicator -->
    <div
      v-if="events.length > 0 && !isAtTop"
      class="text-xs text-center text-gray-400 py-1 cursor-pointer hover:text-blue-600"
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
</style>
