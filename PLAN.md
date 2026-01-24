# EEN Camera Observation App - Development Plan

## Project Overview
A single-page Vue 3 web application for Eagle Eye Networks camera monitoring with live video and event feeds.

## Technology Stack
- **Framework:** Vue 3 with Composition API
- **Build Tool:** Vite
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **API Integration:** een-api-toolkit
- **Testing:** Playwright (E2E with real credentials)

## Design Decisions
- **Color Scheme:** Modern and functional
- **Camera Sidebar Pagination:** Dynamic calculation based on viewport height
- **Event Types:** "Motion detection" preselected by default
- **SSE Event Feed:** Auto-scroll to show new events

## Application Layout

```
+------------------------------------------------------------------+
|  Top Bar: App Name | User Info                                   |
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

## Features Breakdown

### 1. Authentication
- OAuth login flow using een-api-toolkit
- Access token stored in localStorage
- User info displayed in top bar

### 2. Camera Sidebar
- Paginated list of camera cards
- Each card shows preview-quality multipart live video
- Pagination controls at top
- Dynamic card count based on viewport height
- Click to select camera for main view

### 3. Main Video Section
- HD quality video feed for selected camera
- Camera information panel to the right of video

### 4. Events Section
- **Left Panel:** Event type toggles (motion detection preselected)
- **Middle Panel:** Historic events filtered by selected types
- **Right Panel:** Live SSE event feed (auto-scrolling) filtered by selected types

## Implementation Phases

### Phase 1: Project Setup ✓
- [x] Initialize Vite + Vue 3 + TypeScript project
- [x] Configure Tailwind CSS (v4 with @tailwindcss/postcss)
- [x] Install and configure een-api-toolkit
- [x] Set up project structure

### Phase 2: Authentication ✓
- [x] Implement OAuth login flow (Login.vue, Callback.vue)
- [x] Handle token storage/retrieval (localStorage via een-api-toolkit)
- [x] Create authenticated app shell (App.vue with user info, route guards)

### Phase 3: Camera List & Selection ✓
- [x] Fetch camera list from API
- [x] Implement dynamic pagination based on viewport height
- [x] Create camera card component with preview video (multipart live)
- [x] Handle camera selection (click to select for main view)

### Phase 4: Main Video View ✓
- [x] Implement HD video player (MainVideoPlayer.vue using main feed multipart stream)
- [x] Display camera information panel (to the right of video)
- [x] Handle video stream errors (with retry button)

### Phase 5: Events System ✓
- [x] Fetch supported event types for camera
- [x] Implement event type toggles
- [x] Fetch and display historic events
- [x] Set up SSE connection for live events
- [x] Implement auto-scroll behavior

### Phase 6: Testing ✓
- [x] Set up Playwright configuration
- [x] Write E2E tests with real credentials
- [x] Test OAuth flow (4 tests)
- [x] Test camera selection and video (4 tests)
- [x] Test event filtering and SSE (5 tests)

**Total: 13 E2E tests passing**

## Configuration
Environment variables (`.env`):
- `VITE_EEN_CLIENT_ID` - OAuth client ID
- `VITE_PROXY_URL` - API proxy URL
- `TEST_USER` - Test account username
- `TEST_PASSWORD` - Test account password

## Next Steps
1. Install een-api-toolkit package
2. Run een-setup-agents to install Claude Code agents
3. **RESTART Claude Code** to load the agents
4. Review AI-CONTEXT.md documentation
5. Begin Phase 1 implementation
