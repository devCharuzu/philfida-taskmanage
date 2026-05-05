# PhilFIDA TaskFlow — Production & Local Reset (New Supabase + Connections)

**NOTE:** Prefer doing this during a planned maintenance window. You will wipe **Supabase PostgreSQL**, **Storage**, and **Auth identities** tied to this project—or start a **brand-new Supabase project** and repoint URLs/keys everywhere. Aligns with [`SYSTEM_DOCUMENTATION.md`](SYSTEM_DOCUMENTATION.md) (tables: `Users`, `Tasks`, `Comments`, `Notifications`, `TaskHistory`; bucket: `taskflow-files`; realtime on those tables).

---

## Part A — Decide: new project vs. gut existing project

| Approach | When to use | Data |
|----------|----------------|------|
| **New Supabase project** | Clean slate, safest “flawless” redo | Empty; old project can be archived later |
| **Same project** | Keep URL/team billing | Pause app, wipe schema + storage (advanced; easy to leave residue) |

**Recommendation:** Create a **new Supabase project** for prod, recreate DB from scripts, swap env vars on Vercel + local, then deprecate the old project.

---

## Part B — What the app expects (from system design)

### Database (PostgreSQL via Supabase)

- **`Users`** — `ID` (Personnel ID for manual login), `Name`, `Email`, `Password`, `Role` (`Director` | `Unit Head` | `Employee`), `Unit`, `Office`, `Designation`, `ProfilePic`, `Status`, `AccountStatus` (`Active` | `Pending` | `Deactivated`), timestamps  
- **`Tasks`** — lifecycle `Assigned` → `Received` → `Completed`; attachments in `FileLink`; `Archived` `TRUE`/`FALSE`  
- **`Comments`** — task thread; optional JSON in `Message`  
- **`Notifications`** — unread flag, link to optional `TaskID`  
- **`TaskHistory`** — audit trail  

### Storage

- Bucket **`taskflow-files`** (private bucket; RLS on `storage.objects` in the consolidated script).

### Frontend connection (`taskflow-app/src/lib/supabase.js`)

Variables **must** be set (publishable keys, new Supabase naming):

```bash
VITE_SUPABASE_URL=https://<project-ref>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Copy from **`taskflow-app/.env.local.example`** → `.env.local` locally. On **Vercel**, set the same names for the **`taskflow-app`** project deployment.

---

## Part C — One-time: create the new Supabase project

1. [Supabase Dashboard](https://supabase.com/dashboard) → **New project** → pick org, DB password (store safely), region.
2. Wait until the project shows **Healthy**.
3. **Settings → API**  
   - Copy **Project URL** → `VITE_SUPABASE_URL`  
   - Copy **Publishable key** (`sb_publishable_...`) → `VITE_SUPABASE_PUBLISHABLE_KEY`  
   *(If you disabled legacy JWT keys entirely, ignore legacy `anon`; the app expects the publishable key as implemented in `supabase.js`.)*

---

## Part D — Apply database + storage + realtime

1. **SQL Editor → New query.**
2. Paste the entire contents of repo root **`complete-database-schema-fixed.sql`** and **Run**.
3. Confirm success messages at the end (tables, bucket `taskflow-files`, realtime publication).
4. **Existing projects:** if the schema predates RPCs, also run **`supabase-director-rpcs.sql`** (director approve/delete/role without broken `auth.uid()` RLS).
5. **Optional:** Run **`taskflow-app/supabase-migration-v2.sql`** after that. On a freshly created DB from step 2, columns `Unit` / `AccountStatus` often already exist; the script uses `IF NOT EXISTS` — safe but usually redundant.

### Director bootstrap + manual login (important)

The default script inserts `Users.ID = 'DIR-001'` but stores `Password` as a **bcrypt** string. **`loginUser` in `api.js` compares passwords as plain text** (`Password === typed password`). For first manual login:

In **SQL Editor**, set a known plain password:

```sql
UPDATE public."Users"
SET "Password" = 'admin123'
WHERE "ID" = 'DIR-001';
```

Then log in with **Personnel ID** `DIR-001` and that password — **then change it** inside the app or via SQL.

### Manual login / self-registration vs. RLS

Personnel ID login and the registration tab use the **`anon`** JWT before Google OAuth establishes **`authenticated`**. **`complete-database-schema-fixed.sql`** already creates **`Anon select Users for login`** and **`Anon insert pending Users`** so you do not run extra SQL for that.

*Tightening later (e.g. Edge Function + service role only) would be an architecture upgrade.*

---

## Part E — Google OAuth (optional but recommended before go-live)

OAuth uses **`window.location.origin`** as `redirectTo` (`api.js`). Configure **both**:

1. **Supabase → Authentication → URL configuration**  
   - **Site URL:** `http://localhost:5173` for local; your production URL for prod (or vice versa—you can switch per environment by redeploy only if you rely on `.env`; same binary should list **every** redirect you use).  
   - **Additional Redirect URLs:** add explicitly:  
     - `http://localhost:5173`  
     - `http://localhost:5173/`  
     - `https://<your-vercel-domain>`  
     - `https://<your-vercel-domain>/`

2. **Google Cloud Console** (OAuth Client for Web): authorized **JavaScript origins** and **redirect URIs** must include Supabase callback URLs documented in Supabase **Authentication → Providers → Google**.

3. **Supabase Authentication → Providers → Google** — enable & paste Client ID / Secret.

Existing Google-linked users disappear when you recreate the DB; they must come back via OAuth flow and **`handleGoogleCallback`** (new `Pending` row or matched by Email).

---

## Part F — Local development

```bash
cd taskflow-app
cp .env.local.example .env.local
# Paste new VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY
npm install
npm run dev
```

Clear stale client state:

- Browser **local/session storage** keys like `philfida_session`
- Anything under `pf_calendar_*` / `pf_todos_*` if you rely on calendar local data

Hard-refresh or use a fresh browser profile once after switching backends.

---

## Part G — Production (Vercel)

1. Vercel project → **Settings → Environment Variables** for **Production**: set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.  
   *(Ensure Preview/Development envs exist if you use them.)*

2. **Redeploy** so the SPA bundle embeds the new values (`import.meta.env` is injected at **build time**).

3. Update Supabase **Redirect URLs / Site URL** to match production origin.

---

## Part H — Optional: `create-director-account.sql`

This file helps insert another director keyed by **`Email`**; if you run it manually, **`ID`** must comply with **`TEXT PRIMARY KEY`** (`Users` does not auto-generate IDs). Prefer **updating/COPY** from Dashboard or aligning `ID` with how your org assigns Personnel IDs after the base schema seeds `DIR-001`.

---

## Part I — Smoke test checklist

- [ ] SQL script finished without errors; `taskflow-files` bucket exists (**Storage → Buckets**).  
- [ ] Director **`DIR-001`** login works **after plain password `UPDATE`** (or your chosen ID/password SQL).  
- [ ] Dispatch task, upload attachment, verify file in **`taskflow-files`**.  
- [ ] Notifications + realtime: two browsers, different roles, see updates without relying only on 30s polling.  
- [ ] Google sign-in succeeds from local + prod once redirect URLs align.  

---

## Part J — Decommission old production

After traffic is migrated:

1. Rotate any secrets that ever touched the old project (optional but good hygiene).  
2. Remove old Vercel env vars referencing the obsolete Supabase URLs/keys → redeploy.  
3. Pause or delete the old Supabase project when backups are resolved.
