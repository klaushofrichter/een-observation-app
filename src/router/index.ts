import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from 'een-api-toolkit'
import { clearUrlSessionStorage } from '@/utils/clearUrlSessionStorage'
import { getLabsConfig, LABS_PRODUCT_SLUG } from '@/labs/config'
import Home from '../views/Home.vue'

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
      path: '/:pathMatch(.*)*',
      redirect: '/'
    }
  ]
})

/**
 * Auth check: Pinia store first, then a localStorage fallback for the
 * window before the store hydrates. setToken() (called during bootstrap)
 * writes these same keys.
 */
function isAuthenticated(): boolean {
  const authStore = useAuthStore()
  if (authStore.isAuthenticated) return true

  const token = localStorage.getItem('een_token')
  const expiration = localStorage.getItem('een_tokenExpiration')
  if (token && expiration) {
    const expirationTime = parseInt(expiration, 10)
    if (expirationTime > Date.now() + 60000) return true
  }
  return false
}

/** Labs owns login; send unauthenticated users to the Labs product page. */
function redirectToProductPage(): void {
  const { labsBase } = getLabsConfig()
  window.location.href = `${labsBase}/product/${LABS_PRODUCT_SLUG}`
}

router.beforeEach((to, _from, next) => {
  // Persist in-app URL state through navigation (still used by the app).
  if (to.path === '/') {
    if (Object.keys(to.query).length === 0) {
      clearUrlSessionStorage()
    }
    const map: Record<string, string> = {
      id: 'een_url_camera_ids',
      selected: 'een_url_selected',
      events: 'een_url_events',
      ed: 'een_url_ed',
      ad: 'een_url_ad',
      er: 'een_url_er',
      ar: 'een_url_ar',
      live: 'een_url_live',
      filter: 'een_url_filter',
      dark: 'een_url_dark',
      mute: 'een_url_mute',
      full: 'een_url_full'
    }
    for (const [param, key] of Object.entries(map)) {
      if (to.query[param] !== undefined) {
        sessionStorage.setItem(key, to.query[param] as string)
      } else {
        sessionStorage.removeItem(key)
      }
    }
  }

  if (to.meta.requiresAuth && !isAuthenticated()) {
    redirectToProductPage()
    return
  }
  next()
})

export default router
