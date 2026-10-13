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

## Read this first — local must never touch production

**The app has no server layer.** The browser talks to Supabase directly, so the
*only* thing separating local development from production is `VITE_SUPABASE_URL`
in `taskflow-app/.env.local`. One wrong value and `npm run dev` writes to live
personnel data.

**Check the target before running anything that starts the app or hits the DB:**

```bash
grep VITE_SUPABASE_URL taskflow-app/.env.local
```

Production is project ref `uyykiioakukzcmjxglyn`. A local stack is
`http://127.0.0.1:54321`. If dev is pointed at production, stop and say so.

This is not hypothetical: `cleanup-demo-announcements.sql` exists only because
demo data created while writing the user guide had to be scrubbed out of the live
database by hand.

### The two paths that reach production without a push

Committing locally is safe. Pushing to `main` deploys. But two things bypass git
entirely, and both are easy to do by reflex:

1. **Running a `.sql` patch in the Supabase SQL editor.** Patches are applied by
   hand and take effect in production the instant they run. There are no
   down-migrations. Apply to the local stack first, always.
2. **`vercel --prod` / `vercel deploy` from the CLI.** Ships the working tree,
   uncommitted changes included. Don't. Deployment is `git push` to `main`, and
   nothing else.

### Destructive SQL

`delete`, `drop`, `truncate`, and any `update` without a tight `where` need
explicit confirmation naming the target database — every time, including when the
same statement was approved earlier in the session.

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
- **`components/AnnouncementsTab.jsx` / `AnnouncementPopup.jsx`** — announcements. The tab is mounted on all four role pages; the popup lives in `App.jsx` and fires for any signed-in user. Per-recipient read/dismiss/archive state lives in `AnnouncementRecipients`, one row per recipient — never on the announcement itself, or one person dismissing hides it for everyone.
- **`pages/`** — One page per role: `LoginPage`, `DashboardPage` (personnel), `UnitHeadPage`, `DirectorPage`, `RecordsPage`.
- **`components/`** — Shared UI. No component library — Tailwind with tokens in `src/styles/design-system.css`.
- **CSS load order** — `index.css` imports `ui-enhancements.css` (opt-in classes: `.card-enhanced`, `.btn-enhanced`, `.hover-lift`), then `styles/design-system.css` holds the tokens, with `layout.css` and `components.css` on top. The enhancement classes are applied by hand where wanted, not globally.
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

Supabase/Postgres. Tables: `Users`, `Tasks`, `Comments`, `Notifications`, `TaskHistory`, `PushSubscriptions`, `Announcements`, `AnnouncementRecipients`. RLS is enabled.

Roles: `Director`, `Unit Head`, `Records`, `Employee` — note **`Employee` is the stored value; the UI labels it "Unit Personnel"**.

Because the manual login flow talks to Supabase as `anon` with no `auth.uid()`, privileged writes go through `SECURITY DEFINER` RPCs rather than RLS policies: `login_user`, `director_update_user_role`, `director_set_account_status`, `director_delete_user`, `user_update_status`, `user_update_own_profile`, `mark_chat_read`, `unsend_comment`, `save_push_subscription`, `delete_push_subscription`, `create_announcement`, `set_announcement_state`, `archive_announcement`.

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

**These files are now mirrored into `supabase/migrations/` in dependency order** —
see `supabase/README.md`. Prefer that ordering; the list below is the inventory.

Applied in this project's history and required for the current code to work:
- `add-region-column.sql` — `Region` on `Users` and `Tasks`; `loginUser()` and every region filter depend on it
- `add-checkbox-columns.sql` — `PriorityFlags`, `PurposeCheckboxes`, `ApprovalAction` on `Tasks`, written by `createTask()`
- `google-auth-rls-patch.sql` — `authenticated`-role policies matched by JWT email
- `comments-google-auth-update-policy.sql` — the UPDATE policy the patch above omitted; without it a Google user's chat never marks read
- `storage-anon-policy-patch.sql` — lets Personnel-ID (anon) logins upload
- `supabase-manual-mode-rls-patch.sql` — anon policies for manual login
- `SECURITY-lock-passwords.sql` — withholds `Users.Password` from `anon`, adds `login_user()`
- `fix-records-role.sql` — allows the `Records` role, which the schema previously rejected
- `unsend-comment-rpc.sql`, `mark-chat-read-rpc.sql`, `user_update_status_rpc.sql`, `supabase-user-update-own-profile-rpc.sql`, `supabase-director-rpcs.sql`
- `push-subscriptions.sql` — `PushSubscriptions` table and its RPCs (needed only for push)
- `announcements.sql` — `Announcements` + `AnnouncementRecipients` tables and their three RPCs

### Production has drift no file reproduces

Two changes exist in the live database that no `.sql` file in this repo creates.
Both were found by reading code against the schema, not from any record:

1. **`Users_Status_check` was dropped.** The base schema limits `Status` to three
   literals, but `buildTravelStatus()` writes `Official Travel — … [GEO:…]`, and
   a CHECK constraint is not bypassed by SECURITY DEFINER. Travel presence works
   in production, so the constraint must have been dropped there by hand.
2. **`SignatoryName` / `SignatoryDesignation` are never created.**
   `SECURITY-lock-passwords.sql` grants on them and `login_user()` returns them,
   so a fresh replay of these files fails on missing columns.

Both are reproduced in `supabase/migrations/20260101001500_reconcile_undocumented_prod_drift.sql`.
**Assume more drift exists** until `supabase db pull` has been diffed against the
migration set.
- `optional-drop-signatory.sql` — **not applied**; drops the leftover signatory columns from the removed routing-slip feature. It re-creates `login_user()` at the same time; the two steps must run together or login breaks.

## Removed features — do not reintroduce

- **Action/Routing Slip printing** and the routing-slip signatory setting. All client code is gone; the `SignatoryName`/`SignatoryDesignation` columns and `director_update_signatory()` remain in the database but are unreferenced.
- **`lib/pushNotifications.js`** — a non-functional stub replaced by `lib/notifications.js`.

## Change tracking

Every iteration gets an entry in [`CHANGELOG.md`](CHANGELOG.md) — newest first, one
block per change, with the commit hash as the revert handle and explicit notes on
what a revert does *not* undo (applied SQL, Vercel env vars, storage objects).
Add the entry as part of the change, not later. The template is at the bottom of
that file.

Reverting is `git revert --no-commit <hash>` plus whatever the entry's **Revert
notes** say about the database. There are no down-migrations; SQL patches are
forward-only and applied by hand.

## Current status — 2026-09-02

### Repository

- Branch `main`, in sync with `origin/main` (0 ahead, 0 behind). Remote: `devCharuzu/philfida-taskmanage`. No tags, no release branches.
- Latest commit `7235a5c` "refractor code base, added announcement feature, fixed bugs".
- Working tree: one modified file, `cleanup-demo-announcements.sql` (widened to also clear the demo task; fixes a `"ID"` vs `"TaskID"` correlated-subquery bug). Uncommitted, never run.
- Stale local branch `agents/update-readme-with-features` and remote `origin/devin/1779433039-fix-admin-system` — neither is part of the current line of work.

### Application

- ~17.5k lines across `taskflow-app/src`. React 18 + Vite 8, Zustand 4, Tailwind 3, Supabase JS 2, Leaflet, `web-push`. Node 24.
- Five pages, 17 components, 6 lib modules, one sync hook, one Zustand store, one Vercel function (`api/push-send.js`).
- Largest files, where changes concentrate: `DirectorPage.jsx` (1651), `PersonalCalendarTab.jsx` (1448), `UserProfileTab.jsx` (1069), `UnitHeadPage.jsx` (1031), `api.js` (906).
- Three CSS layers plus `index.css` and `ui-enhancements.css` (~2.5k lines of styling total). Design tokens are in `styles/design-system.css`; use them rather than raw values.
- No tests, no lint, no type-checking. Verification is `npm run build` plus manual exercise of the affected role page.

### Feature state

- **Working:** manual Personnel-ID login, Google OAuth, the four role dashboards, task lifecycle (Assigned → Received → Completed → Archived), in-task chat with attachments, notifications, personal calendar with availability auto-expiry, presence with travel venue map, Director user management, announcements.
- **Newest area:** announcements (`020c706` → `16c48e3`). Least battle-tested part of the app.
- **Deployment:** Vercel, auto-deploys on push to `main`. A revert is a deploy.

### Database

Nine tables live. All patches in the applied list above have been run against the
current Supabase project, plus `announcements.sql`. `optional-drop-signatory.sql`
is the only listed patch **not** applied — leave it that way unless you also
intend to lose the ability to cleanly revert `8730273`.

Leftovers that are intentionally still there: `Users.SignatoryName`,
`Users.SignatoryDesignation`, `director_update_signatory()` — unreferenced by any
client code.

### Known risks / outstanding

- **Passwords are plain text in `Users`, and all known accounts still use `password`.** They were publicly readable before `SECURITY-lock-passwords.sql`. **Rotate every one.** This is the top open item.
- Web push is inert until the Vercel env vars are set (`/api/push-send` returns 503 and the app falls back to in-app notifications). Desktop alerts work with permission alone while a tab is open.
- iOS delivers web push only to a Home Screen install (`public/manifest.webmanifest` is in place); Safari tabs cannot show notifications at all.
- Manual-mode sessions keep the password in the browser to authorise the director RPCs. Unavoidable while those RPCs have no JWT to verify against; it is a real exposure, not a stylistic one.
- Announcement RLS grants blanket `SELECT` to `anon` on both announcement tables — any holder of the publishable key can read every announcement in every region. Writes are locked to the RPCs; reads are not.
- `README.md` still describes three roles and 30-second polling. Both are wrong (four roles; 2 min with realtime, 15 s on phones) and it does not mention announcements at all.
- Docs drift generally: `SYSTEM_DOCUMENTATION.md` and `DATABASE_RESTART_TUTORIAL.md` both predate announcements, `Records`, and the password lock-down.
