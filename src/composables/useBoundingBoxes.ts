import type { Event, SSEEvent } from 'een-api-toolkit'

export interface BoundingBox {
  x: number      // Normalized 0-1 (left)
  y: number      // Normalized 0-1 (top)
  width: number  // Normalized 0-1
  height: number // Normalized 0-1
  label: string  // Object classification label
  objectId: string
}

interface ObjectDetectionData {
  type: 'een.objectDetection.v1'
  creatorId: string
  boundingBox: [number, number, number, number] // [x1, y1, x2, y2]
  objectId: string
}

interface ObjectClassificationData {
  type: 'een.objectClassification.v1'
  creatorId: string
  objectId: string
  label: string
  confidence?: number
}

type EventData = ObjectDetectionData | ObjectClassificationData | { type: string }

/**
 * Infer label from event type when classification data is not available
 */
function inferLabelFromEventType(eventType: string): string {
  const typeLower = eventType.toLowerCase()
  if (typeLower.includes('person')) return 'Person'
  if (typeLower.includes('vehicle')) return 'Vehicle'
  if (typeLower.includes('animal')) return 'Animal'
  if (typeLower.includes('motion')) return 'Motion'
  return 'Object'
}

/**
 * Extract bounding boxes from event data
 * Combines objectDetection (coordinates) with objectClassification (labels)
 * Falls back to inferring label from event type if classification is not available
 */
export function extractBoundingBoxes(event: Event | SSEEvent): BoundingBox[] {
  const boxes: BoundingBox[] = []

  if (!event.data || !Array.isArray(event.data)) {
    return boxes
  }

  // Build classification map: objectId -> label
  const classificationMap = new Map<string, string>()
  for (const dataItem of event.data as EventData[]) {
    if (dataItem.type === 'een.objectClassification.v1') {
      const classification = dataItem as ObjectClassificationData
      classificationMap.set(classification.objectId, classification.label)
    }
  }

  // Fallback label from event type
  const fallbackLabel = inferLabelFromEventType(event.type)

  // Extract bounding boxes and attach labels
  for (const dataItem of event.data as EventData[]) {
    if (dataItem.type === 'een.objectDetection.v1') {
      const detection = dataItem as ObjectDetectionData
      const [x1, y1, x2, y2] = detection.boundingBox

      boxes.push({
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1,
        label: classificationMap.get(detection.objectId) || fallbackLabel,
        objectId: detection.objectId
      })
    }
  }

  return boxes
}

/**
 * Check if an event has bounding box data
 */
export function hasBoundingBoxes(event: Event | SSEEvent): boolean {
  if (!event.data || !Array.isArray(event.data)) {
    return false
  }

  return event.data.some((d: EventData) => d.type === 'een.objectDetection.v1')
}
