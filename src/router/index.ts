import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from 'een-api-toolkit'
import { saveQueryToSession } from '@/utils/urlState'
import Home from '../views/Home.vue'
import Login from '../views/Login.vue'
import Callback from '../views/Callback.vue'
import Logout from '../views/Logout.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: Home,
      meta: { requiresAuth: true }
    },
    {
      path: '/login',
      name: 'login',
      component: Login
    },
    {
      path: '/callback',
      name: 'callback',
      component: Callback
    },
    {
      path: '/logout',
      name: 'logout',
      component: Logout
    },
    {
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

/**
 * Check if user is authenticated by checking both Pinia store and localStorage.
 * This is needed because the Pinia store may not be hydrated from localStorage
 * when the router guard runs during initial page load.
 */
function isAuthenticated(): boolean {
  // First check the Pinia store
  const authStore = useAuthStore()
  if (authStore.isAuthenticated) {
    return true
  }

  // Fallback: check localStorage directly for a valid token
  // This handles the case where the store hasn't hydrated yet
  const token = localStorage.getItem('een_token')
  const expiration = localStorage.getItem('een_tokenExpiration')

  if (token && expiration) {
    const expirationTime = parseInt(expiration, 10)
    // Check if token is not expired (with 60 second buffer)
    if (expirationTime > Date.now() + 60000) {
      return true
    }
  }

  return false
}

// Navigation guard for protected routes.
// Uses vue-router's return-value style (return a location to redirect, or
// undefined to allow) — the next() callback is deprecated as of vue-router 5.
router.beforeEach((to) => {
  // IMPORTANT: Check for OAuth callback FIRST, before auth check
  // EEN IDP redirects to root path with code and state params
  if (to.path === '/' && to.query.code && to.query.state) {
    return { name: 'callback', query: to.query }
  }

  // Handle URL parameters: persist them to sessionStorage so they survive the
  // OAuth redirect but not across sessions. Saving an empty query removes all keys.
  if (to.path === '/') {
    saveQueryToSession(to.query)
  }

  if (to.meta.requiresAuth && !isAuthenticated()) {
    return { name: 'login' }
  }

  // Otherwise allow navigation (implicit return undefined)
})

export default router
