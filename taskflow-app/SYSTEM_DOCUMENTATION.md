# PhilFIDA TaskFlow System Documentation

## 1. Overview
TaskFlow is a React + Vite frontend for the Philippine Fiber Industry Development Authority (PhilFIDA) task management system. It is a client-side single-page application that communicates directly with a Supabase backend for authentication, database operations, realtime updates, file storage, and notifications.

The app supports three user roles:
- `Director` — full control, user management, dispatching tasks, archive management
- `Unit Head` — unit monitoring, assign tasks to unit personnel, view unit tasks
- `Employee` — personal dashboard, task acceptance, completion, chat, calendar view

## 2. Tech Stack
- Frontend: React 18, Vite
- Styling: Tailwind CSS
- State management: Zustand
- Routing: React Router DOM
- Backend-as-a-Service: Supabase (PostgreSQL + Storage + Realtime + Auth)
- Deployment: Vercel

## 3. Project Layout

```
taskflow-app/
├── index.html
├── package.json
├── postcss.config.js
├── tailwind.config.js
├── vercel.json
├── supabase-migration-v2.sql
├── src/
│   ├── App.jsx
│   ├── main.jsx
│   ├── index.css
│   ├── pages/
│   │   ├── LoginPage.jsx
│   │   ├── DashboardPage.jsx
│   │   ├── DirectorPage.jsx
│   │   ├── UnitHeadPage.jsx
│   │   └── PersonalCalendarPage.jsx
│   ├── components/
│   │   ├── ChatModal.jsx
│   │   ├── CreateTaskForm.jsx
│   │   ├── EditProfileModal.jsx
│   │   ├── EditTaskModal.jsx
│   │   ├── FileThumb.jsx
│   │   ├── GovHeader.jsx
│   │   ├── Lightbox.jsx
│   │   ├── NotificationBell.jsx
│   │   ├── PersonalCalendarSide.jsx
│   │   ├── PresenceToggle.jsx
│   │   ├── SettingsModal.jsx
│   │   ├── TaskTimeline.jsx
│   │   ├── UserManagement.jsx
│   │   └── UserStatusPopover.jsx
│   ├── hooks/
│   │   └── useSync.js
│   ├── lib/
│   │   ├── api.js
│   │   ├── notifSound.js
│   │   └── supabase.js
│   └── store/
│       └── useStore.js
```

## 4. Entry Points
- `src/main.jsx` renders the React app into `#root`, wraps the app with `BrowserRouter`, and unlocks audio on first user interaction.
- `src/App.jsx` defines route protection and redirects for:
  - `/` login route
  - `/dashboard` employee dashboard
  - `/unithead` unit head dashboard
  - `/calendar` personal calendar
  - `/director` director dashboard

## 5. Authentication
### Manual login
- `LoginPage.jsx` supports login using Personnel ID + password stored in Supabase `Users` table.
- Manual login checks `AccountStatus` and redirects by role.

### Google OAuth login
- Uses Supabase OAuth with `provider: 'google'`.
- Auth flow is handled with PKCE and `detectSessionInUrl: false`.
- `LoginPage.jsx` parses query/hash callback data and calls `exchangePkceAuthCode` + `handleGoogleCallback`.
- On Google login success:
  - existing users are matched by `Email`
  - new users are inserted into `Users` with `Role: 'Employee'` and `AccountStatus: 'Pending'`
  - new accounts require Director approval before full access

### Session persistence
- `src/store/useStore.js` stores `session` in Zustand with persistence under `philfida_session`.
- Only the `session` object persists, not `globalData`.

## 6. Supabase Integration
### Client configuration
- `src/lib/supabase.js` creates a Supabase client with:
  - hardcoded `SUPABASE_URL`
  - hardcoded `SUPABASE_ANON_KEY`
  - auth PKCE settings
  - realtime event throttling

### Data access and operations
- `src/lib/api.js` contains most business logic and database calls.
- Key tables used:
  - `Users`
  - `Tasks`
  - `Comments`
  - `Notifications`
  - `TaskHistory`
- `taskflow-files` storage bucket is used to store file attachments.

### Realtime sync
- `src/hooks/useSync.js` subscribes to Supabase Realtime changes for tables:
  - `Tasks`
  - `Comments`
  - `Notifications`
  - `Users`
- When any change occurs, the app re-fetches all relevant data.
- There is also a fallback poll every 30 seconds.

## 7. Core Data Model
The system operates around the following primary data entities.

### Users
- Columns referenced in code:
  - `ID`, `Name`, `Email`, `Unit`, `Office`, `Role`, `Password`, `ProfilePic`, `Status`, `AccountStatus`, `Designation`
- Roles: `Director`, `Unit Head`, `Employee`
- Account status: `Active`, `Pending`, `Deactivated`

### Tasks
- Columns referenced:
  - `TaskID`, `EmployeeID`, `EmployeeName`, `Title`, `Instructions`, `FileLink`, `Status`, `Archived`, `Deadline`, `Priority`, `Category`, `CreatedAt`, `ReceivedAt`, `CompletedAt`
- Status lifecycle: `Assigned` → `Received` → `Completed`
- Archive toggling uses `Archived: 'TRUE' / 'FALSE'`.

### Comments
- Columns referenced:
  - `ID`, `TaskID`, `SenderName`, `Message`, `TimeStamp`, `HiddenBy`
- Notes:
  - `Message` may be stored as plain text or JSON with `{ text, files }`
  - `HiddenBy` marks read messages per user

### Notifications
- Columns referenced:
  - `ID`, `UserID`, `Message`, `Type`, `IsRead`, `CreatedAt`, `TaskID`

### TaskHistory
- Columns referenced:
  - `TaskID`, `Action`, `Actor`, `Note`, `CreatedAt`

## 8. Major User Flows
### Director
- Monitor all active tasks and filter by unit, status, or search.
- Dispatch tasks using `CreateTaskForm`.
- View archived tasks and restore or delete them.
- Manage users with `UserManagement`.
- Perform bulk restore / bulk delete of selected tasks.
- See personnel status groups and task timelines.

### Unit Head
- View personal and unit task views.
- Dispatch tasks to unit employees.
- Monitor unit personnel availability and calendar.
- Accept or complete tasks on behalf of the unit.
- Open task chat and file attachments.

### Employee
- Access a task dashboard of tasks assigned to them.
- Accept tasks as `Received` and mark tasks `Completed`.
- Use in-task chat with optional file attachments.
- View deadlines, attachments, task timeline, and history.
- Use the personal calendar for task events and local todos.

### Calendar
- `PersonalCalendarPage.jsx` provides a user-specific calendar and todo list.
- Stores events and todos locally in browser `localStorage` using keys:
  - `pf_calendar_{userId}`
  - `pf_todos_{userId}`
- Syncs task deadlines from global tasks into the calendar view.

## 9. Key Reusable Components
- `CreateTaskForm.jsx` — dispatch tasks with attachments, priority tags, purposes, action notes, and references.
- `ChatModal.jsx` — task messaging, attachments, message read state.
- `NotificationBell.jsx` — realtime notification dropdown with sound and read-state handling.
- `TaskTimeline.jsx` — visual timeline for assigned / received / completed status plus history.
- `PresenceToggle.jsx` — availability management with Available / Official Travel / On Leave states.
- `UserManagement.jsx` — Director-only user approval, role updates, deactivation, deletion.
- `PersonalCalendarSide.jsx` — sidebar mini-calendar shown in dashboards.
- `EditProfileModal.jsx` & `SettingsModal.jsx` — profile updates and app settings.

## 10. File and Storage Handling
- `uploadFiles()` in `src/lib/api.js` uploads attachments to Supabase Storage bucket `taskflow-files`.
- Uploaded file URLs are returned and stored joined by `|`.
- Chat attachments are embedded into message payloads as text + file URL JSON.
- `Lightbox.jsx` renders preview/download UI for attachments.

## 11. Styling and UI
- Tailwind CSS is configured in `tailwind.config.js` with PhilFIDA brand colors.
- `index.html` loads Google font `DM Sans` and Bootstrap Icons.
- The UI uses custom classes and inline gradients in addition to Tailwind.

## 12. Deployment and Build
### Local development
```bash
cd taskflow-app
npm install
npm run dev
```

### Production build
```bash
cd taskflow-app
npm run build
```

### Vercel
- `vercel.json` rewrites all non-`assets/` routes to `index.html`.
- The app is intended to be deployed from the `taskflow-app` folder.

## 13. Important Notes
- Supabase keys are currently hardcoded in `src/lib/supabase.js`.
- Google OAuth flow uses PKCE with manual callback handling.
- `useSync` subscribes to Supabase realtime changes and also polls every 30 seconds.
- `session` is persisted to browser storage, while `globalData` is fetched from Supabase after login.
- Direct database operations are driven from frontend-only code; there is no server-side application code in this repository.

## 14. Supabase Migration
- `supabase-migration-v2.sql` adds `Unit` and `AccountStatus` columns to `Users` and backfills existing users to `Active`.

## 15. Recommended Documentation Inclusion
To make this documentation fully comprehensive, also include:
- Supabase schema definitions for all tables used.
- Required Supabase Auth and Google OAuth redirect settings.
- Any external environment requirements for deployment.
- Intent for each `AccountStatus` and role permission boundary.
