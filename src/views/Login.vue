<script setup lang="ts">
import { getAuthUrl } from 'een-api-toolkit'

function login() {
  window.location.href = getAuthUrl()
}
</script>

<template>
  <div class="min-h-[calc(100vh-60px)] flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-md max-w-md w-full">
      <h2 class="text-2xl font-bold text-gray-800 mb-4">Login</h2>
      <p class="text-gray-600 mb-6">
        Click the button below to login with your Eagle Eye Networks account.
      </p>
      <button
        @click="login"
        class="w-full bg-een-primary text-white py-3 px-4 rounded-lg hover:opacity-90 transition-opacity"
      >
        Login with Eagle Eye Networks
      </button>
    </div>
  </div>
</template>
