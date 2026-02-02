<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { handleAuthCallback } from 'een-api-toolkit'

const router = useRouter()
const error = ref<string | null>(null)
const processing = ref(true)

onMounted(async () => {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const errorParam = url.searchParams.get('error')

  if (errorParam) {
    error.value = `OAuth error: ${errorParam}`
    processing.value = false
    return
  }

  if (!code || !state) {
    error.value = 'Missing authorization code or state parameter'
    processing.value = false
    return
  }

  const result = await handleAuthCallback(code, state)

  if (result.error) {
    error.value = result.error.message
    processing.value = false
    return
  }

  // Restore URL parameters from sessionStorage if they were set before OAuth redirect
  const storedCameraIds = sessionStorage.getItem('een_url_camera_ids')
  const storedSelected = sessionStorage.getItem('een_url_selected')
  const storedEvents = sessionStorage.getItem('een_url_events')
  const storedEd = sessionStorage.getItem('een_url_ed')
  const storedAd = sessionStorage.getItem('een_url_ad')
  const storedEr = sessionStorage.getItem('een_url_er')
  const storedAr = sessionStorage.getItem('een_url_ar')
  const storedLive = sessionStorage.getItem('een_url_live')
  const storedFilter = sessionStorage.getItem('een_url_filter')
  const storedDark = sessionStorage.getItem('een_url_dark')

  if (storedCameraIds || storedSelected || storedEvents || storedEd || storedAd || storedEr || storedAr || storedLive || storedFilter || storedDark) {
    const query: Record<string, string> = {}
    if (storedCameraIds) query.id = storedCameraIds
    if (storedSelected) query.selected = storedSelected
    if (storedEvents) query.events = storedEvents
    if (storedEd) query.ed = storedEd
    if (storedAd) query.ad = storedAd
    if (storedEr) query.er = storedEr
    if (storedAr) query.ar = storedAr
    if (storedLive) query.live = storedLive
    if (storedFilter) query.filter = storedFilter
    if (storedDark) query.dark = storedDark
    router.push({ path: '/', query })
  } else {
    router.push('/')
  }
})
</script>

<template>
  <div class="min-h-[calc(100vh-60px)] flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
      <div v-if="processing">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Authenticating...</h2>
        <p class="text-gray-600">Please wait while we complete the login process.</p>
        <div class="mt-4">
          <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-een-primary mx-auto"></div>
        </div>
      </div>

      <div v-else-if="error">
        <h2 class="text-xl font-semibold text-red-600 mb-4">Authentication Failed</h2>
        <p class="text-gray-600 mb-6">{{ error }}</p>
        <router-link to="/login">
          <button class="bg-een-primary text-white py-2 px-4 rounded hover:opacity-90">
            Try Again
          </button>
        </router-link>
      </div>
    </div>
  </div>
</template>
