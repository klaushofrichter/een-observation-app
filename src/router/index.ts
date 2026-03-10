import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from 'een-api-toolkit'
import { clearUrlSessionStorage } from '@/utils/clearUrlSessionStorage'
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

// Navigation guard for protected routes
router.beforeEach((to, _from, next) => {
  // IMPORTANT: Check for OAuth callback FIRST, before auth check
  // EEN IDP redirects to root path with code and state params
  if (to.path === '/' && to.query.code && to.query.state) {
    next({ name: 'callback', query: to.query })
    return
  }

  // Handle URL parameters
  // Store them in sessionStorage so they persist through the OAuth flow but not across sessions
  if (to.path === '/') {
    // When navigating with no URL parameters, clear all stored URL parameters
    if (Object.keys(to.query).length === 0) {
      clearUrlSessionStorage()
    }

    if (to.query.id) {
      // Store camera IDs from URL
      sessionStorage.setItem('een_url_camera_ids', to.query.id as string)
    } else {
      // Clear stored camera IDs when accessing without ?id parameter
      sessionStorage.removeItem('een_url_camera_ids')
    }

    // Store selected camera ID
    if (to.query.selected) {
      sessionStorage.setItem('een_url_selected', to.query.selected as string)
    } else {
      sessionStorage.removeItem('een_url_selected')
    }

    // Store event type hashes
    if (to.query.events) {
      sessionStorage.setItem('een_url_events', to.query.events as string)
    } else {
      sessionStorage.removeItem('een_url_events')
    }

    // Store events duration (ed)
    if (to.query.ed) {
      sessionStorage.setItem('een_url_ed', to.query.ed as string)
    } else {
      sessionStorage.removeItem('een_url_ed')
    }

    // Store alerts duration (ad)
    if (to.query.ad) {
      sessionStorage.setItem('een_url_ad', to.query.ad as string)
    } else {
      sessionStorage.removeItem('een_url_ad')
    }

    // Store events auto-refresh (er)
    if (to.query.er) {
      sessionStorage.setItem('een_url_er', to.query.er as string)
    } else {
      sessionStorage.removeItem('een_url_er')
    }

    // Store alerts auto-refresh (ar)
    if (to.query.ar) {
      sessionStorage.setItem('een_url_ar', to.query.ar as string)
    } else {
      sessionStorage.removeItem('een_url_ar')
    }

    // Store live events toggle (live)
    if (to.query.live) {
      sessionStorage.setItem('een_url_live', to.query.live as string)
    } else {
      sessionStorage.removeItem('een_url_live')
    }

    // Store event filter for alerts (filter)
    if (to.query.filter) {
      sessionStorage.setItem('een_url_filter', to.query.filter as string)
    } else {
      sessionStorage.removeItem('een_url_filter')
    }

    // Store dark mode (dark)
    if (to.query.dark !== undefined) {
      sessionStorage.setItem('een_url_dark', to.query.dark as string)
    } else {
      sessionStorage.removeItem('een_url_dark')
    }

    // Store mute (mute)
    if (to.query.mute !== undefined) {
      sessionStorage.setItem('een_url_mute', to.query.mute as string)
    } else {
      sessionStorage.removeItem('een_url_mute')
    }

    // Store fullscreen (full)
    if (to.query.full !== undefined) {
      sessionStorage.setItem('een_url_full', to.query.full as string)
    } else {
      sessionStorage.removeItem('een_url_full')
    }
  }

  if (to.meta.requiresAuth && !isAuthenticated()) {
    next({ name: 'login' })
  } else {
    next()
  }
})

export default router
