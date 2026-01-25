# EEN Camera Observation App

A Vue 3 single-page application for Eagle Eye Networks camera monitoring with live video streaming, event detection, and real-time notifications.

![App Screenshot](./public/app-screenshot.png)

## Features

### Camera Management
- **Camera Sidebar** - Paginated list of cameras with live MJPEG preview thumbnails
- **Layout Support** - Filter cameras by predefined layouts or view all cameras
- **URL Camera Selection** - Deep-link to specific cameras via URL parameters (see below)

### Video Playback
- **Live HD Video** - Full-quality live streaming using the EEN Live Video SDK
- **Recorded Playback** - HLS video playback for historic events
- **Camera Information Panel** - Display camera status, name, ID, and account info

### Events System
- **Event Type Filtering** - Toggle event types (motion detection, person detection, device status)
- **Historic Events Panel** - Browse past events with thumbnails, configurable time range, auto-refresh
- **Live Events Panel** - Real-time Server-Sent Events (SSE) feed with auto-scroll and reconnection
- **Event Thumbnails** - Hover preview with enlarged thumbnail popup
- **Click-to-Playback** - Click any event to jump to recorded video at that timestamp

### Authentication
- **OAuth 2.0 Flow** - Secure login via Eagle Eye Networks OAuth
- **Session Persistence** - Stay logged in across page refreshes using localStorage
- **Token Auto-Refresh** - Automatic token renewal before expiration

## URL Camera Selection

You can deep-link directly to specific cameras by adding the `id` parameter to the URL:

```
http://127.0.0.1:3333?id=1005963a,1003e46b
```

When camera IDs are provided in the URL:
- A **"URL-cameras"** option appears at the top of the layout dropdown
- Only the specified cameras are displayed in the sidebar
- If a camera ID is invalid or inaccessible, an error card is shown instead
- The URL parameters persist through the OAuth login flow
- Accessing the app without the `id` parameter clears any previously stored camera IDs

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
- **Devices:** `getCameras`, `getLayouts`
- **Media:** `listFeeds`, `initMediaSession`, `listMedia`, `getRecordedImage`, `formatTimestamp`
- **Events:** `listEvents`, `listEventTypes`, `listEventFieldValues`, `createEventSubscription`, `connectToEventSubscription`, `deleteEventSubscription`

## Prerequisites

- Node.js 18+
- An Eagle Eye Networks account
- OAuth client credentials (client ID)
- An OAuth proxy URL (see [een-api-toolkit documentation](https://www.npmjs.com/package/een-api-toolkit))

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

   Create a `.env` file in the project root:
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

## Project Structure

```
src/
├── components/
│   ├── CameraSidebar.vue      # Paginated camera list with layout filter
│   ├── CameraCard.vue         # Preview video card with status badge
│   ├── ErrorCameraCard.vue    # Error card for inaccessible cameras
│   ├── MainVideoPlayer.vue    # HD video with Live SDK + HLS playback
│   ├── EventTypesPanel.vue    # Event type toggles
│   ├── HistoricEventsPanel.vue # Historic events with thumbnails
│   └── LiveEventsPanel.vue    # SSE live events feed
├── composables/
│   ├── useImageCache.ts       # LRU cache for event thumbnails
│   ├── useHlsPlayer.ts        # HLS.js player management
│   └── useEventAge.ts         # Event age formatting
├── views/
│   ├── Home.vue               # Main application view
│   ├── Login.vue              # OAuth login page
│   ├── Callback.vue           # OAuth callback handler
│   └── Logout.vue             # Logout page
├── router/
│   └── index.ts               # Vue Router with auth guards
├── assets/
│   └── main.css               # Tailwind CSS styles
├── App.vue                    # Root component with auth initialization
└── main.ts                    # Application entry point

tests/
├── auth.spec.ts               # Authentication tests
├── cameras.spec.ts            # Camera selection tests
└── events.spec.ts             # Events system tests
```

## Testing

The project includes Playwright E2E tests covering:

- OAuth login/logout flow
- Camera sidebar and selection
- Video player switching
- Event type toggles
- Historic and live events panels

Run tests:
```bash
npm test
```

Run tests with UI:
```bash
npx playwright test --ui
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

## Claude Code Agents

This project includes specialized Claude Code agents for een-api-toolkit development:

- `een-setup-agent` - Vue 3 project setup and configuration
- `een-auth-agent` - OAuth authentication flows
- `een-devices-agent` - Camera and bridge management
- `een-media-agent` - Video streaming and playback
- `een-events-agent` - Events and SSE subscriptions
- `een-grouping-agent` - Layouts and camera groupings
- `een-users-agent` - User management

## License

MIT
