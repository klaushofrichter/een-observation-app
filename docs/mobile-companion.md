# Mobile Companion App — Architecture

## Overview

The Mobile Companion is a native iOS app that receives an EEN access token and camera ID via QR code from the web app, then displays live video and real-time SSE events for that camera.

## QR Code Format

The web app generates a QR code encoding a custom URL scheme:

```
eenviewer://view?token=<access_token>&cam=<camera_id>
```

- `token` — EEN OAuth access token (from `authStore.token`)
- `cam` — Camera ESN (from URL `selected` param)

## Data Flow

```
Web App                     iOS App
───────                     ───────
1. User selects camera
2. Clicks QR icon
3. QR modal shown ──────►  4. Camera scans QR
                            5. Parse eenviewer:// URL
                            6. Extract token + cam ID
                            7. Call GET /cameras/{id}
                               to get baseUrl
                            8. Start live video stream
                            9. Open SSE subscription
                               for events
```

## iOS App Components

### URL Scheme Handler
- Register `eenviewer://` custom URL scheme in `Info.plist`
- Parse `token` and `cam` query parameters
- Store token in Keychain for the session

### API Client
- Set `Authorization: Bearer <token>` header
- Call `GET /api/v3.0/cameras/{cam}` to resolve `baseUrl`
- Use `baseUrl` for all subsequent media/event API calls

### Live Video
- Use EEN media API: `GET /media/liveVideo.flv` or MJPEG endpoint
- Display in `AVPlayerLayer` or `WKWebView`

### SSE Events
- Create event subscription via `POST /api/v3.0/eventSubscriptions`
- Connect to SSE stream via `GET /api/v3.0/eventSubscriptions/{id}/sse`
- Display events as overlay cards on the video

### Token Lifecycle
- Token is short-lived (received from web app, no refresh token)
- Display time-remaining countdown
- Prompt user to re-scan QR when token expires

## Security Considerations

- Token is transmitted via QR (local/optical, not over network)
- Token stored in iOS Keychain, cleared on app close
- No refresh token — session ends when token expires
- QR should only be scanned in trusted environments

## Status

This feature is **experimental**. The web app QR generation is implemented; the iOS companion app is a separate project.
