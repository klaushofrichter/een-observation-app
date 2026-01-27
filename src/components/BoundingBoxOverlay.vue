<script setup lang="ts">
import type { BoundingBox } from '@/composables/useBoundingBoxes'

const props = defineProps<{
  boxes: BoundingBox[]
  showLabels?: boolean  // Show labels on larger previews
  thin?: boolean        // Use thinner stroke for large video overlays
  isDark?: boolean
}>()

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
    class="absolute inset-0 w-full h-full pointer-events-none"
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
