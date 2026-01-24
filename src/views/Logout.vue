<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { revokeToken } from 'een-api-toolkit'

const router = useRouter()
const processing = ref(true)

onMounted(async () => {
  const result = await revokeToken()

  if (result.error) {
    console.warn('Token revocation warning:', result.error.message)
  }

  processing.value = false

  setTimeout(() => {
    router.push('/login')
  }, 1500)
})
</script>

<template>
  <div class="min-h-[calc(100vh-60px)] flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full text-center">
      <div v-if="processing">
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Logging out...</h2>
        <p class="text-gray-600">Please wait.</p>
      </div>

      <div v-else>
        <h2 class="text-xl font-semibold text-gray-800 mb-4">Logged Out</h2>
        <p class="text-gray-600">You have been successfully logged out.</p>
        <p class="text-gray-500 mt-4 text-sm">Redirecting to login page...</p>
      </div>
    </div>
  </div>
</template>
