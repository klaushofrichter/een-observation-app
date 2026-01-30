import { ref, watch } from 'vue'

// Dark mode state - persisted in localStorage
const isDark = ref(false)

// Apply dark class to document element
function applyDarkClass(value: boolean) {
  if (value) {
    document.documentElement.classList.add('dark')
  } else {
    document.documentElement.classList.remove('dark')
  }
}

// Initialize from localStorage
const stored = localStorage.getItem('een_dark_mode')
if (stored !== null) {
  isDark.value = stored === 'true'
  applyDarkClass(isDark.value)
}

// Watch for changes and persist
watch(isDark, (value) => {
  localStorage.setItem('een_dark_mode', String(value))
  applyDarkClass(value)
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
