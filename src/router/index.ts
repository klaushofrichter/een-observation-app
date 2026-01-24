import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from 'een-api-toolkit'
import Home from '../views/Home.vue'
import Login from '../views/Login.vue'
import Callback from '../views/Callback.vue'
import Logout from '../views/Logout.vue'

const router = createRouter({
  history: createWebHistory(),
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

// Navigation guard for protected routes
router.beforeEach((to, _from, next) => {
  // IMPORTANT: Check for OAuth callback FIRST, before auth check
  // EEN IDP redirects to root path with code and state params
  if (to.path === '/' && to.query.code && to.query.state) {
    next({ name: 'callback', query: to.query })
    return
  }

  if (to.meta.requiresAuth && !isAuthenticated()) {
    next({ name: 'login' })
  } else {
    next()
  }
})

export default router
