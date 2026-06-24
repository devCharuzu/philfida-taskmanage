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

No test suite is configured. Lint is not configured. Type-checking is not configured (JavaScript only).

## Architecture

### Frontend (`taskflow-app/src/`)

- **`App.jsx`** — Root router. Handles Supabase Auth session bootstrap on load (supports both Google OAuth and custom personnel-ID sessions). Routes are role-gated via `ProtectedRoute`.
- **`store/useStore.js`** — Single Zustand store with `persist` middleware (localStorage → sessionStorage fallback). Holds `session` (logged-in user) and `globalData` (tasks, users, comments, notifications, history fetched on login).
- **`lib/supabase.js`** — Supabase client singleton.
- **`lib/api.js`** — All Supabase DB/storage calls. Constants for `UNITS`, `OFFICES`, `REGIONS` live here. File uploads go to a **private bucket** using signed URLs (1-hour expiry).
- **`pages/`** — One page per role: `LoginPage`, `DashboardPage` (staff), `UnitHeadPage`, `DirectorPage`, `RecordsPage`.
- **`components/`** — Shared UI pieces. No component library — pure Tailwind CSS with custom design tokens in `src/styles/design-system.css`.
- **`hooks/useSync.js`** — Real-time sync via Supabase Realtime subscriptions.

### Auth / Session

Two auth paths exist side-by-side:
1. **Google OAuth** via Supabase Auth (`supabase.auth`). After OAuth callback, the user's email is looked up in the `Users` table to get their role.
2. **Personnel-ID login** — Custom credentials stored in `Users` table, session persisted in localStorage (no Supabase Auth session).

On every app load, `runSessionBootstrap()` in `App.jsx` revalidates the persisted session against the DB without clearing it on transient network errors.

### Database (`complete-database-schema-fixed.sql`)

Supabase/Postgres. Key tables: `Users`, `Tasks`, `Comments`, `Notifications`, `History`. RLS is enabled — patches for specific RLS scenarios are in the root-level `.sql` files (apply via Supabase SQL editor or MCP).

User roles: `Staff`, `Unit Head`, `Director`, `Records`.

### Roles & Pages

| Role | Page | Route |
|------|------|-------|
| Staff | DashboardPage | `/dashboard` |
| Unit Head | UnitHeadPage | `/unithead` |
| Director | DirectorPage | `/director` |
| Records | RecordsPage | `/records` |

### Environment

Env vars in `taskflow-app/.env.local`:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

See `taskflow-app/.env.local.example` for the template.

### SQL Patch Files

Root-level `.sql` files are incremental schema/RLS patches applied manually to Supabase. Apply them in order when resetting the DB (see `DATABASE_RESTART_TUTORIAL.md`). `complete-database-schema-fixed.sql` is the canonical full schema.
