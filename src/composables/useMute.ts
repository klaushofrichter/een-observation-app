import { ref, watch } from 'vue'

// Mute state - persisted in localStorage
const isMuted = ref(false)

// Initialize from localStorage
const stored = localStorage.getItem('een_mute')
if (stored !== null) {
  isMuted.value = stored === 'true'
}

// Watch for changes and persist
watch(isMuted, (value) => {
  localStorage.setItem('een_mute', String(value))
})

export function useMute() {
  function toggle() {
    isMuted.value = !isMuted.value
  }

  function setMuted(value: boolean) {
    isMuted.value = value
  }

  return {
    isMuted,
    toggle,
    setMuted
  }
}
