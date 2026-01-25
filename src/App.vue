<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAuthStore, getCurrentUser } from 'een-api-toolkit'
import { useRoute } from 'vue-router'

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
  <div class="min-h-screen bg-gray-100">
    <!-- Top Bar -->
    <header class="bg-een-primary text-white px-4 py-3 shadow-md">
      <div class="flex items-center justify-between">
        <router-link to="/" class="text-xl font-semibold hover:opacity-90">
          {{ appName }}
        </router-link>
        <div class="text-sm">
          <template v-if="isAuthenticated && user">
            <span>{{ user.firstName }} {{ user.lastName }}</span>
            <span class="mx-2 opacity-50">|</span>
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
