# EEN Camera Observation App

A Vue 3 single-page application for Eagle Eye Networks camera monitoring with live video and event feeds.

## Features

- **OAuth Authentication** - Secure login via Eagle Eye Networks OAuth flow
- **Camera Sidebar** - Paginated list with live preview thumbnails (MJPEG multipart streams)
- **HD Video Player** - Full-quality live video using the EEN Live Video SDK
- **Events System**
  - Event type toggles (motion detection preselected by default)
  - Historic events with thumbnails
  - Live SSE event feed with auto-scroll

## Screenshot

```
+------------------------------------------------------------------+
|  Top Bar: App Name | User Info                         | Logout  |
+------------------------------------------------------------------+
|          |                                                       |
|  Camera  |  Video Section (HD feed + camera info)                |
|  Sidebar |                                                       |
|          |-------------------------------------------------------|
| (Preview |  Events Section                                       |
|  Videos) |  +---------------+----------------+------------------+ |
|          |  | Event Types   | Historic Events| Live SSE Events  | |
|  [Paging]|  | (toggles)     | (filtered)     | (filtered)       | |
|          |  +---------------+----------------+------------------+ |
+------------------------------------------------------------------+
```

## Technology Stack

- **Framework:** Vue 3 with Composition API
- **Build Tool:** Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS v4
- **API Integration:** [een-api-toolkit](https://www.npmjs.com/package/een-api-toolkit)
- **Live Video:** @een/live-video-web-sdk
- **Testing:** Playwright (E2E)

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
│   ├── CameraSidebar.vue      # Paginated camera list
│   ├── CameraCard.vue         # Preview video card
│   ├── MainVideoPlayer.vue    # HD video with Live SDK
│   ├── EventTypesPanel.vue    # Event type toggles
│   ├── HistoricEventsPanel.vue # Historic events list
│   └── LiveEventsPanel.vue    # SSE live events
├── views/
│   ├── Home.vue               # Main application view
│   ├── Login.vue              # OAuth login page
│   ├── Callback.vue           # OAuth callback handler
│   └── Logout.vue             # Logout page
├── router/
│   └── index.ts               # Vue Router with auth guards
├── assets/
│   └── main.css               # Tailwind CSS styles
├── types/
│   └── een.ts                 # TypeScript type exports
├── App.vue                    # Root component
└── main.ts                    # Application entry point

tests/
├── auth.spec.ts               # Authentication tests (4)
├── cameras.spec.ts            # Camera selection tests (5)
└── events.spec.ts             # Events system tests (5)
```

## Testing

The project includes 14 Playwright E2E tests covering:

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

- `een-auth-agent` - OAuth authentication flows
- `een-devices-agent` - Camera and bridge management
- `een-media-agent` - Video streaming and playback
- `een-events-agent` - Events and SSE subscriptions
- `een-users-agent` - User management

## License

MIT
