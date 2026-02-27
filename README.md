# EEN Camera Observation App

A Vue 3 single-page application for Eagle Eye Networks camera monitoring with live video streaming, event display, and real-time event push.

![App Screenshot](./public/app-screenshot.png)

## Features

### Camera Management
- **Camera Sidebar** - Paginated list of cameras with live MJPEG preview thumbnails
- **Layout Support** - Filter cameras by predefined layouts or view all cameras
- **URL Camera Selection** - Deep-link to specific cameras via URL parameters (see below)
- **Camera Selection Modal** - Click the clipboard icon next to the camera counter/pagination to open a modal listing all account cameras; select up to 10 cameras and navigate to a URL showing only those cameras as "URL-cameras"

### Video Playback
- **Live HD Video** - Full-quality live streaming using the EEN Live Video SDK
- **Recorded Playback** - HLS video playback for historic events with precise timestamp seeking
- **Camera Information Panel** - Display camera status, name, ID, and account info
- **Google Maps Link** - Red map pin icon next to camera name when location data is available; opens Google Maps in a new tab with address tooltip
- **Camera Data Modal** - Click the (i) button next to "Camera Information" to view full API data:
  - **Details** view — full camera JSON with all include parameters
  - **Settings** view — camera settings with schema and proposed values
  - **Bridge** view — bridge details with all include parameters
  - Include parameter pill badges shown for each view
  - Copy to clipboard, close via X/ESC/backdrop click
- **Event Playback Controls** - Click the event card to play/pause and seek to the event timestamp
- **Keyboard Shortcuts** (recorded playback mode):
  - `Space` — Toggle play/pause
  - `Left Arrow` — Skip backward 10 seconds
  - `Right Arrow` — Skip forward 10 seconds
  - `Shift + Left Arrow` — Skip backward 0.5 seconds
  - `Shift + Right Arrow` — Skip forward 0.5 seconds
  - `Enter` — Seek to event timestamp and pause
- **Auto-Retry Offline Cameras** - Cameras that are offline are automatically re-checked every 60 seconds; live stream and sidebar previews recover when the camera comes back online

### Video Export & Download
- **Download Button** - Export the currently playing video clip as an MP4 file
- **Export Progress Modal** - Real-time progress tracking during server-side export
- **Automatic Clipping** - Clips longer than 10 minutes are automatically truncated:
  - Calculates the midpoint between event start and end times
  - Creates a 10-minute window centered on that midpoint (5 min before, 5 min after)
  - Shifts the window if it extends outside the actual clip boundaries
  - Shows a warning banner when clipping occurs
- **Smart Filename** - Downloads use the format `<camera-id> - yyyy-mm-dd hh:mm:ss.mp4`
  - Timestamp reflects the actual start time of the exported video
  - Clipped videos include "clipped" suffix: `<camera-id> - yyyy-mm-dd hh:mm:ss clipped.mp4`
- **Clip Information** - Modal displays duration and file size upon completion

### Events System

The bottom section of the application contains three panels for event management:

#### Event Types Panel (Left)
- **Event Type Toggles** - Select which event types to display (motion detection, person detection, etc.)
- **Select All / None** - Quick toggle buttons to select or deselect all event types
- **Filter Scope** - Selected types filter the Events panel; optionally filter Alerts too

#### Events Panel (Center)
- **Event List** - Browse events matching selected event types with thumbnails
- **Time Range Selector** - Choose time window (10 min, 1 hour, 24 hours, 1 week)
- **Live Events Toggle** - Enable/disable real-time SSE event feed
  - Green "Disable Live Events" when active
  - Gray "Turn Live Events On" when inactive
- **Refresh Button** - Manual refresh with countdown timer when auto-refresh enabled
- **Auto-Refresh Checkbox** - Automatic refresh every minute
- **Event Thumbnails** - Hover to see enlarged preview with bounding boxes
- **Click-to-Playback** - Click any event to play recorded video at that timestamp
- **SSE Events** - Live events appear with blue background, turn green after refresh
- **Event Info Box** - Orange box in Camera Information shows:
  - Lightning bolt icon + event type name
  - Timestamp with play/pause controls
  - Event duration
  - (i) button to view full JSON data in modal

#### Alerts Panel (Right)
- **Alert List** - Browse alerts for the selected camera with thumbnails
- **Time Range Selector** - Independent time window selection
- **Event Filter Toggle** - Filter alerts by selected event types
  - Green "Disable Event Filter" when filtering active
  - Gray "Enable Event Filter" when showing all alerts
- **Refresh Button** - Manual refresh with countdown timer
- **Auto-Refresh Checkbox** - Automatic refresh every minute
- **Alert Thumbnails** - Based on alert timestamp, hover for preview
- **Notification Icon** - Envelope icon appears if alert has associated notification
  - Click to view notification JSON in modal
- **Priority Badges** - Color-coded priority (red >= 8, orange >= 5)
- **Click-to-Playback** - Click any alert to play recorded video at that timestamp
- **Alert Info Box** - Orange box in Camera Information shows:
  - Bell icon + alert type name
  - Timestamp with play/pause controls
  - (i) button to view full JSON data in modal

### JSON Data Display
- **Event Data Modal** - View complete event JSON with syntax highlighting
- **Alert Data Modal** - View complete alert JSON with syntax highlighting
- **Notification Data Modal** - View notification JSON for alerts with notifications
- **Camera Data Modal** - View camera details, settings, or bridge data with include parameter pills
- **Copy to Clipboard** - One-click copy of JSON data
- **ESC to Close** - Press Escape or click outside to close modals

### Authentication
- **OAuth 2.0 Flow** - Secure login via Eagle Eye Networks OAuth
- **Session Persistence** - Stay logged in across page refreshes using localStorage
- **Token Auto-Refresh** - Automatic token renewal before expiration

### User Interface
- **Dark Mode Toggle** - Switch between light and dark themes with persistent preference
- **Sound Notifications** - Audio beep on new SSE events; mute toggle in the top bar with URL parameter persistence
- **Event/Alert Highlighting** - Active event or alert shows orange border
- **Visual Camera Selection Feedback** - Selected camera shows thick border
- **Panel Tooltips** - Hover over panel titles to see descriptions
- **Bounding Box Overlays** - Object detection boxes shown on event thumbnails and video

## URL Parameters

The application supports deep-linking with URL parameters to restore camera selection, selected camera, event type filters, time range durations, auto-refresh settings, live events toggle, event filter, dark mode, and mute state.

### Full URL Format

```
http://127.0.0.1:3333/?id=<camera-ids>&selected=<camera-id>&events=<event-hashes>&ed=<duration>&ad=<duration>&er=1&ar=1&live=1&filter=1&dark=1&mute=1
```

**Example:**
```
http://127.0.0.1:3333/?id=1005963a,100f030c,1003e46b&selected=100f030c&events=nkU,wOj&ed=24h&ad=1w&er=1&live=1&dark=1&mute=1
```

### Parameters

| Parameter | Description | Example |
|-----------|-------------|---------|
| `id` | Comma-separated list of visible camera IDs | `id=1005963a,100f030c` |
| `selected` | Currently selected camera ID (must be in `id` list) | `selected=100f030c` |
| `events` | Comma-separated event type hashes | `events=nkU,6pF,wOj` |
| `ed` | Events panel time range duration | `ed=24h` |
| `ad` | Alerts panel time range duration | `ad=1w` |
| `er` | Events panel auto-refresh enabled (`1` = on) | `er=1` |
| `ar` | Alerts panel auto-refresh enabled (`1` = on) | `ar=1` |
| `live` | Live events SSE feed enabled (`1` = on) | `live=1` |
| `filter` | Event type filter for alerts enabled (`1` = on) | `filter=1` |
| `dark` | Dark mode (`1` = on, `0` = off) | `dark=1` |
| `mute` | Mute sound notifications (`1` = muted) | `mute=1` |

### Camera Selection (`id` and `selected`)

- **`id` parameter** - Defines which cameras are visible in the sidebar
  - A **"URL-cameras"** option appears at the top of the layout dropdown
  - If a camera ID is invalid or inaccessible, an error card is shown
- **`selected` parameter** - Pre-selects a specific camera from the visible list
  - Must be one of the IDs in the `id` list (validated on load)
  - If omitted or invalid, the first camera is selected
- **Auto-sync** - The URL automatically updates when you change camera selection or visibility

### Event Type Filtering (`events`)

Event types are encoded as 3-character hashes to keep URLs short. The hashes use the DJB2 algorithm with base62 encoding.

**Common event type hashes:**

| Hash | Event Type |
|------|------------|
| nkU | Motion Detection |
| 6pF | Person Detection |
| X33 | Vehicle Detection |
| 55Y | Animal Detection |
| wOj | Device Status |

See [docs/event-type-hashes.md](docs/event-type-hashes.md) for the complete list of all 60 event types and their hashes, including the hash algorithm source code.

### Time Range Duration (`ed` and `ad`)

Controls the time range for the Events and Alerts panels. Valid values:

| Value | Duration |
|-------|----------|
| `10m` | Last 10 minutes |
| `1h` | Last 1 hour (default) |
| `24h` | Last 24 hours |
| `1w` | Last week |

Invalid values are ignored and the default (1h) is used. The duration is only included in the URL when not the default value.

### Auto-Refresh (`er` and `ar`)

Controls whether auto-refresh is enabled for the Events and Alerts panels:
- `er=1` - Enable events auto-refresh
- `ar=1` - Enable alerts auto-refresh

When enabled, the respective panel refreshes every minute. The parameter is only included in the URL when auto-refresh is enabled.

### Live Events Toggle (`live`)

Controls whether the live events SSE (Server-Sent Events) feed is enabled:
- `live=1` - Enable live events feed

When enabled, new events are pushed to the Events panel in real-time via SSE. The parameter is only included in the URL when the live feed is enabled.

### Event Filter for Alerts (`filter`)

Controls whether alerts are filtered by the selected event types:
- `filter=1` - Enable event type filter for alerts

When enabled, only alerts matching the selected event types are shown. The parameter is only included in the URL when the filter is enabled.

### Dark Mode (`dark`)

Controls the application theme:
- `dark=1` - Enable dark mode
- `dark=0` - Enable light mode (explicit)

When `dark=1` is in the URL, dark mode is enabled regardless of the user's previous preference. The parameter is only included in the URL when dark mode is enabled.

### Mute (`mute`)

Controls whether sound notifications are muted:
- `mute=1` - Mute sound notifications

When unmuted (default), a short audio beep plays on each new SSE event notification. The parameter is only included in the URL when muted.

### URL Persistence

- All URL parameters persist through the OAuth login flow
- Parameters are stored in sessionStorage during authentication
- Sharing a URL allows others to see the exact same view (after login)

## Technology Stack

- **Framework:** Vue 3.5 with Composition API
- **Build Tool:** Vite 7
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **State Management:** Pinia
- **API Integration:** [een-api-toolkit](https://www.npmjs.com/package/een-api-toolkit)
- **Live Video:** @een/live-video-web-sdk
- **Recorded Video:** hls.js
- **Testing:** Playwright (E2E)

## een-api-toolkit Functions Used

This application uses the following functions from [een-api-toolkit](https://github.com/klaushofrichter/een-api-toolkit):

- **Authentication:** `initEenToolkit`, `useAuthStore`, `getAuthUrl`, `handleAuthCallback`, `revokeToken`
- **User:** `getCurrentUser`
- **Devices:** `getCameras`, `getCamera`, `getCameraSettings`, `getBridge`, `getLayouts`
- **Media:** `listFeeds`, `initMediaSession`, `listMedia`, `getRecordedImage`, `formatTimestamp`
- **Events:** `listEvents`, `getEvent`, `listEventTypes`, `listEventFieldValues`, `getDataSchemasForEventType`, `getIncludeParameterForEventTypes`, `createEventSubscription`, `connectToEventSubscription`, `deleteEventSubscription`
- **Alerts:** `listAlerts`, `listEventAlertConditionRules`, `listAlertActions`
- **Notifications:** `listNotifications`
- **Jobs/Export:** `createExportJob`, `getJob`, `downloadFile`, `deleteJob`

## Prerequisites

- Node.js 18+
- An Eagle Eye Networks account
- OAuth client credentials (client ID)
- An OAuth proxy URL (see [een-api-toolkit documentation](https://www.npmjs.com/package/een-api-toolkit) or [een-oauth-proxy](https://github.com/klaushofrichter/een-oauth-proxy) for an implementation)

## Setup

1. **Clone the repository**
   ```bash
   git clone https://github.com/klaushofrichter/een-observation-app.git
   cd een-observation-app
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env` and update with your credentials:
   ```bash
   cp .env.example .env
   ```

   Then edit `.env` with your actual values:
   ```
   VITE_PROXY_URL=https://your-oauth-proxy.workers.dev
   VITE_EEN_CLIENT_ID=YOUR-CLIENT-ID
   TEST_USER=your-test-email@example.com
   TEST_PASSWORD=your-test-password
   ```

4. **Start the development server**
   ```bash
   npm run dev
   ```

   The app will be available at `http://127.0.0.1:3333`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm test` | Run Playwright E2E tests |
| `npm run test:e2e` | Run Playwright E2E tests (alias) |
| `npm run test:ui` | Run Playwright tests with interactive UI |
| `npm run test:headed` | Run Playwright tests in headed browser |

## Project Structure

```
src/
├── components/
│   ├── CameraSidebar.vue      # Paginated camera list with layout filter
│   ├── CameraCard.vue         # Preview video card with status badge
│   ├── ErrorCameraCard.vue    # Error card for inaccessible cameras
│   ├── MainVideoPlayer.vue    # HD video with Live SDK + HLS playback
│   ├── EventTypesPanel.vue    # Event type toggles
│   ├── EventsPanel.vue         # Events panel with thumbnails (historic + live)
│   ├── AlertsPanel.vue        # Alerts panel with notifications and priority badges
│   ├── BoundingBoxOverlay.vue  # Bounding box overlay for object detection
│   ├── CameraSelectModal.vue   # Camera selection modal (up to 10 cameras)
│   └── ExportStatusModal.vue  # Video export progress modal
├── composables/
│   ├── useBoundingBoxes.ts    # Bounding box extraction from event data
│   ├── useDarkMode.ts         # Dark mode toggle with localStorage persistence
│   ├── useEventAge.ts         # Event age formatting
│   ├── useHlsPlayer.ts        # HLS.js player management
│   ├── useImageCache.ts       # LRU cache for event thumbnails
│   ├── useMute.ts             # Mute toggle with localStorage persistence
│   ├── useSseNotification.ts  # Toast notifications for SSE events with sound
│   └── useVideoExport.ts      # Video export with auto-clipping
├── views/
│   ├── Home.vue               # Main application view
│   ├── Login.vue              # OAuth login page
│   ├── Callback.vue           # OAuth callback handler
│   └── Logout.vue             # Logout page
├── router/
│   └── index.ts               # Vue Router with auth guards
├── assets/
│   └── main.css               # Tailwind CSS styles
├── utils/
│   └── eventTypeHash.ts       # DJB2 hash for URL event type encoding
├── types/
│   └── een.ts                 # Type re-exports and helper types
├── App.vue                    # Root component with auth initialization
└── main.ts                    # Application entry point

tests/
├── auth.spec.ts               # Authentication and user info modal tests (8)
├── camera-select.spec.ts      # Camera selection modal tests (4)
├── cameras.spec.ts            # Camera sidebar, selection, and info tests (11)
├── dark-mode.spec.ts          # Dark mode toggle and URL parameter tests (2)
├── mute.spec.ts               # Mute toggle, URL parameter, and persistence tests (3)
├── event-types.spec.ts        # Event type selection and count tests (3)
├── events.spec.ts             # Events and alerts panel tests (10)
├── url-state.spec.ts          # URL parameter state persistence tests (1)
└── user-info.spec.ts          # User info modal detail tests (3)
```

## Testing

The project includes 45 Playwright E2E tests across 9 spec files:

### Authentication (`auth.spec.ts` — 8 tests)
- Redirect unauthenticated users to login page
- Redirect unknown routes to login
- Complete OAuth login flow
- Show authenticated user info
- Logout successfully
- Open, close (ESC), and close (backdrop click) user info modal

### Camera Selection Modal (`camera-select.spec.ts` — 4 tests)
- Display camera select button in sidebar
- Open modal and display all cameras with checkboxes
- Select cameras and navigate to URL with selected IDs
- Close modal via Cancel, ESC, and backdrop click

### Camera Selection (`cameras.spec.ts` — 11 tests)
- Display camera sidebar with cameras
- Select camera and show main video player
- Show camera info panel with details
- Switch video player between cameras
- Show camera status badges
- Restore camera selection from URL after logout/login
- Open Google Maps link and interact with camera data modal (Details/Settings/Bridge views)
- Filter cameras by layout selection
- Display exactly three cameras for test account
- Show Bridge ID in camera info panel
- Camera search/filter (gracefully skips if search input not available)

### Dark Mode (`dark-mode.spec.ts` — 2 tests)
- Toggle dark mode on/off and verify `dark` class on `<html>`
- Dark mode URL parameter persistence through OAuth login flow

### Mute (`mute.spec.ts` — 3 tests)
- Toggle mute on/off and verify icon/title changes
- Mute URL parameter (`mute=1`) appears when muted, removed when unmuted
- Mute state persists through OAuth login flow via sessionStorage

### Event Types (`event-types.spec.ts` — 3 tests)
- Toggle individual event types on/off with URL `events` parameter update
- Select all / deselect all event types via "All" checkbox
- Event type count indicator (e.g., "3/5 selected") updates on toggle

### Events & Alerts (`events.spec.ts` — 10 tests)
- Display three event panels (Event Types, Events, Alerts)
- Show event type toggles with motion detection preselected
- Toggle event types on/off
- Show events panel content
- Show alerts panel with controls
- Change events time range (verify `ed` URL parameter)
- Toggle auto-refresh checkbox (verify `er` URL parameter and countdown)
- Toggle live events button (verify `live` URL parameter)
- Change alerts time range (verify `ad` URL parameter)
- Toggle event filter for alerts (verify `filter` URL parameter)

### URL State Persistence (`url-state.spec.ts` — 1 test)
- Restore camera selection and event type filters from URL after logout/login

### User Info Modal (`user-info.spec.ts` — 3 tests)
- Display base URL and copy to clipboard with feedback
- Show masked access token, reveal via "Show & Copy", and copy feedback
- Display token expiration timestamp and time remaining

### Running Tests

```bash
npm test                        # Run all tests
npx playwright test --ui        # Interactive UI mode
npm run test:headed             # Headed browser mode
npx playwright test --list      # List all tests without running
```

## Configuration Notes

### OAuth Redirect URI

The app must run on `http://127.0.0.1:3333` to match the OAuth redirect URI configuration. The Vite config enforces this:

```typescript
server: {
  host: '127.0.0.1',
  port: 3333,
  strictPort: true
}
```

### Router Guard Order

The OAuth callback check must come BEFORE the auth check in the router guard. The EEN IDP redirects to the root path (`/`) with `code` and `state` query parameters.

### Production Build Base Path

The Vite configuration uses a dynamic base path:

```typescript
base: command === 'build' ? '/een-observation-app/' : '/',
```

- **Development** (`npm run dev`): Uses root path `/`
- **Production** (`npm run build`): Uses `/een-observation-app/` for GitHub Pages deployment

If deploying to a different location, update the base path in `vite.config.ts` accordingly.

## Claude Code Agents

This project includes specialized Claude Code agents for een-api-toolkit development:

- `een-setup-agent` - Vue 3 project setup and configuration
- `een-auth-agent` - OAuth authentication flows
- `een-devices-agent` - Camera and bridge management
- `een-media-agent` - Video streaming and playback
- `een-events-agent` - Events and SSE subscriptions
- `een-automations-agent` - Alert automation rules and actions
- `een-jobs-agent` - Async jobs, exports, and file downloads
- `een-grouping-agent` - Layouts and camera groupings
- `een-users-agent` - User management
- `test-runner` - E2E and unit test execution
- `docs-accuracy-reviewer` - Documentation verification against codebase

## License

MIT
