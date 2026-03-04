# Mobile Companion App — Architecture

## Overview

The Mobile Companion is a native iOS app that receives an EEN access token and camera ID via QR code from the web app, then displays live video and real-time SSE events for that camera.

## QR Code Format

The web app generates a QR code encoding a custom URL scheme:

```
eenobserve://view?token=<access_token>&cam=<camera_id>&base=<base_url>&ttl=<epoch_seconds>&events=<hash1,hash2,...>
```

- `token` — EEN OAuth access token (from `authStore.token`)
- `cam` — Camera ESN (from URL `selected` param)
- `base` — URL-encoded EEN API base URL (from `authStore.baseUrl`)
- `ttl` — UTC epoch time in seconds when the token expires (from `authStore.tokenExpiration`)
- `events` — *(optional)* Comma-separated 3-char DJB2 base62 hashes of selected event types (from URL `events` param)

## Data Flow

```
Web App                     iOS App
───────                     ───────
1. User selects camera
2. Clicks QR icon (auto-copies URL)
3. QR popup shown ─────►  4. Camera scans QR
                            5. Parse eenobserve:// URL
                            6. Extract token, cam, base,
                               ttl, events
                            7. Use base URL directly
                               (no extra API call needed)
                            8. Start live video stream
                            9. Open SSE subscription
                               for selected event types
                           10. Show token expiry countdown
                               from ttl epoch
```

## iOS App Components

### URL Scheme Handler
- Register `eenobserve://` custom URL scheme in `Info.plist`
- Parse `token` and `cam` query parameters
- Store token in Keychain for the session

### API Client
- Set `Authorization: Bearer <token>` header
- Use `base` URL directly for all media/event API calls (no need to resolve via cameras endpoint)

### Live Video
- Use EEN media API: `GET /media/liveVideo.flv` or MJPEG endpoint
- Display in `AVPlayerLayer` or `WKWebView`

### SSE Events
- Create event subscription via `POST /api/v3.0/eventSubscriptions`
- Connect to SSE stream via `GET /api/v3.0/eventSubscriptions/{id}/sse`
- Display events as overlay cards on the video

### Token Lifecycle
- Token is short-lived (received from web app, no refresh token)
- `ttl` parameter provides the absolute expiration time as UTC epoch seconds
- Display time-remaining countdown computed from `ttl`
- Prompt user to re-scan QR when token expires

## Security Considerations

- Token is transmitted via QR (local/optical, not over network)
- Token stored in iOS Keychain, cleared on app close
- No refresh token — session ends when token expires
- QR should only be scanned in trusted environments

## Status

This feature is **experimental**. The web app QR generation is implemented; the iOS companion app is a separate project.
