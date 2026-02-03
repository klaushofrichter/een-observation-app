/**
 * Event Type to Data Schemas Mapping
 *
 * This module provides a mapping between EEN event types and their associated data schemas.
 * The mapping is derived from the Eagle Eye Networks API v3.0 events.yaml specification.
 *
 * When fetching events with the `include` parameter, you must prefix schemas with "data."
 * For example: "een.objectDetection.v1" becomes "data.een.objectDetection.v1"
 *
 * @see docs/EVENT-DATA-SCHEMAS.md for full documentation
 */

/**
 * Complete mapping of event types to their supported data schemas.
 * Each key is an event type (e.g., "een.motionDetectionEvent.v1")
 * and each value is an array of data schema names that can be included
 * when fetching that event type.
 */
export const EVENT_TYPE_DATA_SCHEMAS: Record<string, string[]> = {
  // Device & System Events
  'een.deviceCloudStatusUpdateEvent.v1': [
    'een.deviceCloudStatusUpdate.v1',
    'een.deviceCloudPreviousStatus.v1'
  ],

  // Motion Detection Events
  'een.motionDetectionEvent.v1': [
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.displayOverlay.boundingBox.v1',
    'een.fullFrameImageUrlWithOverlay.v1'
  ],

  'een.motionInRegionDetectionEvent.v1': [
    'een.motionRegion.v1',
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1'
  ],

  // License Plate Recognition Events
  'een.lprPlateReadEvent.v1': [
    'een.lprDetection.v1',
    'een.lprAccessType.v1',
    'een.vehicleAttributes.v1',
    'een.objectDetection.v1',
    'een.userData.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1'
  ],

  // Camera Analytics Events
  'een.tamperDetectionEvent.v1': [
    'een.fullFrameImageUrl.v1'
  ],

  'een.loiterDetectionEvent.v1': [
    'een.loiterArea.v1',
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1'
  ],

  'een.objectLineCrossEvent.v1': [
    'een.lineCrossLine.v1',
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.entryDirection.v1'
  ],

  'een.objectIntrusionEvent.v1': [
    'een.intrusionArea.v1',
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.entryDirection.v1'
  ],

  // POS (Point of Sale) Events
  'een.posTransactionEvent.v1': [
    'een.posTransactionStart.v1',
    'een.posTransactionEnd.v1',
    'een.posTransactionItem.v1',
    'een.posTransactionPayment.v1',
    'een.posTransactionCartChangeTrail.v1',
    'een.posTransactionCardLoadSummary.v1',
    'een.posTransactionFlag.v1',
    'een.posTransactionLabel.v1'
  ],

  // Behavioral Detection Events (no data schemas)
  'een.violenceDetectionEvent.v1': [],
  'een.fightDetectionEvent.v1': [],
  'een.handsUpDetectionEvent.v1': [],

  // Sensor Events
  'een.doorStatusEvent.v1': [
    'een.measurementStringValueUpdate.v1'
  ],

  'een.batteryLevelUpdateEvent.v1': [
    'een.batteryLevelUpdate.v1'
  ],

  'een.measurementThresholdStatusEvent.v1': [
    'een.measurementThresholdStatus.v1',
    'een.measurementValueUpdate.v1'
  ],

  // Object Detection Events
  'een.personDetectionEvent.v1': [
    'een.objectDetection.v1',
    'een.personAttributes.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.objectClassification.v1',
    'een.objectRegionMapping.v1',
    'een.geoLocation.v1'
  ],

  'een.animalDetectionEvent.v1': [
    'een.objectDetection.v1',
    'een.animalAttributes.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.objectClassification.v1',
    'een.objectRegionMapping.v1'
  ],

  'een.faceDetectionEvent.v1': [
    'een.objectDetection.v1',
    'een.personAttributes.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.objectClassification.v1',
    'een.objectRegionMapping.v1'
  ],

  'een.ppeViolationEvent.v1': [
    'een.objectDetection.v1',
    'een.personAttributes.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.objectClassification.v1',
    'een.objectRegionMapping.v1'
  ],

  'een.vehicleDetectionEvent.v1': [
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.objectClassification.v1',
    'een.vehicleAttributes.v1',
    'een.objectRegionMapping.v1'
  ],

  // Scene & AI Events
  'een.sceneLabelEvent.v1': [
    'een.objectDetection.v1',
    'een.personAttributes.v1',
    'een.vehicleAttributes.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.objectClassification.v1',
    'een.objectRegionMapping.v1',
    'een.eevaAttributes.v1',
    'een.customLabels.v1'
  ],

  'een.eevaQueryEvent.v1': [
    'een.eevaAttributes.v1',
    'een.customLabels.v1'
  ],

  // Gun Detection Events
  'een.gunDetectionEvent.v1': [
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.motionRegion.v1',
    'een.objectClassification.v1',
    'een.personAttributes.v1',
    'een.weaponAttributes.v1',
    'een.humanValidationDetails.v1'
  ],

  // Audio Detection Events
  'een.gunShotAudioDetectionEvent.v1': [
    'een.audioDetection.v1',
    'een.geoLocation.v1'
  ],

  'een.t3AlarmAudioDetectionEvent.v1': [
    'een.audioDetection.v1'
  ],

  'een.t4AlarmAudioDetectionEvent.v1': [
    'een.audioDetection.v1'
  ],

  // Resource Management Events (Layout, Device, User, Account)
  'een.layoutCreationEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.layoutUpdateEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.layoutDeletionEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.deviceCreationEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.deviceUpdateEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.deviceDeletionEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.userCreationEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.userUpdateEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.userDeletionEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.accountCreationEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.accountUpdateEvent.v1': [
    'een.resourceDetails.v1'
  ],

  'een.accountDeletionEvent.v1': [
    'een.resourceDetails.v1'
  ],

  // PTZ Events
  'een.ptzPositionUpdateEvent.v1': [
    'een.ptzPositionUpdate.v1'
  ],

  // Job Events
  'een.jobCreationEvent.v1': [
    'een.jobDetails.v1',
    'een.ownerDetails.v1'
  ],

  'een.jobUpdateEvent.v1': [
    'een.jobDetails.v1',
    'een.ownerDetails.v1'
  ],

  'een.jobDeletionEvent.v1': [
    'een.ownerDetails.v1'
  ],

  // Advanced Detection Events
  'een.objectRemovalEvent.v1': [
    'een.monitoredArea.v1',
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1'
  ],

  'een.fallDetectionEvent.v1': [
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1'
  ],

  'een.personTailgateEvent.v1': [
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1'
  ],

  // Device I/O Events
  'een.deviceIOEvent.v1': [
    'een.deviceIO.v1'
  ],

  'een.deviceOperationEvent.v1': [
    'een.deviceOperationDetails.v1',
    'een.deviceOperationSubStep.v1'
  ],

  // Thermal Camera Events
  'een.thermalCameraThresholdStatusEvent.v1': [
    'een.thermalCameraValueUpdate.v1',
    'een.thermalMonitoredArea.v1'
  ],

  // Safety Protocol Events (no data schemas)
  'een.evacuateProtocolEvent.v1': [],
  'een.holdProtocolEvent.v1': [],
  'een.lockdownProtocolEvent.v1': [],
  'een.secureProtocolEvent.v1': [],
  'een.shelterProtocolEvent.v1': [],

  // Panic Button Event
  'een.panicButtonEvent.v1': [
    'een.geoLocation.v1'
  ],

  // Vape Detection Event (no data schemas)
  'een.vapeDetectionEvent.v1': [],

  // Fleet Code Recognition Event
  'een.fleetCodeRecognitionEvent.v1': [
    'een.objectDetection.v1',
    'een.dotNumberRecognition.v1',
    'een.truckNumberRecognition.v1',
    'een.trailerNumberRecognition.v1',
    'een.recognizedText.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1'
  ],

  // Spill Detection Event
  'een.spillDetectionEvent.v1': [
    'een.objectDetection.v1',
    'een.objectClassification.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.displayOverlay.boundingBox.v1',
    'een.fullFrameImageUrlWithOverlay.v1'
  ],

  // Crowd Formation Detection Event
  'een.crowdFormationDetectionEvent.v1': [
    'een.objectDetection.v1',
    'een.objectClassification.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.displayOverlay.boundingBox.v1',
    'een.fullFrameImageUrlWithOverlay.v1'
  ],

  // Fire Detection Event
  'een.fireDetectionEvent.v1': [
    'een.objectDetection.v1',
    'een.croppedFrameImageUrl.v1',
    'een.fullFrameImageUrl.v1',
    'een.objectClassification.v1'
  ]
}

/**
 * Get the data schemas for a specific event type.
 * @param eventType - The event type (e.g., "een.motionDetectionEvent.v1")
 * @returns Array of data schema names, or empty array if event type is unknown
 */
export function getDataSchemasForEventType(eventType: string): string[] {
  return EVENT_TYPE_DATA_SCHEMAS[eventType] || []
}

/**
 * Get the combined, deduplicated data schemas for multiple event types.
 * Returns an array of schema names prefixed with "data." for use with the
 * listEvents API `include` parameter.
 *
 * @param eventTypes - Array of event types to get schemas for
 * @returns Array of unique schema names prefixed with "data." (e.g., "data.een.objectDetection.v1")
 */
export function getIncludeParameterForEventTypes(eventTypes: string[]): string[] {
  const schemasSet = new Set<string>()

  for (const eventType of eventTypes) {
    const schemas = EVENT_TYPE_DATA_SCHEMAS[eventType]
    if (schemas) {
      for (const schema of schemas) {
        schemasSet.add(schema)
      }
    }
  }

  // Convert to array and prefix with "data."
  return Array.from(schemasSet).map(schema => `data.${schema}`)
}

/**
 * Get all unique data schemas across all event types.
 * Useful for debugging or understanding the full scope of available schemas.
 *
 * @returns Array of all unique data schema names (without "data." prefix)
 */
export function getAllUniqueDataSchemas(): string[] {
  const schemasSet = new Set<string>()

  for (const schemas of Object.values(EVENT_TYPE_DATA_SCHEMAS)) {
    for (const schema of schemas) {
      schemasSet.add(schema)
    }
  }

  return Array.from(schemasSet).sort()
}

/**
 * Get all known event types.
 * @returns Array of all event type names
 */
export function getAllEventTypes(): string[] {
  return Object.keys(EVENT_TYPE_DATA_SCHEMAS).sort()
}
