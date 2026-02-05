import { ref } from 'vue'
import { getRecordedImage } from 'een-api-toolkit'

// LRU Cache for thumbnail images
class LRUImageCache {
  private cache = new Map<string, string>()
  private readonly maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  private makeKey(cameraId: string, timestamp: string): string {
    return `${cameraId}:${timestamp}`
  }

  get(cameraId: string, timestamp: string): string | undefined {
    const key = this.makeKey(cameraId, timestamp)
    const value = this.cache.get(key)
    if (value !== undefined) {
      // Move to end (most recently used)
      this.cache.delete(key)
      this.cache.set(key, value)
    }
    return value
  }

  set(cameraId: string, timestamp: string, imageData: string): void {
    const key = this.makeKey(cameraId, timestamp)
    // Remove if exists to update position
    if (this.cache.has(key)) {
      this.cache.delete(key)
    }
    // Evict oldest if at capacity
    while (this.cache.size >= this.maxSize) {
      const oldestKey = this.cache.keys().next().value
      if (oldestKey) this.cache.delete(oldestKey)
    }
    this.cache.set(key, imageData)
  }

  has(cameraId: string, timestamp: string): boolean {
    return this.cache.has(this.makeKey(cameraId, timestamp))
  }

  get size(): number {
    return this.cache.size
  }
}

// Singleton cache instance (shared across all components)
const imageCache = new LRUImageCache(250)

// Track images currently being loaded to prevent duplicate requests
// Maps loadKey to a promise so other callers can await the same request
const loadingImages = new Map<string, Promise<string | null>>()

export function useImageCache() {
  // Local reactive state for component-specific image mapping
  // Using a plain object for better Vue reactivity
  const images = ref<Record<string, string>>({})

  async function loadImage(eventId: string, cameraId: string, timestamp: string): Promise<string | null> {
    // Already have this image in local state
    if (images.value[eventId]) {
      return images.value[eventId]
    }

    // Check LRU cache
    const cachedImage = imageCache.get(cameraId, timestamp)
    if (cachedImage) {
      images.value[eventId] = cachedImage
      return cachedImage
    }

    // Check if already loading - await the in-flight request then use cache
    const loadKey = `${cameraId}:${timestamp}`
    const existingRequest = loadingImages.get(loadKey)
    if (existingRequest) {
      await existingRequest
      const cachedAfterWait = imageCache.get(cameraId, timestamp)
      if (cachedAfterWait) {
        images.value[eventId] = cachedAfterWait
        return cachedAfterWait
      }
      return null
    }

    const request = (async (): Promise<string | null> => {
      try {
        const result = await getRecordedImage({
          deviceId: cameraId,
          type: 'preview',
          timestamp__gte: timestamp,
          targetWidth: 384
        })

        if (!result.error && result.data) {
          // Store in LRU cache and local state
          imageCache.set(cameraId, timestamp, result.data.imageData)
          images.value[eventId] = result.data.imageData
          return result.data.imageData
        }
      } finally {
        loadingImages.delete(loadKey)
      }

      return null
    })()

    loadingImages.set(loadKey, request)
    return request
  }

  function getImage(eventId: string): string | null {
    return images.value[eventId] || null
  }

  function clearImages(): void {
    images.value = {}
  }

  return {
    images,
    loadImage,
    getImage,
    clearImages,
    cacheSize: () => imageCache.size
  }
}
