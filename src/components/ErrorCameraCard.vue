<script setup lang="ts">
defineProps<{
  cameraId: string
  errorMessage?: string
}>()
</script>

<template>
  <div
    class="camera-card rounded-lg overflow-hidden border-2 border-red-300 bg-red-50"
    :data-camera-id="cameraId"
  >
    <!-- Error Preview Area -->
    <div class="relative aspect-video bg-red-100 flex items-center justify-center">
      <div class="text-center p-2">
        <svg
          class="w-8 h-8 mx-auto text-red-400 mb-1"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
          />
        </svg>
        <div class="text-red-600 text-xs font-medium">
          {{ errorMessage || 'No access' }}
        </div>
      </div>

      <!-- Error Badge -->
      <div
        class="absolute top-2 right-2 px-2 py-0.5 rounded-full bg-red-500 text-white text-xs font-medium"
      >
        error
      </div>
    </div>

    <!-- Camera Info -->
    <div class="p-2 bg-white border-t border-red-200">
      <h3 class="text-sm font-medium text-red-700 truncate" :title="cameraId">
        {{ cameraId }}
      </h3>
    </div>
  </div>
</template>

<style scoped>
.camera-card {
  min-width: 0;
}
</style>
