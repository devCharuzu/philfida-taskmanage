# CHANGELOG — PHILFIDA TaskFlow

Change log **and revert handbook**. One entry per iteration. Newest first.

**The revert handle is the git commit hash.** This file does not snapshot code —
git already does. What it adds is the part git cannot recover: *what a change was
for*, *what else it touched* (SQL patches, Vercel env vars, Supabase state), and
*what has to be undone alongside the code* so a revert actually lands.

## [2026-10-13] Scheduling welcome and pending application updates

- Show one shared travel/leave welcome modal for every role on sign-in, including advance filings as soon as the roster refreshes (within 15 seconds for other accounts).
- Save the automatic-popup opt-out per account and browser; keep the Scheduled button available to reopen and reset it.
- Keep personal calendars and automatic status changes restricted to their owner. Clear stale account data on logout and ignore late sync responses from another account.
- Include pending shared scheduling, multiple-recipient dispatch, chat read matching, push subscription, and local-development changes; preserve newer GitHub profile and mobile download improvements.
- Validation: React interaction tests for all four roles and advance filings, system regression suite, production build, and live deployment verification.
- Revert handle: release commit containing this entry. Reverting code does not remove shared schedules or reverse previously applied database SQL. The chat read SQL patch was applied to production after local verification; reverting code does not undo that patch. Production database backups are intentionally excluded from GitHub.

## How to use this file

**Adding an entry** — at the end of every iteration, before or right after the
commit, prepend a new `## [YYYY-MM-DD] <short title>` block using the template at
the bottom. Fill in the commit hash once you have it (`git rev-parse --short HEAD`).

**Reverting one iteration:**

```bash
git revert --no-commit <hash> && git status
```

Then read that entry's **Revert notes** — code alone is usually not the whole
change. If the entry lists a SQL patch, the database still has it: undo it by
hand in the Supabase SQL editor, or leave it (most patches here are additive and
harmless to leave in place — the entry says which).

**Going back to a known-good point** (does not rewrite history):

```bash
git checkout <hash> -- taskflow-app/src
```

**Inspecting before deciding:**

```bash
git show --stat <hash>
```

**Rules of the road**
- Never `git push --force` to `main` — this repo has no tags and no release branches; force-pushing is the one action nothing here can recover.
- Database patches are forward-only. There are no down-migrations. Anything destructive gets a `-- REVERSE:` comment block at the top of its `.sql` file.
- `main` is deployed to Vercel on push. A revert is a deploy; treat it as one.

---

## [UNRELEASED] — working tree, not yet committed

**Status:** repo cleanup + change tracking + the local-development isolation plan.
Five files deleted, seven dangling references repaired, `npm run build` green.

- `supabase/` — **new.** 17 ordered migrations reconstructing the schema, a fabricated `seed.sql`, and a README explaining what the set is and is not. Nothing executed — the CLI is not installed, so first `supabase db reset` will likely surface ordering issues.
- `CLAUDE.md` — the applied-patch list was **incomplete**: it omitted `add-region-column`, `add-checkbox-columns`, `google-auth-rls-patch`, `comments-google-auth-update-policy`, `storage-anon-policy-patch`, and `supabase-manual-mode-rls-patch`, all of which the running code depends on. Also documents two pieces of production drift no file reproduces.
- `LOCAL_DEV_SETUP.md` — **new.** Complete step-by-step runbook (Steps 1–6). Step 1b corrected: the original said to use the direct connection on 5432, but on projects created since early 2024 that host is IPv6-only, so it fails on IPv4 networks with an error that looks like a network fault. The session pooler (also 5432, different host *and username*) is now the recommended default; the transaction pooler on 6543 still cannot be used at all for a local Supabase sandbox that cannot reach production, plus the deferred promotion path. Written, not yet executed. Root cause it addresses: `.env.local` points at the production project, so `npm run dev` has been writing live data.
- `taskflow-app/src/lib/supabase.js` — `validateEnvironment()` now accepts a local Supabase stack. It rejected any non-`https://` URL and any key not starting with `sb_`, and in dev those errors *throw* at module load rather than warning, so the app would not have rendered against `http://127.0.0.1:54321` with its JWT key. Both rules are gated on a new `isLocalSupabase` test; a deployed build has an https URL, so production validation is unchanged. The pattern is anchored both ends and matches only `127.0.0.1`/`localhost` plus a port — verified against 9 cases including `http://127.0.0.1.evil.com:80` and `http://localhost:1@evil.com`, both correctly rejected. `npm run build` green.
- `CLAUDE.md` — new top section "Local must never touch production", placed above the auth rules because it gates every other action.

- `.gitignore` — now ignores `.claude/settings.local.json` (previously only covered by a *global* excludes file on one machine, so any teammate cloning this repo would have committed their own local permission settings) and `.cache/` / `.turbo/`.
- `taskflow-app/.vercelignore` — added `.agents` and `.claude`, so the ~40 vendored Supabase agent-skill markdown files stop being uploaded on every deploy. Build output is unaffected.
- `CLAUDE.md` — change-tracking section, `## Current status` section, and the announcements feature (tables, RPCs, components, patch file) which was entirely undocumented.
- `CHANGELOG.md` — this file, new.
- `cleanup-demo-announcements.sql` — widened from "delete the three DEMO
  announcements" to also delete the demo announcement and the demo task
  (`Submit Q3 Regional Compliance Report`) created for the user-guide
  screenshots. Fixes a real bug in the original: `select "ID" from "Tasks"`
  silently resolved to the outer table's `"ID"` (a correlated reference) and
  failed with `text = integer`; every subquery now names `"TaskID"` explicitly.

- `SYSTEM_DOCUMENTATION.md`, `DATABASE_RESTART_TUTORIAL.md`, `PHILFIDA_TASKFLOW_MANUAL.md`, `taskflow-app/README.md` — the seven references to the deleted `supabase-migration-v2.sql` now point at `complete-database-schema-fixed.sql` and the patch list in `CLAUDE.md`. One of them (`README.md:248`) was a broken link before this change: it pointed at `./taskflow-app/supabase-migration-v2.sql` from inside `taskflow-app/`.

### Deletions — repo cleanup

| File | Why it can go |
|------|---------------|
| `taskflow-app/supabase-migration-v2.sql` | Adds `Users."Unit"` and `Users."AccountStatus"`. Both are in `complete-database-schema-fixed.sql` (lines 17, 22) with indexes. `DATABASE_RESTART_TUTORIAL.md` already calls running it "safe but usually redundant". **Removing it requires editing 4 docs that reference it** — `SYSTEM_DOCUMENTATION.md` (2×), `PHILFIDA_TASKFLOW_MANUAL.md`, `DATABASE_RESTART_TUTORIAL.md` step 5, `taskflow-app/README.md` (3×). |
| `taskflow-app/UI_IMPLEMENTATION_GUIDE.md` | April 2026 design *proposal* with a three-phase checklist for work that shipped. Nothing links it, and it documents `GovHeader.jsx`, which no longer exists. The CSS it proposed (`ui-enhancements.css`, `.card-enhanced`, `.btn-enhanced`) **is still live and imported** by `src/index.css:10` — keep the CSS, drop the guide. |
| `taskflow-app/.gitignore` | Every pattern is already covered by the root `.gitignore`. Two ignore files for one repo is two places to look. |
| `taskflow-app/.env` | Every line is a comment — a placeholder duplicating `.env.local.example`. Vite loads it before `.env.local`, so it contributes nothing but confusion. **Untracked: git cannot restore it.** |
| `taskflow-app/dist/` | 3.1 MB of build output. Regenerate with `npm run build`. **Untracked, but fully regenerable.** |

**Revert notes:** the three deletions are staged, not yet committed — recover any
of them right now with `git restore --staged --worktree <path>`, or with
`git checkout <hash>~1 -- <path>` once committed. `.env` and `dist/` were never in
git: `dist/` was rebuilt by the verification build, and `.env` held only comments.

### Deliberately kept

- **Root `*.sql` patch files** — the hand-applied replay history. `DATABASE_RESTART_TUTORIAL.md` depends on them in order. Not clutter.
- **`taskflow-app/.agents/skills/**` (40 files) + the `.claude/skills` symlinks** — a deliberate vendored install pinned by `skills-lock.json`. Redundant if every contributor has the Supabase skill plugin, but that is not this repo's call to make. Now excluded from deploys instead.
- **`cleanup-demo-announcements.sql`** — meant to be run once and deleted. It has not been run yet.
- **`public/google158d2925800a6a22.html`** — Google Search Console domain verification. Looks like junk, is not.
- **`README.md`, `SYSTEM_DOCUMENTATION.md`, `PHILFIDA_TASKFLOW_MANUAL.md`** — badly stale (three roles, 30-second polling, no announcements, no `Records`), but user-facing documentation is a rewrite, not a delete.

- `cleanup-demo-announcements.sql` — widened from "delete the three DEMO
  announcements" to also delete the demo announcement and the demo task
  (`Submit Q3 Regional Compliance Report`) created for the user-guide
  screenshots. Fixes a real bug in the original: `select "ID" from "Tasks"`
  silently resolved to the outer table's `"ID"` (a correlated reference) and
  failed with `text = integer`; every subquery now names `"TaskID"` explicitly.

**Revert notes:** `git checkout -- cleanup-demo-announcements.sql`. Code-only,
nothing applied to the database — this is a one-off script that has not been run.
It is meant to be run once and then deleted.

---

## [2026-08-14] Refactor, announcements feature, bug fixes — `7235a5c`

Umbrella commit for the announcements iteration. The commit itself only adds
`.gitignore` (46 lines: env files, keys, DB dumps, PDFs, the `__seed.html` test
scaffold); the feature landed across `020c706`, `38ec5bf`, `16c48e3`.

**Revert notes:** reverting `7235a5c` alone only restores the old `.gitignore`
and will start tracking build output and env files again. Don't. To back the
announcements feature out entirely, revert `16c48e3`, `38ec5bf`, `020c706` in
that order, then drop the tables (below).

---

## [2026-08-14] Google sign-in for existing users; uniform sidebar header — `16c48e3`

Fixed Google OAuth failing for users who already had a `Users` row; unified the
sidebar header across the four role pages; removed dead code.

**Revert notes:** code-only. Reverting re-breaks Google sign-in for existing
users — the manual Personnel-ID path is unaffected and remains the fallback.

---

## [2026-08-14] "Read more" opened the list, not the announcement — `38ec5bf`

`AnnouncementPopup` "Read more" navigated to the announcements tab instead of the
specific announcement.

**Revert notes:** code-only, cosmetic. Safe to revert in isolation.

---

## [2026-08-14] Add announcements — `020c706`

New feature. Director / Records / Unit Head compose an announcement, pick
recipients, optionally attach files and set an expiry. Recipients get a popup on
next sign-in until dismissed, then can archive it.

- Code: `components/AnnouncementPopup.jsx`, `components/AnnouncementsTab.jsx`,
  announcement functions in `lib/api.js`, tab wired into all four role pages.
- **Database: `announcements.sql` — applied.** Adds tables `Announcements` and
  `AnnouncementRecipients`, three indexes, RLS read policies for `anon`, and the
  SECURITY DEFINER RPCs `create_announcement`, `set_announcement_state`,
  `archive_announcement`.

**Revert notes:** reverting the code leaves the tables in place, which is
harmless — nothing else reads them. To remove the database side too:

```sql
drop table if exists public."AnnouncementRecipients";
drop table if exists public."Announcements";
drop function if exists public.create_announcement(text,text,text,text,timestamptz,text[]);
drop function if exists public.set_announcement_state(bigint,text,boolean,boolean,boolean);
drop function if exists public.archive_announcement(bigint,text,boolean);
```

**This destroys every announcement and every per-recipient read state.** Export
both tables first if the data matters.

---

## [2026-08-14] Failed availability write looked successful — `77e9776`

A failed presence/availability write reported success to the person making it.

**Revert notes:** code-only. Reverting reintroduces silent data loss on presence
updates. Don't revert this one on its own.

---

## [2026-08-13] Docs: bring CLAUDE.md in line with the system — `126a71f`

**Revert notes:** documentation only, zero runtime effect.

---

## [2026-08-13] Remove the Action/Routing Slip feature — `8730273`

All client code for routing-slip printing and the signatory setting deleted.

**Revert notes:** the database still carries `Users.SignatoryName`,
`Users.SignatoryDesignation` and `director_update_signatory()` — unreferenced but
intact, so reverting the code restores a working feature with no SQL replay.
`optional-drop-signatory.sql` would drop them; **it has not been applied**, and
if it ever is, this commit stops being cleanly revertible. That file also
re-creates `login_user()` in the same transaction — the two steps must run
together or login breaks.

---

## [2026-08-13] Move to Node 24 for Vercel — `3e22796`

`engines.node: "24.x"` in `taskflow-app/package.json`.

**Revert notes:** code-only, but must match the Node version configured in the
Vercel project settings. Reverting here without changing Vercel gets a build
mismatch.

---

## [2026-08-13] Presence flip-flopped every 30s; exclude /api from SPA rewrite — `a47fea2`

Two fixes: presence oscillating on the polling interval, and `vercel.json`
rewriting `/api/*` into the SPA so `/api/push-send` never reached the function.

**Revert notes:** touches `vercel.json`. Reverting breaks web push in production
(the function stops being reachable) while leaving dev unaffected — an easy one
to miss locally.

---

## [2026-08-13] Connection probes used select('count') — `78a1355`

`select('count')` on `Users` needs table-wide SELECT, which `anon` does not have
after the password lock-down. Probes a granted column instead.

**Revert notes:** code-only. Reverting makes every connection probe fail with
`permission denied for table Users` as long as `SECURITY-lock-passwords.sql`
stays applied — which it must.

---

## [2026-08-13] Ambiguous column reference in login_user() — `67805f6`

**Revert notes:** SQL, applied by hand. Reverting the file does nothing on its
own; the live function must be re-created from whichever version you want. Do not
revert — the older definition fails at runtime.

---

## [2026-08-13] Stop exposing plaintext passwords via the anon key — `ffc4608`

**Security fix.** `SECURITY-lock-passwords.sql` — applied. Withholds
`Users.Password` from the `anon` role by column grant and adds the `login_user()`
SECURITY DEFINER RPC so the comparison happens inside the database.

**Revert notes: do not revert.** Undoing the grant republishes every password to
anyone holding the publishable key. The code depends on it too — `select('*')` on
`Users` now fails by design, and several call sites were rewritten to name
columns explicitly.

---

## [2026-08-13 and earlier] Pre-log history

Commits before `ffc4608` predate this file: `257aeeb` (UI standardization, map
venue picker, web push), `4d9854a`, `5148545`, `a09c513`, and earlier. Read them
with `git show --stat <hash>`. Treat them as one baseline rather than individually
revertible points — several have terse messages and mixed concerns.

---

## Entry template

```markdown
## [YYYY-MM-DD] Short title — `<short-hash>`

What changed and why, in two or three lines.

- Code: files or areas touched.
- Database: `patch-name.sql` — applied / not applied / n/a.
- Env / infra: new Vercel or `.env.local` variables, or n/a.

**Revert notes:** what `git revert <hash>` restores, what it does NOT undo
(applied SQL, env vars, storage objects), and whether reverting is safe.
```
