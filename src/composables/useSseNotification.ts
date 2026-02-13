import { ref, computed } from 'vue'
import { useMute } from './useMute'

// Shared state for SSE event notification
const notificationMessage = ref<string | null>(null)
const isVisible = ref(false)
const isFading = ref(false)

let hideTimeout: ReturnType<typeof setTimeout> | null = null
let fadeTimeout: ReturnType<typeof setTimeout> | null = null

const DISPLAY_DURATION = 1000 // 1 second display
const FADE_DURATION = 1000 // 1 second fade

// Play sonar ping notification sound
let notificationAudio: HTMLAudioElement | null = null

export function playNotificationSound() {
  try {
    if (!notificationAudio) {
      notificationAudio = new Audio(`${import.meta.env.BASE_URL}sounds/ping.mp3`)
    }
    notificationAudio.currentTime = 0
    notificationAudio.volume = 0.5
    notificationAudio.play()
  } catch {
    // Ignore audio errors (e.g., autoplay policy)
  }
}

export function useSseNotification() {
  const { isMuted } = useMute()

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

    // Play notification sound if not muted
    if (!isMuted.value) {
      playNotificationSound()
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
