import { ref, nextTick, onUnmounted, type Ref } from 'vue'
import { listMedia, formatTimestamp, initMediaSession, useAuthStore } from 'een-api-toolkit'
import Hls from 'hls.js'

const SEARCH_WINDOW_MS = 60 * 60 * 1000 // 1 hour search window

export interface HlsPlayerReturn {
  videoUrl: Ref<string | null>
  videoError: Ref<string | null>
  loadingVideo: Ref<boolean>
  videoRef: Ref<HTMLVideoElement | null>
  loadVideo: (deviceId: string, timestamp: string) => Promise<void>
  resetVideo: () => void
  destroyHls: () => void
  seekToEventStart: () => void
}

export function useHlsPlayer(): HlsPlayerReturn {
  const authStore = useAuthStore()

  // State
  const videoUrl = ref<string | null>(null)
  const videoError = ref<string | null>(null)
  const loadingVideo = ref(false)
  const videoRef = ref<HTMLVideoElement | null>(null)

  let hlsInstance: Hls | null = null
  let mediaSessionInitialized = false
  let seekOffsetSeconds = 0 // Offset to seek to after manifest loads

  // Initialize media session (required for some HLS configurations)
  async function ensureMediaSession(): Promise<boolean> {
    if (mediaSessionInitialized) return true

    const result = await initMediaSession()
    if (result.error) {
      videoError.value = `Media session error: ${result.error.message}`
      return false
    }
    mediaSessionInitialized = true
    return true
  }

  function destroyHls() {
    if (hlsInstance) {
      hlsInstance.destroy()
      hlsInstance = null
    }
  }

  function initHls() {
    if (!videoUrl.value || !videoRef.value) return

    destroyHls()

    if (!Hls.isSupported()) {
      videoError.value = 'HLS is not supported in this browser'
      return
    }

    // Configure hls.js to send Authorization header
    hlsInstance = new Hls({
      xhrSetup: (xhr) => {
        xhr.setRequestHeader('Authorization', `Bearer ${authStore.token}`)
      }
    })

    hlsInstance.loadSource(videoUrl.value)
    hlsInstance.attachMedia(videoRef.value)

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      // Seek to the target timestamp offset if specified
      if (videoRef.value && seekOffsetSeconds > 0) {
        videoRef.value.currentTime = seekOffsetSeconds
      }
      videoRef.value?.play().catch(() => {
        // Autoplay may be blocked by browser
      })
    })

    hlsInstance.on(Hls.Events.ERROR, (_, data) => {
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            if (data.response?.code === 401) {
              videoError.value = 'Authentication expired. Please refresh.'
            } else {
              videoError.value = `Network error: ${data.details}`
            }
            break
          case Hls.ErrorTypes.MEDIA_ERROR:
            hlsInstance?.recoverMediaError()
            break
          default:
            videoError.value = `HLS error: ${data.details}`
            destroyHls()
        }
      }
    })
  }

  async function loadVideo(deviceId: string, timestamp: string): Promise<void> {
    loadingVideo.value = true
    videoError.value = null
    videoUrl.value = null

    // Initialize media session
    const sessionOk = await ensureMediaSession()
    if (!sessionOk) {
      loadingVideo.value = false
      return
    }

    // Search for recordings around the target timestamp
    const targetTime = new Date(timestamp)
    const searchStartTime = new Date(targetTime.getTime() - SEARCH_WINDOW_MS)
    const searchEndTime = new Date(targetTime.getTime() + SEARCH_WINDOW_MS)

    const result = await listMedia({
      deviceId,
      type: 'main',
      mediaType: 'video',
      startTimestamp: formatTimestamp(searchStartTime.toISOString()),
      endTimestamp: formatTimestamp(searchEndTime.toISOString()),
      include: ['hlsUrl'],
      pageSize: 100
    })

    if (result.error) {
      videoError.value = result.error.message
      loadingVideo.value = false
      return
    }

    const intervals = result.data?.results ?? []
    const targetTimeMs = targetTime.getTime()

    // Find interval containing the target timestamp
    const interval = intervals.find(i => {
      if (!i.hlsUrl) return false
      const intervalStart = new Date(i.startTimestamp).getTime()
      const intervalEnd = new Date(i.endTimestamp).getTime()
      return targetTimeMs >= intervalStart && targetTimeMs <= intervalEnd
    })

    if (!interval?.hlsUrl) {
      if (intervals.length === 0) {
        videoError.value = 'No recordings found for this time range'
      } else {
        videoError.value = 'No recording contains the target timestamp'
      }
      loadingVideo.value = false
      return
    }

    // Calculate seek offset from interval start to target timestamp
    const intervalStartMs = new Date(interval.startTimestamp).getTime()
    seekOffsetSeconds = Math.max(0, (targetTimeMs - intervalStartMs) / 1000)

    videoUrl.value = interval.hlsUrl
    loadingVideo.value = false

    // Initialize HLS.js after DOM updates
    await nextTick()
    initHls()
  }

  function resetVideo() {
    destroyHls()
    videoUrl.value = null
    videoError.value = null
    loadingVideo.value = false
    seekOffsetSeconds = 0
  }

  // Seek back to the original event timestamp
  function seekToEventStart() {
    if (videoRef.value && seekOffsetSeconds >= 0) {
      videoRef.value.currentTime = seekOffsetSeconds
    }
  }

  onUnmounted(() => {
    destroyHls()
  })

  return {
    videoUrl,
    videoError,
    loadingVideo,
    videoRef,
    loadVideo,
    resetVideo,
    destroyHls,
    seekToEventStart
  }
}
