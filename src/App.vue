<script setup lang="ts">
import { ref, computed, onMounted, watch, provide } from 'vue'
import { useAuthStore, getCurrentUser } from 'een-api-toolkit'
import { useRoute } from 'vue-router'
import { useDarkMode } from '@/composables/useDarkMode'

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
const { isDark, toggle: toggleDarkMode } = useDarkMode()

// Provide dark mode state to child components
provide('isDark', isDark)

const isAuthenticated = computed(() => authStore.isAuthenticated)

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
})

watch(() => authStore.isAuthenticated, loadUser)
</script>

<template>
  <div class="min-h-screen" :class="isDark ? 'bg-gray-900' : 'bg-gray-100'">
    <!-- Top Bar -->
    <header class="bg-een-primary text-white px-4 py-3 shadow-md">
      <div class="flex items-center justify-between">
        <a
          href="https://github.com/klaushofrichter/een-observation-app"
          target="_blank"
          rel="noopener noreferrer"
          class="text-xl font-semibold hover:opacity-90"
        >
          {{ appName }}
        </a>
        <div class="flex items-center gap-4 text-sm">
          <!-- Dark Mode Toggle -->
          <button
            @click="toggleDarkMode"
            class="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            :title="isDark ? 'Switch to light mode' : 'Switch to dark mode'"
          >
            <!-- Sun icon (shown in dark mode) -->
            <svg v-if="isDark" class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
            </svg>
            <!-- Moon icon (shown in light mode) -->
            <svg v-else class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
            </svg>
          </button>

          <template v-if="isAuthenticated && user">
            <span>{{ user.firstName }} {{ user.lastName }}</span>
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
  </div>
</template>
