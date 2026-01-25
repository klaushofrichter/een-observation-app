import { ref, watch } from 'vue'

// Dark mode state - persisted in localStorage
const isDark = ref(false)

// Initialize from localStorage
const stored = localStorage.getItem('een_dark_mode')
if (stored !== null) {
  isDark.value = stored === 'true'
}

// Watch for changes and persist
watch(isDark, (value) => {
  localStorage.setItem('een_dark_mode', String(value))
})

export function useDarkMode() {
  function toggle() {
    isDark.value = !isDark.value
  }

  function setDark(value: boolean) {
    isDark.value = value
  }

  return {
    isDark,
    toggle,
    setDark
  }
}
