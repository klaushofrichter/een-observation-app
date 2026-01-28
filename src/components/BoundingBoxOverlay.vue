<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import type { BoundingBox } from '@/composables/useBoundingBoxes'

const props = defineProps<{
  boxes: BoundingBox[]
  showLabels?: boolean  // Show labels on larger previews
  thin?: boolean        // Use thinner stroke for large video overlays
  isDark?: boolean
  videoElement?: HTMLVideoElement | null  // Video element for letterbox calculation
}>()

// Computed dimensions for positioning overlay correctly on letterboxed video
const overlayStyle = ref({
  left: '0px',
  top: '0px',
  width: '100%',
  height: '100%'
})

// Calculate the actual video display area within the container (accounting for letterboxing)
function updateOverlayPosition() {
  const video = props.videoElement
  if (!video) {
    // Fallback: fill container (for thumbnails/images without letterboxing)
    overlayStyle.value = { left: '0px', top: '0px', width: '100%', height: '100%' }
    return
  }

  // Get the video's natural dimensions
  const videoWidth = video.videoWidth
  const videoHeight = video.videoHeight

  if (!videoWidth || !videoHeight) {
    // Video metadata not loaded yet
    overlayStyle.value = { left: '0px', top: '0px', width: '100%', height: '100%' }
    return
  }

  // Get the container dimensions (the space the video element occupies)
  const containerWidth = video.clientWidth
  const containerHeight = video.clientHeight

  if (!containerWidth || !containerHeight) {
    overlayStyle.value = { left: '0px', top: '0px', width: '100%', height: '100%' }
    return
  }

  // Calculate the aspect ratios
  const videoAspectRatio = videoWidth / videoHeight
  const containerAspectRatio = containerWidth / containerHeight

  let displayWidth: number
  let displayHeight: number
  let offsetLeft: number
  let offsetTop: number

  if (videoAspectRatio > containerAspectRatio) {
    // Video is wider than container - black bars on top and bottom
    displayWidth = containerWidth
    displayHeight = containerWidth / videoAspectRatio
    offsetLeft = 0
    offsetTop = (containerHeight - displayHeight) / 2
  } else {
    // Video is taller than container - black bars on left and right
    displayHeight = containerHeight
    displayWidth = containerHeight * videoAspectRatio
    offsetLeft = (containerWidth - displayWidth) / 2
    offsetTop = 0
  }

  overlayStyle.value = {
    left: `${offsetLeft}px`,
    top: `${offsetTop}px`,
    width: `${displayWidth}px`,
    height: `${displayHeight}px`
  }
}

// Watch for video element changes and set up event listeners
let resizeObserver: ResizeObserver | null = null

function setupVideoListeners() {
  const video = props.videoElement
  if (!video) return

  // Update on loadedmetadata (when video dimensions become available)
  video.addEventListener('loadedmetadata', updateOverlayPosition)

  // Update on resize of the video element
  resizeObserver = new ResizeObserver(() => {
    updateOverlayPosition()
  })
  resizeObserver.observe(video)

  // Initial update
  updateOverlayPosition()
}

function cleanupVideoListeners() {
  const video = props.videoElement
  if (video) {
    video.removeEventListener('loadedmetadata', updateOverlayPosition)
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
}

watch(() => props.videoElement, (newVideo, oldVideo) => {
  if (oldVideo) {
    oldVideo.removeEventListener('loadedmetadata', updateOverlayPosition)
  }
  if (resizeObserver) {
    resizeObserver.disconnect()
    resizeObserver = null
  }
  if (newVideo) {
    setupVideoListeners()
  } else {
    overlayStyle.value = { left: '0px', top: '0px', width: '100%', height: '100%' }
  }
}, { immediate: true })

// Also watch for box changes to trigger recalculation
watch(() => props.boxes, () => {
  nextTick(() => updateOverlayPosition())
}, { deep: true })

onMounted(() => {
  if (props.videoElement) {
    setupVideoListeners()
  }
})

onUnmounted(() => {
  cleanupVideoListeners()
})

// Color palette for different object types
function getBoxColor(label: string): string {
  const labelLower = label.toLowerCase()
  if (labelLower === 'person' || labelLower === 'human') return '#ef4444' // red
  if (labelLower === 'vehicle' || labelLower === 'car' || labelLower === 'truck') return '#3b82f6' // blue
  if (labelLower === 'animal' || labelLower === 'dog' || labelLower === 'cat') return '#22c55e' // green
  return '#f59e0b' // amber for other/unknown
}

// Stroke width - thinner for large video overlays
const strokeWidth = props.thin ? 0.25 : 0.5

// Font size - smaller for large video overlays
const fontSize = props.thin ? 2.1 : 3
const labelHeight = props.thin ? 2.8 : 4
const labelYOffset = props.thin ? 2.8 : 4
const textYOffset = props.thin ? 2.1 : 3
</script>

<template>
  <svg
    class="absolute pointer-events-none"
    :style="overlayStyle"
    viewBox="0 0 100 100"
    preserveAspectRatio="none"
  >
    <g v-for="box in boxes" :key="box.objectId">
      <!-- Bounding box rectangle -->
      <rect
        :x="box.x * 100"
        :y="box.y * 100"
        :width="box.width * 100"
        :height="box.height * 100"
        :stroke="getBoxColor(box.label)"
        :stroke-width="strokeWidth"
        fill="none"
      />
      <!-- Label background (only for larger previews) -->
      <rect
        v-if="showLabels"
        :x="box.x * 100"
        :y="Math.max(0, box.y * 100 - labelYOffset)"
        :width="Math.max(12, Math.min(20, box.width * 100))"
        :height="labelHeight"
        :fill="getBoxColor(box.label)"
        opacity="0.9"
      />
      <!-- Label text (only for larger previews) -->
      <text
        v-if="showLabels"
        :x="box.x * 100 + 0.5"
        :y="Math.max(textYOffset, box.y * 100 - 0.7)"
        fill="white"
        :font-size="fontSize"
        font-family="system-ui, sans-serif"
        font-weight="600"
      >
        {{ box.label }}
      </text>
    </g>
  </svg>
</template>
