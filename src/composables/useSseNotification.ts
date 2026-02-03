import { ref, computed } from 'vue'

// Shared state for SSE event notification
const notificationMessage = ref<string | null>(null)
const isVisible = ref(false)
const isFading = ref(false)

let hideTimeout: ReturnType<typeof setTimeout> | null = null
let fadeTimeout: ReturnType<typeof setTimeout> | null = null

const DISPLAY_DURATION = 1000 // 1 second display
const FADE_DURATION = 1000 // 1 second fade

export function useSseNotification() {
  // Show notification with event type name
  function showNotification(eventTypeName: string) {
    // Clear any existing timeouts
    if (hideTimeout) {
      clearTimeout(hideTimeout)
      hideTimeout = null
    }
    if (fadeTimeout) {
      clearTimeout(fadeTimeout)
      fadeTimeout = null
    }

    // Set the message and show immediately (reset fade state)
    notificationMessage.value = `${eventTypeName} Event Received`
    isVisible.value = true
    isFading.value = false

    // Start the hide timer
    hideTimeout = setTimeout(() => {
      // Start fading
      isFading.value = true

      // After fade completes, hide completely
      fadeTimeout = setTimeout(() => {
        isVisible.value = false
        isFading.value = false
        notificationMessage.value = null
      }, FADE_DURATION)
    }, DISPLAY_DURATION)
  }

  // Computed for the notification state
  const notification = computed(() => ({
    message: notificationMessage.value,
    isVisible: isVisible.value,
    isFading: isFading.value
  }))

  return {
    notification,
    showNotification
  }
}
