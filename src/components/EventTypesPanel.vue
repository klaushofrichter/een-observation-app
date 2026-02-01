<script setup lang="ts">
import { ref, watch, computed, onMounted } from 'vue'
import { listEventFieldValues, listEventTypes } from 'een-api-toolkit'
import type { Camera, EenError } from 'een-api-toolkit'

const props = defineProps<{
  camera: Camera | null
  isDark?: boolean
}>()

const emit = defineEmits<{
  'update:selectedTypes': [types: string[]]
}>()

// State
const loading = ref(false)
const error = ref<EenError | null>(null)
const availableEventTypes = ref<string[]>([])
const selectedEventTypes = ref<string[]>([])
const eventTypeNames = ref<Map<string, string>>(new Map())

// Track if this is the first camera selection (for default selection behavior)
const isFirstCameraSelection = ref(true)

// Motion detection event type constant
const MOTION_DETECTION_EVENT = 'een.motionDetectionEvent.v1'

// Computed - check if all types are selected
const allSelected = computed(() => {
  return availableEventTypes.value.length > 0 &&
    selectedEventTypes.value.length === availableEventTypes.value.length
})

const someSelected = computed(() => {
  return selectedEventTypes.value.length > 0 &&
    selectedEventTypes.value.length < availableEventTypes.value.length
})

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

// Short name for display in tight spaces
function getShortEventTypeName(type: string): string {
  const fullName = getEventTypeName(type)
  // Truncate long names
  return fullName.length > 20 ? fullName.substring(0, 18) + '...' : fullName
}

// Fetch available event types for the camera
async function fetchAvailableEventTypes() {
  if (!props.camera) {
    availableEventTypes.value = []
    selectedEventTypes.value = []
    emit('update:selectedTypes', [])
    return
  }

  // Remember previously selected event types before fetching new ones
  const previouslySelectedTypes = [...selectedEventTypes.value]

  loading.value = true
  error.value = null

  const result = await listEventFieldValues({
    actor: `camera:${props.camera.id}`
  })

  if (result.error) {
    error.value = result.error
    availableEventTypes.value = []
    selectedEventTypes.value = []
    emit('update:selectedTypes', [])
  } else {
    availableEventTypes.value = result.data.type || []

    if (isFirstCameraSelection.value) {
      // First camera: preselect motion detection if available, otherwise first type
      isFirstCameraSelection.value = false
      if (availableEventTypes.value.includes(MOTION_DETECTION_EVENT)) {
        selectedEventTypes.value = [MOTION_DETECTION_EVENT]
      } else if (availableEventTypes.value.length > 0) {
        selectedEventTypes.value = [availableEventTypes.value[0]]
      } else {
        selectedEventTypes.value = []
      }
    } else {
      // Subsequent cameras: keep only previously selected types that are available
      const intersection = previouslySelectedTypes.filter(type =>
        availableEventTypes.value.includes(type)
      )
      selectedEventTypes.value = intersection
    }

    emit('update:selectedTypes', selectedEventTypes.value)
  }

  loading.value = false
}

// Toggle a single event type
function toggleEventType(type: string) {
  const index = selectedEventTypes.value.indexOf(type)
  if (index === -1) {
    selectedEventTypes.value = [...selectedEventTypes.value, type]
  } else {
    selectedEventTypes.value = selectedEventTypes.value.filter(t => t !== type)
  }
  emit('update:selectedTypes', selectedEventTypes.value)
}

// Toggle all event types
function toggleAll() {
  if (allSelected.value) {
    selectedEventTypes.value = []
  } else {
    selectedEventTypes.value = [...availableEventTypes.value]
  }
  emit('update:selectedTypes', selectedEventTypes.value)
}

// Fetch event type names on mount
onMounted(() => {
  fetchEventTypeNames()
})

// Watch for camera changes
watch(() => props.camera?.id, () => {
  fetchAvailableEventTypes()
}, { immediate: true })
</script>

<template>
  <div class="event-types-panel h-full flex flex-col">
    <h3 class="text-sm font-semibold mb-2 flex-shrink-0" :class="isDark ? 'text-gray-200' : 'text-gray-700'" title="Filter Events for the Events Listing on the right">Event Types</h3>

    <!-- Loading State -->
    <div v-if="loading" class="text-xs flex items-center" :class="isDark ? 'text-gray-400' : 'text-gray-500'">
      <svg class="animate-spin h-3 w-3 mr-1" :class="isDark ? 'text-gray-500' : 'text-gray-400'" fill="none" viewBox="0 0 24 24">
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
      Loading...
    </div>

    <!-- No Camera Selected -->
    <div v-else-if="!camera" class="text-xs" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
      Select a camera to view event types
    </div>

    <!-- Error State -->
    <div v-else-if="error" class="text-xs text-red-500">
      Error: {{ error.message }}
    </div>

    <!-- No Event Types -->
    <div v-else-if="availableEventTypes.length === 0" class="text-xs" :class="isDark ? 'text-gray-500' : 'text-gray-400'">
      No event types available
    </div>

    <!-- Event Type List -->
    <div v-else class="flex-1 overflow-y-auto min-h-0">
      <!-- Select All -->
      <label
        class="flex items-center gap-1.5 py-1 px-1 rounded cursor-pointer border-b mb-1"
        :class="isDark ? 'hover:bg-gray-700 border-gray-700' : 'hover:bg-gray-50 border-gray-100'"
      >
        <input
          type="checkbox"
          :checked="allSelected"
          :indeterminate="someSelected"
          @change="toggleAll"
          class="w-3 h-3 text-blue-600 rounded border-gray-300 focus:ring-blue-500 focus:ring-1"
        />
        <span class="text-xs font-medium" :class="isDark ? 'text-gray-300' : 'text-gray-600'">All</span>
      </label>

      <!-- Individual Event Types -->
      <label
        v-for="eventType in availableEventTypes"
        :key="eventType"
        class="flex items-center gap-1.5 py-1 px-1 rounded cursor-pointer"
        :class="isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-50'"
        :title="getEventTypeName(eventType)"
      >
        <input
          type="checkbox"
          :checked="selectedEventTypes.includes(eventType)"
          @change="toggleEventType(eventType)"
          class="w-3 h-3 text-blue-600 rounded border-gray-300 focus:ring-blue-500 focus:ring-1"
        />
        <span class="text-xs truncate" :class="isDark ? 'text-gray-300' : 'text-gray-700'">
          {{ getShortEventTypeName(eventType) }}
        </span>
      </label>
    </div>

    <!-- Selection Count -->
    <div v-if="availableEventTypes.length > 0" class="text-xs mt-1 flex-shrink-0 pt-1 border-t" :class="isDark ? 'text-gray-500 border-gray-700' : 'text-gray-400 border-gray-100'">
      {{ selectedEventTypes.length }}/{{ availableEventTypes.length }} selected
    </div>
  </div>
</template>

<style scoped>
.event-types-panel {
  min-width: 0; /* Allow content to shrink */
}

/* Custom checkbox indeterminate styling */
input[type="checkbox"]:indeterminate {
  background-color: #3b82f6;
  border-color: #3b82f6;
}
</style>
