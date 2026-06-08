// Format an ISO timestamp as a local clock time (HH:MM:SS) for list display.
// Named distinctly from een-api-toolkit's `formatTimestamp` (which produces an
// EEN API timestamp) to avoid an import collision with different semantics.
export function formatClockTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}
