# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Style

- **Be token-efficient.** Read only the files needed for the task. Prefer targeted `grep` or line-range reads over reading whole files. Avoid re-reading files already in context.
- **No repetition.** Do not restate what was just said, re-explain completed steps, or summarize diffs the user can already see.
- **No error loops.** If a fix fails, diagnose the root cause before retrying — do not apply the same change twice. If stuck after two attempts, explain the blocker concisely and ask.
- **Communicate at altitude.** One sentence per update. State results and decisions directly; skip internal deliberation.

## Project Overview

**PHILFIDA TaskFlow** — a task management web app for a Philippine government agency (PHILFIDA). Built with React + Vite, Supabase (auth + database + storage), deployed on Vercel.

## Commands

All commands run from `taskflow-app/`:

```bash
npm run dev       # Start Vite dev server
npm run build     # Production build
npm run preview   # Preview production build locally
```

No test suite is configured. Lint is not configured. Type-checking is not configured (JavaScript only). Node 24 is required (`engines.node`), matching Vercel.

## Read this before touching auth or the Users table

**Never `select('*')` on `Users`.** The `Password` column is withheld from the `anon` role by column-level grants (`SECURITY-lock-passwords.sql`), so `*` expands to include it and the request fails with `permission denied for table Users`. Name the columns explicitly.

**Aggregates on `Users` also fail** for the same reason — `select('count')` needs table-wide SELECT. Probe a granted column instead.

**Login is server-side.** `loginUser()` calls the `login_user()` SECURITY DEFINER RPC, which compares the password inside the database and never returns it. It returns one row with a `login_error` field (`invalid_credentials` / `invalid_region` / `pending` / `deactivated`) or the user.

Passwords are still stored **in plain text**. Manual Personnel-ID sessions keep the password in the browser to authorise the director RPCs, which have no JWT to verify against.

## Architecture

### Frontend (`taskflow-app/src/`)

- **`App.jsx`** — Root router, session bootstrap, service-worker registration, push re-subscription, and a 30-minute idle logout shared across tabs via `localStorage`.
- **`store/useStore.js`** — Single Zustand store with `persist` (localStorage → sessionStorage fallback). Holds `session` and `globalData` (tasks, users, comments, notifications, history).
- **`lib/api.js`** — All Supabase DB/storage calls. `UNITS`, `OFFICES`, `REGIONS` live here. Uploads go to a **private bucket**; links are signed on read (1-hour expiry).
- **`lib/notifications.js`** — Desktop/push notifications. Always shows via `ServiceWorkerRegistration.showNotification()`; `new Notification()` throws on Android Chrome.
- **`components/LocationPicker.jsx`** — Leaflet map + Photon geocoder for travel venues. Lazy-loaded (~45 kB gzip).
- **`pages/`** — One page per role: `LoginPage`, `DashboardPage` (personnel), `UnitHeadPage`, `DirectorPage`, `RecordsPage`.
- **`components/`** — Shared UI. No component library — Tailwind with tokens in `src/styles/design-system.css`.
- **`hooks/useSync.js`** — Supabase Realtime subscriptions plus a polling fallback (2 min with realtime, 15 s on phones, where realtime is disabled).
- **`api/push-send.js`** — Vercel serverless function (not built by Vite). Takes only a notification **row id**; it reads the recipient and message from the database with the service-role key, so it cannot be used to push arbitrary text.

### Conventions worth knowing

- **Presence strings carry markers.** `Users.Status` looks like `Official Travel — X at Y (dates) [TO:<path>] [GEO:<lat>,<lng>]`. Always render through `stripStatusMarkers()`; build travel strings with `buildTravelStatus()`. Both in `lib/api.js`. Hand-building these strings is how markers previously leaked into the UI and got dropped on edit.
- **Task ownership matches `ActorID`, never the display name.** The `Dispatched` TaskHistory row stores the actor's name as it was at dispatch time, so renaming a user used to orphan their tasks. The classifier in `DirectorPage`/`RecordsPage` also has a catch-all bucket so a task can never be counted yet unrendered.
- **CSP is defined in two places** — a `<meta>` tag in `taskflow-app/index.html` *and* headers in `vercel.json`. Browsers enforce the intersection, so **both must be updated together**. The meta tag also applies in dev.
- **Availability auto-expiry** lives in `checkAndApplyScheduledPresence()` (exported from `PersonalCalendarTab.jsx`) and runs on every page, not only the calendar.

### Auth / Session

Two paths side by side:
1. **Google OAuth** via Supabase Auth. After callback, the email is looked up in `Users` to get the role.
2. **Personnel-ID login** — credentials in `Users`, verified by the `login_user()` RPC, session persisted in localStorage (no Supabase Auth session).

`runSessionBootstrap()` in `App.jsx` revalidates the persisted session on load without clearing it on transient network errors.

### Database (`complete-database-schema-fixed.sql`)

Supabase/Postgres. Tables: `Users`, `Tasks`, `Comments`, `Notifications`, `TaskHistory`, `PushSubscriptions`. RLS is enabled.

Roles: `Director`, `Unit Head`, `Records`, `Employee` — note **`Employee` is the stored value; the UI labels it "Unit Personnel"**.

Because the manual login flow talks to Supabase as `anon` with no `auth.uid()`, privileged writes go through `SECURITY DEFINER` RPCs rather than RLS policies: `login_user`, `director_update_user_role`, `director_set_account_status`, `director_delete_user`, `user_update_status`, `user_update_own_profile`, `mark_chat_read`, `unsend_comment`, `save_push_subscription`, `delete_push_subscription`.

### Roles & Pages

| Role | Page | Route |
|------|------|-------|
| Employee ("Unit Personnel") | DashboardPage | `/dashboard` |
| Unit Head | UnitHeadPage | `/unithead` |
| Director | DirectorPage | `/director` |
| Records | RecordsPage | `/records` |

### Environment

`taskflow-app/.env.local`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_VAPID_PUBLIC_KEY` — public half of the web-push keypair

Vercel also needs (server-side only, **never** prefixed `VITE_`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`. Without them `/api/push-send` returns 503 and the app falls back to in-app notifications.

### SQL Patch Files

Root-level `.sql` files are incremental patches applied by hand in the Supabase SQL editor. `complete-database-schema-fixed.sql` is the canonical full schema; see `DATABASE_RESTART_TUTORIAL.md` for replay order.

Applied in this project's history and required for the current code to work:
- `SECURITY-lock-passwords.sql` — withholds `Users.Password` from `anon`, adds `login_user()`
- `fix-records-role.sql` — allows the `Records` role, which the schema previously rejected
- `unsend-comment-rpc.sql`, `mark-chat-read-rpc.sql`, `user_update_status_rpc.sql`, `supabase-user-update-own-profile-rpc.sql`, `supabase-director-rpcs.sql`
- `push-subscriptions.sql` — `PushSubscriptions` table and its RPCs (needed only for push)
- `optional-drop-signatory.sql` — **not applied**; drops the leftover signatory columns from the removed routing-slip feature. It re-creates `login_user()` at the same time; the two steps must run together or login breaks.

## Removed features — do not reintroduce

- **Action/Routing Slip printing** and the routing-slip signatory setting. All client code is gone; the `SignatoryName`/`SignatoryDesignation` columns and `director_update_signatory()` remain in the database but are unreferenced.
- **`lib/pushNotifications.js`** — a non-functional stub replaced by `lib/notifications.js`.

## Outstanding

- All known accounts still use the password `password`, which was publicly readable before `SECURITY-lock-passwords.sql`. **Rotate every password.**
- Web push is inert until the Vercel env vars above are set. Desktop alerts work with permission alone while a tab is open.
- iOS delivers web push only to a Home Screen install (`public/manifest.webmanifest` is in place); Safari tabs cannot show notifications at all.
