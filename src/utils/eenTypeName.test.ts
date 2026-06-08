import { describe, it, expect } from 'vitest'
import { humanizeEenType } from './eenTypeName'

describe('humanizeEenType', () => {
  it('humanizes a multi-word Event type', () => {
    expect(humanizeEenType('een.motionDetectionEvent.v1')).toBe('Motion Detection')
  })

  it('humanizes the equivalent Alert type identically', () => {
    expect(humanizeEenType('een.motionDetectionAlert.v1')).toBe('Motion Detection')
  })

  it('handles a single-word type', () => {
    expect(humanizeEenType('een.motionAlert.v1')).toBe('Motion')
  })

  it('ignores the version suffix', () => {
    expect(humanizeEenType('een.personDetectionEvent.v2')).toBe('Person Detection')
    expect(humanizeEenType('een.personDetectionEvent.v10')).toBe('Person Detection')
  })

  it('falls back to the raw string when it does not match the pattern', () => {
    expect(humanizeEenType('not-an-een-type')).toBe('not-an-een-type')
    expect(humanizeEenType('')).toBe('')
  })
})
