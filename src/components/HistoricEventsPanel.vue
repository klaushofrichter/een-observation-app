<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { listEvents, listEventTypes, getRecordedImage } from 'een-api-toolkit'
import type { Camera, Event, EenError } from 'een-api-toolkit'

const props = defineProps<{
  camera: Camera | null
  selectedTypes: string[]
}>()

// State
const loading = ref(false)
const error = ref<EenError | null>(null)
const events = ref<Event[]>([])
const nextPageToken = ref<string | undefined>(undefined)
const eventTypeNames = ref<Map<string, string>>(new Map())
const eventImages = ref<Map<string, string>>(new Map())
const loadingImages = ref<Set<string>>(new Set())

// Time range for historic events (last 1 hour)
const TIME_RANGE_HOURS = 1

// Computed
const hasMoreEvents = computed(() => !!nextPageToken.value)
const hasNoEvents = computed(() => !loading.value && events.value.length === 0 && !error.value)

// Get start timestamp for the time range
function getStartTimestamp(): string {
  const now = Date.now()
  return new Date(now - TIME_RANGE_HOURS * 60 * 60 * 1000).toISOString()
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
      eventImages.value.clear()
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
    if (eventImages.value.has(event.id)) continue
    if (loadingImages.value.has(event.id)) continue

    loadingImages.value.add(event.id)

    try {
      const result = await getRecordedImage({
        deviceId: event.actorId,
        type: 'preview',
        timestamp__gte: event.startTimestamp
      })

      if (!result.error && result.data) {
        eventImages.value.set(event.id, result.data.imageData)
      }
    } finally {
      loadingImages.value.delete(event.id)
    }
  }
}

// Get image for an event
function getEventImage(event: Event): string | null {
  return eventImages.value.get(event.id) || null
}

// Load more events
async function loadMore() {
  if (!nextPageToken.value) return
  await fetchEvents(true)
}

// Initialize event type names
fetchEventTypeNames()

// Watch for camera or selected types changes
watch(
  [() => props.camera?.id, () => props.selectedTypes],
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
      <span class="text-xs text-gray-400">Last {{ TIME_RANGE_HOURS }}h</span>
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
    <div v-else class="flex-1 overflow-y-auto min-h-0 space-y-1">
      <div
        v-for="event in events"
        :key="event.id"
        class="flex items-center gap-2 p-1.5 bg-gray-50 rounded hover:bg-gray-100 transition-colors"
      >
        <!-- Thumbnail -->
        <div class="w-12 h-8 bg-gray-200 rounded overflow-hidden flex-shrink-0">
          <img
            v-if="getEventImage(event)"
            :src="getEventImage(event) || ''"
            :alt="event.type"
            class="w-full h-full object-cover"
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
          <div class="text-xs text-gray-400">
            {{ formatTimestamp(event.startTimestamp) }}
          </div>
        </div>
      </div>

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
  </div>
</template>

<style scoped>
.historic-events-panel {
  min-width: 0; /* Allow content to shrink */
}
</style>
