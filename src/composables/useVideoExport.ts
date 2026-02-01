import { ref, computed } from 'vue'
import {
  createExportJob,
  getJob,
  downloadFile,
  deleteJob,
  formatTimestamp,
  type Job
} from 'een-api-toolkit'

// Export status type
export type ExportStatus = 'idle' | 'exporting' | 'export_complete' | 'downloading' | 'complete' | 'error'

// Download result info
export interface DownloadInfo {
  filename: string
  size: number
  contentType: string
}

// Export parameters
export interface ExportParams {
  cameraId: string
  cameraName: string
  // Clip boundaries (from HLS player)
  clipStartTimestamp: string
  clipEndTimestamp: string
  // Event/alert timestamps (for centering the 10-min window)
  eventStartTimestamp: string
  eventEndTimestamp: string
  eventType: string
}

// Maximum export duration in milliseconds (10 minutes)
const MAX_EXPORT_DURATION_MS = 10 * 60 * 1000

// Singleton state - shared across all components
const status = ref<ExportStatus>('idle')
const jobId = ref<string | null>(null)
const job = ref<Job | null>(null)
const progress = ref(0)
const errorMessage = ref<string | null>(null)

// Export metadata for display
const cameraName = ref<string | null>(null)
const cameraId = ref<string | null>(null)
const startTimestamp = ref<string | null>(null)
const endTimestamp = ref<string | null>(null)
const eventType = ref<string | null>(null)

// Download result info
const downloadInfo = ref<DownloadInfo | null>(null)

// Track if video was clipped due to 10-minute limit
const wasClipped = ref(false)

// Polling interval
let pollInterval: ReturnType<typeof setInterval> | null = null

// Computed properties
const isActive = computed(() => status.value === 'exporting' || status.value === 'export_complete' || status.value === 'downloading')

// Computed: video duration in milliseconds based on timestamps
const videoDurationMs = computed(() => {
  if (!startTimestamp.value || !endTimestamp.value) return null
  const start = new Date(startTimestamp.value).getTime()
  const end = new Date(endTimestamp.value).getTime()
  return end - start
})
const progressPercent = computed(() => Math.round(progress.value * 100))

// Format timestamp for filename: yyyy-mm-dd hh:mm:ss
function formatTimestampForFilename(isoTimestamp: string | null): string {
  if (!isoTimestamp) return 'unknown'
  const date = new Date(isoTimestamp)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

// Generate download filename: "<camera id> - yyyy-mm-dd hh:mm:ss.mp4" or "<camera id> - yyyy-mm-dd hh:mm:ss clipped.mp4"
function generateDownloadFilename(): string {
  const camId = cameraId.value || 'unknown'
  const timestamp = formatTimestampForFilename(startTimestamp.value)
  const clippedSuffix = wasClipped.value ? ' clipped' : ''
  return `${camId} - ${timestamp}${clippedSuffix}.mp4`
}

// Calculate export timestamps with 10-minute maximum limit
// Returns { start, end, clipped } where clipped indicates if the video was truncated
function calculateExportTimestamps(params: ExportParams): { start: string; end: string; clipped: boolean } {
  const clipStartMs = new Date(params.clipStartTimestamp).getTime()
  const clipEndMs = new Date(params.clipEndTimestamp).getTime()
  const clipDurationMs = clipEndMs - clipStartMs

  // If clip is within 10 minutes, use full clip without modification
  if (clipDurationMs <= MAX_EXPORT_DURATION_MS) {
    return {
      start: params.clipStartTimestamp,
      end: params.clipEndTimestamp,
      clipped: false
    }
  }

  // Clip exceeds 10 minutes - calculate 10-min window centered on event midpoint
  const eventStartMs = new Date(params.eventStartTimestamp).getTime()
  const eventEndMs = new Date(params.eventEndTimestamp).getTime()
  const eventMidpointMs = (eventStartMs + eventEndMs) / 2

  // Calculate 10-minute window centered on event midpoint (5 min before, 5 min after)
  const halfWindow = MAX_EXPORT_DURATION_MS / 2
  let windowStartMs = eventMidpointMs - halfWindow
  let windowEndMs = eventMidpointMs + halfWindow

  // Constrain window to clip boundaries
  // If window extends before clip start, shift it forward
  if (windowStartMs < clipStartMs) {
    const shift = clipStartMs - windowStartMs
    windowStartMs = clipStartMs
    windowEndMs = Math.min(windowEndMs + shift, clipEndMs)
  }

  // If window extends after clip end, shift it backward
  if (windowEndMs > clipEndMs) {
    const shift = windowEndMs - clipEndMs
    windowEndMs = clipEndMs
    windowStartMs = Math.max(windowStartMs - shift, clipStartMs)
  }

  return {
    start: new Date(windowStartMs).toISOString(),
    end: new Date(windowEndMs).toISOString(),
    clipped: true
  }
}

// Stop polling
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval)
    pollInterval = null
  }
}

// Poll job status
async function pollJob() {
  if (!jobId.value) return

  const result = await getJob(jobId.value)

  if (result.error) {
    status.value = 'error'
    errorMessage.value = result.error.message
    stopPolling()
    return
  }

  job.value = result.data
  progress.value = result.data.progress || 0

  // Check terminal states
  if (result.data.state === 'success') {
    stopPolling()
    status.value = 'export_complete'
    // Small delay to show the export_complete state before downloading
    setTimeout(() => downloadExport(), 500)
  } else if (result.data.state === 'failure') {
    status.value = 'error'
    errorMessage.value = result.data.error || 'Export job failed'
    stopPolling()
  } else if (result.data.state === 'revoked') {
    status.value = 'error'
    errorMessage.value = 'Export job was revoked'
    stopPolling()
  }
}

// Download the exported file
async function downloadExport() {
  // Extract file URL from job result
  const fileUrl = job.value?.result?.intervals?.[0]?.files?.[0]?.url
  if (!fileUrl) {
    status.value = 'error'
    errorMessage.value = 'No file URL in job result'
    return
  }

  // Extract fileId from URL (last path segment)
  const fileId = fileUrl.substring(fileUrl.lastIndexOf('/') + 1)
  if (!fileId) {
    status.value = 'error'
    errorMessage.value = 'Could not extract file ID from URL'
    return
  }

  status.value = 'downloading'

  const result = await downloadFile(fileId)

  if (result.error) {
    status.value = 'error'
    errorMessage.value = result.error.message
    return
  }

  // Store download info with custom filename format
  downloadInfo.value = {
    filename: generateDownloadFilename(),
    size: result.data.size,
    contentType: result.data.contentType
  }

  // Create browser download
  const url = URL.createObjectURL(result.data.blob)
  const a = document.createElement('a')
  a.href = url
  a.download = downloadInfo.value.filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)

  // Set complete status (don't clear state so user can see results)
  status.value = 'complete'
}

// Start export
async function startExport(params: ExportParams): Promise<{ success: boolean; error?: string }> {
  // Check if already exporting
  if (isActive.value) {
    return { success: false, error: 'An export is already in progress' }
  }

  // Calculate export timestamps with 10-minute limit
  const exportTimestamps = calculateExportTimestamps(params)

  // Store metadata (use the actual export timestamps after clipping)
  cameraName.value = params.cameraName
  cameraId.value = params.cameraId
  startTimestamp.value = exportTimestamps.start
  endTimestamp.value = exportTimestamps.end
  eventType.value = params.eventType
  wasClipped.value = exportTimestamps.clipped

  // Reset state
  status.value = 'exporting'
  progress.value = 0
  errorMessage.value = null
  job.value = null
  downloadInfo.value = null

  // Create export job
  // Job name must be 1-64 characters, use compact format: "Export <cameraId> <timestamp>"
  const compactTimestamp = formatTimestampForFilename(exportTimestamps.start).replace(/[:\s]/g, '')
  const jobName = `Export ${params.cameraId} ${compactTimestamp}`.slice(0, 64)

  const result = await createExportJob({
    name: jobName,
    type: 'video',
    cameraId: params.cameraId,
    startTimestamp: formatTimestamp(exportTimestamps.start),
    endTimestamp: formatTimestamp(exportTimestamps.end)
  })

  if (result.error) {
    status.value = 'error'
    errorMessage.value = result.error.message
    return { success: false, error: result.error.message }
  }

  jobId.value = result.data.id
  job.value = result.data as Job

  // Start polling every 3 seconds
  pollInterval = setInterval(pollJob, 3000)

  return { success: true }
}

// Cancel export
async function cancelExport(): Promise<void> {
  stopPolling()

  if (jobId.value) {
    await deleteJob(jobId.value)
  }

  clearExport()
}

// Clear export state
function clearExport(): void {
  stopPolling()
  status.value = 'idle'
  jobId.value = null
  job.value = null
  progress.value = 0
  errorMessage.value = null
  cameraName.value = null
  cameraId.value = null
  startTimestamp.value = null
  endTimestamp.value = null
  eventType.value = null
  downloadInfo.value = null
  wasClipped.value = false
}

// Composable function (singleton pattern)
export function useVideoExport() {
  return {
    // State
    status,
    jobId,
    job,
    progress,
    progressPercent,
    errorMessage,
    cameraName,
    cameraId,
    startTimestamp,
    endTimestamp,
    eventType,
    downloadInfo,
    wasClipped,

    // Computed
    isActive,
    videoDurationMs,

    // Functions
    startExport,
    cancelExport,
    clearExport
  }
}
