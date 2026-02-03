# Event Type to Data Schemas Mapping

This document describes the mapping between Eagle Eye Networks event types and their associated data schemas. This mapping is used to dynamically build the `include` parameter when fetching events from the EEN API.

## Overview

When fetching events using the `listEvents` API, you can request additional event-specific data by using the `include` parameter. Each event type supports a specific set of data schemas. By knowing which schemas are supported by each event type, we can:

1. Only request relevant data schemas for the selected event types
2. Avoid requesting unnecessary data (reducing payload size)
3. Ensure we get all available data for the events we're interested in

## Usage

The `include` parameter values must be prefixed with `data.`. For example:
- Schema name: `een.objectDetection.v1`
- Include value: `data.een.objectDetection.v1`

### Code Usage

```typescript
import { getIncludeParameterForEventTypes } from '@/utils/eventDataSchemas'

// Get include values for selected event types
const selectedTypes = ['een.personDetectionEvent.v1', 'een.vehicleDetectionEvent.v1']
const includeValues = getIncludeParameterForEventTypes(selectedTypes)

// Result: ['data.een.objectDetection.v1', 'data.een.personAttributes.v1', ...]

// Use in API call
const result = await listEvents({
  type__in: selectedTypes,
  include: includeValues
})
```

## Event Type to Data Schemas Reference

### Detection Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.motionDetectionEvent.v1` | `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.displayOverlay.boundingBox.v1`, `een.fullFrameImageUrlWithOverlay.v1` |
| `een.motionInRegionDetectionEvent.v1` | `een.motionRegion.v1`, `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1` |
| `een.personDetectionEvent.v1` | `een.objectDetection.v1`, `een.personAttributes.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.objectClassification.v1`, `een.objectRegionMapping.v1`, `een.geoLocation.v1` |
| `een.animalDetectionEvent.v1` | `een.objectDetection.v1`, `een.animalAttributes.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.objectClassification.v1`, `een.objectRegionMapping.v1` |
| `een.faceDetectionEvent.v1` | `een.objectDetection.v1`, `een.personAttributes.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.objectClassification.v1`, `een.objectRegionMapping.v1` |
| `een.vehicleDetectionEvent.v1` | `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.objectClassification.v1`, `een.vehicleAttributes.v1`, `een.objectRegionMapping.v1` |
| `een.gunDetectionEvent.v1` | `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.motionRegion.v1`, `een.objectClassification.v1`, `een.personAttributes.v1`, `een.weaponAttributes.v1`, `een.humanValidationDetails.v1` |
| `een.fallDetectionEvent.v1` | `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1` |
| `een.fireDetectionEvent.v1` | `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.objectClassification.v1` |
| `een.spillDetectionEvent.v1` | `een.objectDetection.v1`, `een.objectClassification.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.displayOverlay.boundingBox.v1`, `een.fullFrameImageUrlWithOverlay.v1` |
| `een.crowdFormationDetectionEvent.v1` | `een.objectDetection.v1`, `een.objectClassification.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.displayOverlay.boundingBox.v1`, `een.fullFrameImageUrlWithOverlay.v1` |

### Camera Analytics Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.tamperDetectionEvent.v1` | `een.fullFrameImageUrl.v1` |
| `een.loiterDetectionEvent.v1` | `een.loiterArea.v1`, `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1` |
| `een.objectLineCrossEvent.v1` | `een.lineCrossLine.v1`, `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.entryDirection.v1` |
| `een.objectIntrusionEvent.v1` | `een.intrusionArea.v1`, `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.entryDirection.v1` |
| `een.objectRemovalEvent.v1` | `een.monitoredArea.v1`, `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1` |
| `een.personTailgateEvent.v1` | `een.objectDetection.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1` |
| `een.ppeViolationEvent.v1` | `een.objectDetection.v1`, `een.personAttributes.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.objectClassification.v1`, `een.objectRegionMapping.v1` |

### AI/Scene Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.sceneLabelEvent.v1` | `een.objectDetection.v1`, `een.personAttributes.v1`, `een.vehicleAttributes.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1`, `een.objectClassification.v1`, `een.objectRegionMapping.v1`, `een.eevaAttributes.v1`, `een.customLabels.v1` |
| `een.eevaQueryEvent.v1` | `een.eevaAttributes.v1`, `een.customLabels.v1` |

### License Plate & Fleet Recognition Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.lprPlateReadEvent.v1` | `een.lprDetection.v1`, `een.lprAccessType.v1`, `een.vehicleAttributes.v1`, `een.objectDetection.v1`, `een.userData.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1` |
| `een.fleetCodeRecognitionEvent.v1` | `een.objectDetection.v1`, `een.dotNumberRecognition.v1`, `een.truckNumberRecognition.v1`, `een.trailerNumberRecognition.v1`, `een.recognizedText.v1`, `een.croppedFrameImageUrl.v1`, `een.fullFrameImageUrl.v1` |

### Audio Detection Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.gunShotAudioDetectionEvent.v1` | `een.audioDetection.v1`, `een.geoLocation.v1` |
| `een.t3AlarmAudioDetectionEvent.v1` | `een.audioDetection.v1` |
| `een.t4AlarmAudioDetectionEvent.v1` | `een.audioDetection.v1` |

### POS (Point of Sale) Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.posTransactionEvent.v1` | `een.posTransactionStart.v1`, `een.posTransactionEnd.v1`, `een.posTransactionItem.v1`, `een.posTransactionPayment.v1`, `een.posTransactionCartChangeTrail.v1`, `een.posTransactionCardLoadSummary.v1`, `een.posTransactionFlag.v1`, `een.posTransactionLabel.v1` |

### Device & System Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.deviceCloudStatusUpdateEvent.v1` | `een.deviceCloudStatusUpdate.v1`, `een.deviceCloudPreviousStatus.v1` |
| `een.deviceIOEvent.v1` | `een.deviceIO.v1` |
| `een.deviceOperationEvent.v1` | `een.deviceOperationDetails.v1`, `een.deviceOperationSubStep.v1` |
| `een.ptzPositionUpdateEvent.v1` | `een.ptzPositionUpdate.v1` |

### Sensor Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.doorStatusEvent.v1` | `een.measurementStringValueUpdate.v1` |
| `een.batteryLevelUpdateEvent.v1` | `een.batteryLevelUpdate.v1` |
| `een.measurementThresholdStatusEvent.v1` | `een.measurementThresholdStatus.v1`, `een.measurementValueUpdate.v1` |
| `een.thermalCameraThresholdStatusEvent.v1` | `een.thermalCameraValueUpdate.v1`, `een.thermalMonitoredArea.v1` |

### Resource Management Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.layoutCreationEvent.v1` | `een.resourceDetails.v1` |
| `een.layoutUpdateEvent.v1` | `een.resourceDetails.v1` |
| `een.layoutDeletionEvent.v1` | `een.resourceDetails.v1` |
| `een.deviceCreationEvent.v1` | `een.resourceDetails.v1` |
| `een.deviceUpdateEvent.v1` | `een.resourceDetails.v1` |
| `een.deviceDeletionEvent.v1` | `een.resourceDetails.v1` |
| `een.userCreationEvent.v1` | `een.resourceDetails.v1` |
| `een.userUpdateEvent.v1` | `een.resourceDetails.v1` |
| `een.userDeletionEvent.v1` | `een.resourceDetails.v1` |
| `een.accountCreationEvent.v1` | `een.resourceDetails.v1` |
| `een.accountUpdateEvent.v1` | `een.resourceDetails.v1` |
| `een.accountDeletionEvent.v1` | `een.resourceDetails.v1` |

### Job Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.jobCreationEvent.v1` | `een.jobDetails.v1`, `een.ownerDetails.v1` |
| `een.jobUpdateEvent.v1` | `een.jobDetails.v1`, `een.ownerDetails.v1` |
| `een.jobDeletionEvent.v1` | `een.ownerDetails.v1` |

### Safety & Protocol Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.panicButtonEvent.v1` | `een.geoLocation.v1` |
| `een.evacuateProtocolEvent.v1` | *(none)* |
| `een.holdProtocolEvent.v1` | *(none)* |
| `een.lockdownProtocolEvent.v1` | *(none)* |
| `een.secureProtocolEvent.v1` | *(none)* |
| `een.shelterProtocolEvent.v1` | *(none)* |

### Behavioral Events

| Event Type | Data Schemas |
|------------|--------------|
| `een.violenceDetectionEvent.v1` | *(none)* |
| `een.fightDetectionEvent.v1` | *(none)* |
| `een.handsUpDetectionEvent.v1` | *(none)* |
| `een.vapeDetectionEvent.v1` | *(none)* |

## Common Data Schemas

These are the most commonly used data schemas across multiple event types:

| Schema | Description | Used By |
|--------|-------------|---------|
| `een.objectDetection.v1` | Bounding box and object tracking info | Most detection events |
| `een.objectClassification.v1` | Object class (person, vehicle, etc.) and confidence | Detection events with classification |
| `een.fullFrameImageUrl.v1` | URL to full-frame event image | Most camera events |
| `een.croppedFrameImageUrl.v1` | URL to cropped image of detected object | Detection events |
| `een.personAttributes.v1` | Person-specific attributes (clothing, gender) | Person detection events |
| `een.vehicleAttributes.v1` | Vehicle-specific attributes (make, model, color) | Vehicle detection events |
| `een.eevaAttributes.v1` | EEVA AI query and response attributes | Scene label and EEVA query events |
| `een.customLabels.v1` | Custom labels from AI analysis | Scene label and EEVA query events |

## Source

This mapping is derived from the Eagle Eye Networks API v3.0 specification:
- File: `api-v3-documentation/api/3.0/events.yaml`
- Section: `dataSchemas` within each event type example

## Maintenance

When new event types are added to the EEN API:
1. Check the `events.yaml` specification for the new event type
2. Find the `dataSchemas` array in the event example
3. Add the mapping to `src/utils/eventDataSchemas.ts`
4. Update this documentation
