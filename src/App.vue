<script setup lang="ts">
import { ref, computed, onMounted, watch, provide, onUnmounted } from 'vue'
import { useAuthStore, getCurrentUser } from 'een-api-toolkit'
import { useRoute } from 'vue-router'
import { useDarkMode } from '@/composables/useDarkMode'
import { useMute } from '@/composables/useMute'
import { useVideoExport } from '@/composables/useVideoExport'
import { useSseNotification, playNotificationSound } from '@/composables/useSseNotification'
import ExportStatusModal from '@/components/ExportStatusModal.vue'
import { version, dependencies } from '../package.json'
import QRCode from 'qrcode'

const toolkitVersion = dependencies['een-api-toolkit'].replace(/^\^|~/, '')

interface UserProfile {
  id: string
  email: string
  firstName?: string
  lastName?: string
}

const appName = ref('EEN Camera Observation App')
const authStore = useAuthStore()
const user = ref<UserProfile | null>(null)
const route = useRoute()

// Dark mode
const { isDark, toggle: toggleDarkMode, setDark } = useDarkMode()

// Mute
const { isMuted, toggle: toggleMute, setMuted } = useMute()

// Video export state
const { status: exportStatus, progressPercent: exportProgress, isActive: exportIsActive } = useVideoExport()
const showExportModal = ref(false)

// SSE notification state
const { notification: sseNotification } = useSseNotification()

// Provide dark mode and mute state to child components
provide('isDark', isDark)
provide('isMuted', isMuted)

const isAuthenticated = computed(() => authStore.isAuthenticated)

// QR code hover popup state
const showQrPopup = ref(false)
let qrHoverTimer: ReturnType<typeof setTimeout> | null = null
const qrDataUrl = ref('')
const qrUrl = ref('')
const qrUrlCopied = ref(false)
const selectedCameraId = computed(() => route.query.selected as string | undefined)
const selectedEvents = computed(() => route.query.events as string | undefined)

let qrLeaveTimer: ReturnType<typeof setTimeout> | null = null
let qrCopyTimer: ReturnType<typeof setTimeout> | null = null

function clearQrHoverTimer() {
  if (qrHoverTimer) {
    clearTimeout(qrHoverTimer)
    qrHoverTimer = null
  }
}

function clearQrLeaveTimer() {
  if (qrLeaveTimer) {
    clearTimeout(qrLeaveTimer)
    qrLeaveTimer = null
  }
}

function scheduleQrClose() {
  qrLeaveTimer = setTimeout(() => {
    showQrPopup.value = false
    qrUrlCopied.value = false
  }, 300)
}

function onQrMouseEnter() {
  clearQrLeaveTimer()
  qrHoverTimer = setTimeout(() => {
    showQrPopup.value = true
  }, 1000)
}

function onQrMouseLeave() {
  clearQrHoverTimer()
  scheduleQrClose()
}

function onPopupMouseEnter() {
  clearQrLeaveTimer()
}

function onPopupMouseLeave() {
  scheduleQrClose()
}

function onQrClick() {
  showQrPopup.value = true
  copyQrUrl()
}

async function copyQrUrl() {
  if (!qrUrl.value) return
  await navigator.clipboard.writeText(qrUrl.value)
  qrUrlCopied.value = true
  if (qrCopyTimer) clearTimeout(qrCopyTimer)
  qrCopyTimer = setTimeout(() => { qrUrlCopied.value = false }, 2000)
}

// Generate QR code when token, selected camera, or event types change
watch([() => authStore.token, selectedCameraId, selectedEvents], async ([token, camId, events]) => {
  if (!token || !camId) {
    qrDataUrl.value = ''
    qrUrl.value = ''
    return
  }
  const ttl = authStore.tokenExpiration ? Math.floor(authStore.tokenExpiration / 1000) : 0
  let url = `eenobserve://view?token=${token}&cam=${camId}&base=${encodeURIComponent(authStore.baseUrl || '')}&ttl=${ttl}`
  if (events) url += `&events=${events}`
  if (url === qrUrl.value) return
  qrUrl.value = url
  qrDataUrl.value = await QRCode.toDataURL(url, { width: 300, margin: 2 })
}, { immediate: true })

// User info modal state
const showUserModal = ref(false)
const showToken = ref(false)
const tokenCopied = ref(false)
const baseUrlCopied = ref(false)

// Format token expiration time
const tokenExpirationFormatted = computed(() => {
  if (!authStore.tokenExpiration) return 'Unknown'
  const expDate = new Date(authStore.tokenExpiration)
  return expDate.toLocaleString()
})

// Time remaining until token expires
const tokenTimeRemaining = computed(() => {
  const expiresIn = authStore.tokenExpiresIn
  if (expiresIn <= 0) return 'Expired'
  const minutes = Math.floor(expiresIn / 60000)
  const seconds = Math.floor((expiresIn % 60000) / 1000)
  if (minutes > 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }
  return `${minutes}m ${seconds}s`
})

const tokenExpiryWarning = computed(() => authStore.tokenExpiresIn <= 0 || authStore.tokenExpiresIn < 3600000)

// Copy token to clipboard and show it
async function showAndCopyToken() {
  if (!authStore.token) return
  try {
    await navigator.clipboard.writeText(authStore.token)
    showToken.value = true
    tokenCopied.value = true
    setTimeout(() => {
      tokenCopied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy token:', err)
  }
}

// Copy base URL to clipboard (without https:// prefix)
async function copyBaseUrl() {
  if (!authStore.baseUrl) return
  try {
    const urlWithoutProtocol = authStore.baseUrl.replace(/^https?:\/\//, '')
    await navigator.clipboard.writeText(urlWithoutProtocol)
    baseUrlCopied.value = true
    setTimeout(() => {
      baseUrlCopied.value = false
    }, 2000)
  } catch (err) {
    console.error('Failed to copy base URL:', err)
  }
}

// Handle ESC key to close modal
function handleEscKey(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    showUserModal.value = false
  }
}

// Watch modal state to add/remove ESC key listener and reset token visibility
watch(showUserModal, (isOpen) => {
  if (isOpen) {
    document.addEventListener('keydown', handleEscKey)
  } else {
    document.removeEventListener('keydown', handleEscKey)
    showToken.value = false
  }
})

async function loadUser() {
  if (authStore.isAuthenticated) {
    const result = await getCurrentUser()
    if (!result.error) {
      user.value = result.data
    }
  } else {
    user.value = null
  }
}

onMounted(() => {
  // Initialize auth store from localStorage before loading user
  // This restores the session if a valid token exists
  authStore.initialize()
  loadUser()

  // Check for dark mode URL parameter (overrides localStorage)
  const urlDark = sessionStorage.getItem('een_url_dark')
  if (urlDark === '1') {
    setDark(true)
  } else if (urlDark === '0') {
    setDark(false)
  }

  // Listen for fullscreen changes
  document.addEventListener('fullscreenchange', onFullscreenChange)

  // Check for fullscreen URL parameter - read from both URL and sessionStorage
  // (sessionStorage may not be set yet if router guard hasn't run)
  const urlParams = new URLSearchParams(window.location.search)
  const urlFull = urlParams.get('full') || sessionStorage.getItem('een_url_full')
  if (urlFull === '1' && !document.fullscreenElement) {
    // Browsers require a real user gesture for fullscreen — show a prompt
    showFullscreenPrompt.value = true
  }

  // Check for mute URL parameter (overrides localStorage)
  const urlMute = sessionStorage.getItem('een_url_mute')
  if (urlMute === '1') {
    setMuted(true)
  } else if (urlMute === '0') {
    setMuted(false)
  }
})

onUnmounted(() => {
  document.removeEventListener('keydown', handleEscKey)
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  clearQrHoverTimer()
  clearQrLeaveTimer()
  if (qrCopyTimer) clearTimeout(qrCopyTimer)
})

watch(() => authStore.isAuthenticated, loadUser)

// Fullscreen toggle
const isFullscreen = ref(false)
const fullscreenButtonRef = ref<HTMLButtonElement | null>(null)
const showFullscreenPrompt = ref(false)

function enterFullscreenFromPrompt() {
  showFullscreenPrompt.value = false
  document.documentElement.requestFullscreen().catch((err) => {
    console.warn('[Fullscreen] requestFullscreen failed:', err)
  })
}

function dismissFullscreenPrompt() {
  showFullscreenPrompt.value = false
}

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen()
  } else {
    document.documentElement.requestFullscreen()
  }
}

function onFullscreenChange() {
  isFullscreen.value = !!document.fullscreenElement
}
</script>

<template>
  <div class="min-h-screen" :class="isDark ? 'bg-gray-900' : 'bg-gray-100'">
    <!-- Top Bar -->
    <header class="bg-een-primary text-white px-4 py-2 shadow-md relative">
      <div class="flex items-center justify-between">
        <!-- SSE Event Notification (centered) -->
        <Transition name="sse-notification">
          <div
            v-if="sseNotification.isVisible"
            class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 px-4 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap z-10"
            :class="[
              'bg-green-700 text-white',
              sseNotification.isFading ? 'opacity-0' : 'opacity-100'
            ]"
            style="transition: opacity 1s ease-out;"
          >
            {{ sseNotification.message }}
          </div>
        </Transition>
        <div class="flex items-center gap-2 text-xl font-semibold">
          <!-- Eye icon — fullscreen toggle -->
          <button
            ref="fullscreenButtonRef"
            @click="toggleFullscreen"
            class="hover:opacity-80 transition-opacity cursor-pointer"
            :title="isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" class="w-6 h-6">
              <path d="M16 6C8 6 2 16 2 16s6 10 14 10 14-10 14-10S24 6 16 6z" fill="#60a5fa" stroke="#3b82f6" stroke-width="1"/>
              <ellipse cx="16" cy="16" rx="7" ry="7" fill="white"/>
              <circle cx="16" cy="16" r="5" fill="#3b82f6"/>
              <circle cx="16" cy="16" r="2.5" fill="#1e3a8a"/>
              <circle cx="14" cy="14.5" r="1.2" fill="white" opacity="0.8"/>
            </svg>
          </button>
          <span :title="`Powered by een-api-toolkit v${toolkitVersion}`">{{ appName }}</span>
          <a
            href="https://github.com/klaushofrichter/een-observation-app"
            target="_blank"
            rel="noopener noreferrer"
            class="text-xs opacity-70 font-normal hover:opacity-100"
          >v{{ version }}</a>
        </div>
        <div class="flex items-center gap-1.5 text-sm">
          <!-- Export Status Icon (visible when export/download active) -->
          <button
            v-if="exportIsActive"
            @click="showExportModal = true"
            class="p-1.5 rounded-lg hover:bg-white/10 transition-colors relative"
            title="View export progress"
          >
            <!-- Spinning circle icon for exporting -->
            <svg
              v-if="exportStatus === 'exporting'"
              class="w-5 h-5 animate-spin"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            <!-- Bouncing download icon for downloading -->
            <svg
              v-else-if="exportStatus === 'downloading'"
              class="w-5 h-5 animate-bounce"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            <!-- Progress badge -->
            <span
              class="absolute -top-1 -right-1 text-[10px] font-bold bg-een-accent text-white rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1"
            >
              {{ exportProgress }}
            </span>
          </button>

          <!-- Mute Toggle -->
          <button
            @click="toggleMute(); isMuted || playNotificationSound()"
            class="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            :title="isMuted ? 'Sound is muted' : 'Sound is on'"
          >
            <!-- Speaker icon (shown when unmuted) -->
            <svg v-if="!isMuted" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9M11 5L6 9H2v6h4l5 4V5z" />
            </svg>
            <!-- Muted speaker icon (shown when muted) -->
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          </button>

          <!-- Dark Mode Toggle -->
          <button
            @click="toggleDarkMode"
            class="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <!-- Moon icon (shown in dark mode - indicates current state) -->
            <svg v-if="isDark" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
            <!-- Sun icon (shown in light mode - indicates current state) -->
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
          </button>

          <!-- QR Code for Mobile Companion (visible when camera selected) -->
          <div
            v-if="isAuthenticated && selectedCameraId"
            class="relative"
            @mouseenter="onQrMouseEnter"
            @mouseleave="onQrMouseLeave"
          >
            <div
              class="p-1.5 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
              title="Click or hover to show QR code"
              @click="onQrClick"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <rect x="7" y="2" width="10" height="20" rx="2" stroke-width="2" />
                <line x1="10" y1="18" x2="14" y2="18" stroke-width="2" stroke-linecap="round" />
              </svg>
            </div>
            <!-- QR Popup -->
            <Transition name="fade">
              <div
                v-if="showQrPopup && qrDataUrl"
                class="absolute right-0 top-full mt-2 z-50 rounded-lg shadow-xl p-4 flex flex-col items-center gap-3"
                :class="isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'"
                @mouseenter="onPopupMouseEnter"
                @mouseleave="onPopupMouseLeave"
              >
                <div class="flex items-center gap-2">
                  <span class="text-sm font-semibold whitespace-nowrap" :class="isDark ? 'text-white' : 'text-gray-800'">Mobile Companion</span>
                  <span class="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-orange-500 text-white">Experimental</span>
                  <button
                    class="p-0.5 rounded transition-colors"
                    :class="qrUrlCopied
                      ? 'text-green-500'
                      : isDark
                        ? 'text-gray-400 hover:text-gray-200'
                        : 'text-gray-400 hover:text-gray-600'"
                    :title="qrUrlCopied ? 'Copied!' : 'Copy URL'"
                    @click="copyQrUrl"
                  >
                    <svg v-if="!qrUrlCopied" class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <rect x="9" y="9" width="13" height="13" rx="2" stroke-width="2" />
                      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke-width="2" />
                    </svg>
                    <svg v-else class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
                <img :src="qrDataUrl" alt="QR Code" class="w-[200px] h-[200px] rounded" />
                <p class="text-xs text-center whitespace-nowrap" :class="isDark ? 'text-gray-400' : 'text-gray-500'">
                  Scan with iPhone camera to view live video
                </p>
                <p class="text-[10px] text-center whitespace-nowrap" :class="tokenExpiryWarning ? 'text-red-500' : isDark ? 'text-gray-500' : 'text-gray-400'">
                  Token valid for {{ tokenTimeRemaining }} (until {{ tokenExpirationFormatted }})
                </p>
              </div>
            </Transition>
          </div>

          <!-- Help link -->
          <a
            href="https://github.com/klaushofrichter/een-observation-app/blob/production/README.md"
            target="_blank"
            rel="noopener noreferrer"
            class="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            title="Help — open README"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </a>

          <template v-if="isAuthenticated && user">
            <button
              @click="showUserModal = true"
              class="hover:underline cursor-pointer"
              title="View user info and API details"
            >
              {{ user.firstName }} {{ user.lastName }}
            </button>
            <span class="opacity-50">|</span>
            <router-link to="/logout" class="hover:underline">Logout</router-link>
          </template>
          <template v-else-if="route.name !== 'login'">
            <router-link to="/login" class="hover:underline">Login</router-link>
          </template>
        </div>
      </div>
    </header>

    <!-- Main Content -->
    <main>
      <router-view />
    </main>

    <!-- User Info Modal -->
    <Teleport to="body">
      <div
        v-if="showUserModal && user"
        class="fixed inset-0 z-50 flex items-center justify-center"
        @click.self="showUserModal = false"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/50" @click="showUserModal = false" />

        <!-- Modal -->
        <div
          class="relative rounded-lg shadow-xl max-w-lg w-full mx-4"
          :class="isDark ? 'bg-gray-800' : 'bg-white'"
        >
          <!-- Header -->
          <div class="flex items-center justify-between p-4 border-b" :class="isDark ? 'border-gray-700' : 'border-gray-200'">
            <h3 class="text-lg font-semibold" :class="isDark ? 'text-white' : 'text-gray-800'">User Info</h3>
            <button
              @click="showUserModal = false"
              class="p-1 rounded transition-colors"
              :class="isDark ? 'hover:bg-gray-700 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-600'"
              title="Close (ESC)"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <!-- Content -->
          <div class="p-4 space-y-4">
            <!-- User Details -->
            <div class="space-y-2">
              <h4 class="text-sm font-medium" :class="isDark ? 'text-gray-300' : 'text-gray-600'">User Details</h4>
              <div class="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">Name:</span>
                <span :class="isDark ? 'text-white' : 'text-gray-800'">{{ user.firstName }} {{ user.lastName }}</span>
                <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">Email:</span>
                <span :class="isDark ? 'text-white' : 'text-gray-800'">{{ user.email }}</span>
                <span :class="isDark ? 'text-gray-400' : 'text-gray-500'">User ID:</span>
                <span class="font-mono text-xs" :class="isDark ? 'text-white' : 'text-gray-800'">{{ user.id }}</span>
              </div>
            </div>

            <!-- Base URL -->
            <div class="space-y-2">
              <h4 class="text-sm font-medium" :class="isDark ? 'text-gray-300' : 'text-gray-600'">Base URL</h4>
              <div class="flex items-center gap-2">
                <code
                  class="flex-1 px-2 py-1 rounded text-sm font-mono truncate"
                  :class="isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-100 text-gray-800'"
                >{{ authStore.baseUrl }}</code>
                <button
                  @click="copyBaseUrl"
                  class="p-1.5 rounded transition-colors flex-shrink-0"
                  :class="[
                    isDark ? 'hover:bg-gray-700' : 'hover:bg-gray-100',
                    baseUrlCopied ? (isDark ? 'text-green-400' : 'text-green-600') : (isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-gray-600')
                  ]"
                  :title="baseUrlCopied ? 'Copied!' : 'Copy Base URL'"
                >
                  <svg v-if="baseUrlCopied" class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" />
                  </svg>
                  <svg v-else class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
            </div>

            <!-- Access Token -->
            <div class="space-y-2">
              <h4 class="text-sm font-medium" :class="isDark ? 'text-gray-300' : 'text-gray-600'">Access Token</h4>
              <div class="flex items-center gap-2">
                <code
                  class="flex-1 px-2 py-1 rounded text-sm font-mono truncate"
                  :class="isDark ? 'bg-gray-900 text-gray-300' : 'bg-gray-100 text-gray-800'"
                >{{ showToken ? authStore.token : '••••••••••••••••••••••••••••••••' }}</code>
                <button
                  @click="showAndCopyToken"
                  class="px-2 py-1 rounded text-xs font-medium transition-colors flex-shrink-0"
                  :class="[
                    tokenCopied
                      ? (isDark ? 'bg-green-600 text-white' : 'bg-green-500 text-white')
                      : (isDark ? 'bg-blue-600 hover:bg-blue-500 text-white' : 'bg-blue-500 hover:bg-blue-600 text-white')
                  ]"
                >
                  {{ tokenCopied ? 'Copied!' : (showToken ? 'Copy' : 'Show & Copy') }}
                </button>
              </div>
              <div class="text-xs" :class="isDark ? 'text-gray-400' : 'text-gray-500'">
                <span>Expires: {{ tokenExpirationFormatted }}</span>
                <span class="mx-2">|</span>
                <span :class="authStore.tokenExpiresIn < 300000 ? 'text-orange-500' : ''">
                  Time remaining: {{ tokenTimeRemaining }}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- Export Status Modal -->
    <ExportStatusModal
      :show="showExportModal"
      @close="showExportModal = false"
    />

    <!-- Fullscreen Prompt Overlay -->
    <Teleport to="body">
      <div
        v-if="showFullscreenPrompt"
        class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60"
        @click="dismissFullscreenPrompt"
      >
        <div
          class="rounded-xl shadow-2xl p-6 text-center max-w-sm mx-4"
          :class="isDark ? 'bg-gray-800' : 'bg-white'"
          @click.stop
        >
          <svg class="w-12 h-12 mx-auto mb-3 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
          </svg>
          <p class="text-lg font-semibold mb-2" :class="isDark ? 'text-white' : 'text-gray-800'">Enter Fullscreen?</p>
          <p class="text-sm mb-4" :class="isDark ? 'text-gray-400' : 'text-gray-500'">The URL requested fullscreen mode. Click below to activate it.</p>
          <div class="flex gap-3 justify-center">
            <button
              @click="dismissFullscreenPrompt"
              class="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              :class="isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'"
            >
              Cancel
            </button>
            <button
              @click="enterFullscreenFromPrompt"
              class="px-4 py-2 rounded-lg text-sm font-medium text-white bg-blue-600 hover:bg-blue-500 transition-colors"
            >
              Go Fullscreen
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </div>
</template>

