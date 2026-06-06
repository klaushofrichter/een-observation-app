<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { handleAuthCallback } from 'een-api-toolkit'
import { restoreQueryFromSession } from '@/utils/urlState'

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

  // Restore URL parameters saved before the OAuth redirect (includes mute, fixing #74)
  const restoredQuery = restoreQueryFromSession()
  router.push(restoredQuery ? { path: '/', query: restoredQuery } : '/')
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
