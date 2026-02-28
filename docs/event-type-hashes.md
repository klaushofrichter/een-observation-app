# Event Type URL Hashes

This document lists all Eagle Eye Networks event types and their corresponding 3-character URL hashes used in the `events` query parameter.

## Hash Algorithm

The hash is generated using the DJB2 algorithm, converted to base62 encoding (0-9, a-z, A-Z) for URL-safe representation:

```typescript
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
```

## Event Type Hash Table

| Hash | Event Name | Event Type |
|------|------------|------------|
| oxa | Access Activation | een.accessActivationEvent.v1 |
| sMI | Account Creation | een.accountCreationEvent.v1 |
| xDo | Account Deletion | een.accountDeletionEvent.v1 |
| KYp | Account Update | een.accountUpdateEvent.v1 |
| 55Y | Animal Detection | een.animalDetectionEvent.v1 |
| 0gG | Battery Level Update | een.batteryLevelUpdateEvent.v1 |
| ByH | Counted Object Line Cross | een.countedObjectLineCrossEvent.v1 |
| zik | Crowd Formation Detection | een.crowdFormationDetectionEvent.v1 |
| 3Cc | Device Creation | een.deviceCreationEvent.v1 |
| cF7 | Device Deletion | een.deviceDeletionEvent.v1 |
| yIm | Device I/O | een.deviceIOEvent.v1 |
| 1pF | Device Operation | een.deviceOperationEvent.v1 |
| SFJ | Device Cloud Connection Status | een.deviceCloudConnectionStatusUpdateEvent.v1 |
| wOj | Device Status | een.deviceCloudStatusUpdateEvent.v1 |
| 5Kd | Device Update | een.deviceUpdateEvent.v1 |
| GAy | Door Status | een.doorStatusEvent.v1 |
| 8GJ | Edge Reported Device Status | een.edgeReportedDeviceStatusEvent.v1 |
| ztu | EEVA Event | een.eevaQueryEvent.v1 |
| CoN | Evacuate Protocol | een.evacuateProtocolEvent.v1 |
| qHj | Face Detection | een.faceDetectionEvent.v1 |
| SNz | Fall Detection Event | een.fallDetectionEvent.v1 |
| VZJ | Fight Detection Event | een.fightDetectionEvent.v1 |
| t7I | Fire Detection | een.fireDetectionEvent.v1 |
| qM1 | Fleet Code Recognition | een.fleetCodeRecognitionEvent.v1 |
| NbY | Gun Detection | een.gunDetectionEvent.v1 |
| NHc | Gunshot Audio Detection | een.gunShotAudioDetectionEvent.v1 |
| YS9 | Hands Up Detection Event | een.handsUpDetectionEvent.v1 |
| 9BR | Hold Protocol | een.holdProtocolEvent.v1 |
| ek9 | Job Creation | een.jobCreationEvent.v1 |
| jbP | Job Deletion | een.jobDeletionEvent.v1 |
| kMt | Job Update | een.jobUpdateEvent.v1 |
| 7b9 | Layout Creation | een.layoutCreationEvent.v1 |
| c2P | Layout Deletion | een.layoutDeletionEvent.v1 |
| plX | Layout Update | een.layoutUpdateEvent.v1 |
| Erm | License Plate Recognition | een.lprPlateReadEvent.v1 |
| zTs | Lockdown Protocol | een.lockdownProtocolEvent.v1 |
| wW9 | Loiter Detection | een.loiterDetectionEvent.v1 |
| pOx | Measurement Threshold Status | een.measurementThresholdStatusEvent.v1 |
| nkU | Motion Detection | een.motionDetectionEvent.v1 |
| AJa | Motion in Region Detection | een.motionInRegionDetectionEvent.v1 |
| 4CD | Object Intrusion | een.objectIntrusionEvent.v1 |
| 1Jn | Object Line Cross | een.objectLineCrossEvent.v1 |
| y1L | Object Line Cross Count | een.objectLineCrossCountEvent.v1 |
| plc | Object Removal | een.objectRemovalEvent.v1 |
| bnl | Panic Button | een.panicButtonEvent.v1 |
| 6pF | Person Detection | een.personDetectionEvent.v1 |
| kdV | Person Motion Detection | een.personMotionDetectionEvent.v1 |
| Akk | Person Tailgate Event | een.personTailgateEvent.v1 |
| y4g | POS Transaction | een.posTransactionEvent.v1 |
| itL | PPE Violation | een.ppeViolationEvent.v1 |
| yRM | Ptz Position Update | een.ptzPositionUpdateEvent.v1 |
| SzG | Scene Label | een.sceneLabelEvent.v1 |
| N11 | Secure Protocol | een.secureProtocolEvent.v1 |
| HUI | Shelter Protocol | een.shelterProtocolEvent.v1 |
| xYB | Spill Detection | een.spillDetectionEvent.v1 |
| 5PI | T3 Alarm Audio Detection | een.t3AlarmAudioDetectionEvent.v1 |
| 632 | T4 Alarm Audio Detection | een.t4AlarmAudioDetectionEvent.v1 |
| yuv | Tamper Detection | een.tamperDetectionEvent.v1 |
| jNo | Thermal Camera Threshold Crossed | een.thermalCameraThresholdStatusEvent.v1 |
| OeS | User Creation | een.userCreationEvent.v1 |
| XhN | User Deletion | een.userDeletionEvent.v1 |
| Cjx | User Update | een.userUpdateEvent.v1 |
| b99 | Vape Detection | een.vapeDetectionEvent.v1 |
| X33 | Vehicle Detection | een.vehicleDetectionEvent.v1 |
| jQD | Vehicle Motion Detection | een.vehicleMotionDetectionEvent.v1 |
| Ars | Violence Detection | een.violenceDetectionEvent.v1 |
| 97G | Weapon Detection | een.weaponDetectionEvent.v1 |

## Usage Example

To filter for Motion Detection and Person Detection events:

```
?events=nkU,6pF
```

Full URL example:
```
http://127.0.0.1:3333/?id=1005963a,100f030c&selected=100f030c&events=nkU,6pF
```
