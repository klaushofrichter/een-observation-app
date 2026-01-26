import { ref, onMounted, onUnmounted } from 'vue'

// Shared reactive "now" timestamp that updates every second
const now = ref(Date.now())
let intervalId: ReturnType<typeof setInterval> | null = null
let subscriberCount = 0

function startTimer() {
  if (intervalId === null) {
    intervalId = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  }
}

function stopTimer() {
  if (intervalId !== null) {
    clearInterval(intervalId)
    intervalId = null
  }
}

export function useEventAge() {
  // Track subscribers to start/stop the shared timer
  onMounted(() => {
    subscriberCount++
    if (subscriberCount === 1) {
      startTimer()
    }
  })

  onUnmounted(() => {
    subscriberCount--
    if (subscriberCount === 0) {
      stopTimer()
    }
  })

  // Format age based on timestamp
  function formatAge(timestamp: string): string {
    const eventTime = new Date(timestamp).getTime()
    const ageMs = now.value - eventTime
    const ageSeconds = Math.floor(ageMs / 1000)

    if (ageSeconds < 0) {
      return 'just now'
    }

    if (ageSeconds < 5) {
      // Less than 5 seconds: show "just now"
      return 'just now'
    }

    if (ageSeconds < 120) {
      // Less than 120 seconds: show seconds
      return `${ageSeconds}s ago`
    }

    const ageMinutes = Math.floor(ageSeconds / 60)

    if (ageMinutes < 60) {
      // Less than 60 minutes: show minutes
      return `${ageMinutes}m ago`
    }

    const ageHours = Math.floor(ageMinutes / 60)
    const remainingMinutes = ageMinutes % 60

    if (ageHours < 24) {
      // Less than 24 hours: show hours and minutes
      return `${ageHours}h ${remainingMinutes}m ago`
    }

    // 24 hours or more: show days and hours
    const ageDays = Math.floor(ageHours / 24)
    const remainingHours = ageHours % 24
    return `${ageDays}d ${remainingHours}h ago`
  }

  return {
    now,
    formatAge
  }
}
