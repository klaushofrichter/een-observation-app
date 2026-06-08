import { describe, it, expect } from 'vitest'
import { formatTimestamp } from './formatTime'

describe('formatTimestamp', () => {
  // Output is locale/timezone-dependent, so assert the HH:MM:SS shape
  // rather than an exact string (works for both 12h and 24h locales).
  it('formats an ISO timestamp as a clock time with hours, minutes and seconds', () => {
    expect(formatTimestamp('2026-06-08T22:30:45Z')).toMatch(/\d{1,2}:\d{2}:\d{2}/)
  })

  it('returns a non-empty string for a valid timestamp', () => {
    expect(formatTimestamp('2026-01-01T00:00:00Z').length).toBeGreaterThan(0)
  })
})
