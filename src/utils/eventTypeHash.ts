/**
 * Utility for creating short URL-safe hashes of event types.
 * Uses 3-character base62 encoding which is unique for all 67 EEN event types.
 */

const CHARS = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'

/**
 * Generate a 3-character hash from an event type string.
 * Uses DJB2 hash algorithm converted to base62.
 */
export function hashEventType(eventType: string): string {
  let hash = 5381
  for (let i = 0; i < eventType.length; i++) {
    hash = ((hash << 5) + hash + eventType.charCodeAt(i)) >>> 0
  }
  let result = ''
  for (let i = 0; i < 3; i++) {
    result += CHARS[hash % 62]
    hash = Math.floor(hash / 62)
  }
  return result
}

/**
 * Build a reverse lookup map from hashes to event types.
 * Call this once with the available event types to enable reverse lookup.
 */
export function buildHashLookup(eventTypes: string[]): Map<string, string> {
  const lookup = new Map<string, string>()
  for (const type of eventTypes) {
    lookup.set(hashEventType(type), type)
  }
  return lookup
}

/**
 * Convert an array of event types to a comma-separated hash string for URL.
 */
export function eventTypesToHashString(eventTypes: string[]): string {
  return eventTypes.map(hashEventType).join(',')
}

/**
 * Convert a comma-separated hash string from URL to event types.
 * Returns only event types that exist in the lookup map.
 */
export function hashStringToEventTypes(hashString: string, lookup: Map<string, string>): string[] {
  if (!hashString) return []
  const hashes = hashString.split(',').map(h => h.trim()).filter(h => h.length > 0)
  const eventTypes: string[] = []
  for (const hash of hashes) {
    const eventType = lookup.get(hash)
    if (eventType) {
      eventTypes.push(eventType)
    }
  }
  return eventTypes
}
