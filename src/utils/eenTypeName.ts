// Derive a human-readable label from an EEN event/alert type string.
// e.g. "een.motionDetectionEvent.v1" / "een.motionDetectionAlert.v1" -> "Motion Detection"
// Falls back to the raw type string when it doesn't match the expected pattern.
const EEN_TYPE_PATTERN = /een\.(\w+)(?:Event|Alert)\.v\d+/

export function humanizeEenType(type: string): string {
  const match = type.match(EEN_TYPE_PATTERN)
  if (match) {
    return match[1]
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim()
  }
  return type
}
