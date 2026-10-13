# `supabase/` — local stack definition

Migrations and seed data for the **local** development stack. See
`../LOCAL_DEV_SETUP.md` for the full setup and the promotion path.

```bash
supabase start      # boot the local stack (needs Colima running)
supabase db reset   # rebuild local from every migration + seed.sql
```

## What `migrations/` is — and is not

These files are a **reconstruction** of production's schema, assembled from the
root-level `.sql` patches in dependency order. They are what builds your local
database.

They are **not** a verified copy of production. Production was built by hand in
the Supabase SQL editor over months, so the repo's files are the record of what
was *intended*, not proof of what is *there*. Two pieces of drift were already
found by reading application code against the schema — see
`20260101001500_reconcile_undocumented_prod_drift.sql`. There may be more.

**Do not treat this as the production baseline until it has been reconciled**
(Phase 3 of `LOCAL_DEV_SETUP.md`): run `supabase db pull` against the linked
production project, diff the generated schema against these migrations, and fold
any differences into the drift migration. Only then is `supabase db push` safe.

## Security caveat for the manual login model

The reconstructed policies give the shared `anon` role broad access so the SPA's
Personnel-ID login can use Supabase without a per-user Auth token. The browser's
publishable key is public, so those policies do not identify which person is
making a request. In this migration set, `anon` can read the user roster, read
and modify task/chat/notification data, and read files from the taskflow storage
bucket. The password-column grant in migration `001600` does not establish
per-user access for those requests. Several `SECURITY DEFINER` RPCs also trust
identity values supplied in the request, including `unsend_comment`,
announcement operations, and push-subscription writes/deletes.

This is confirmed in the repository's migrations; it does not establish which
policies currently exist in production. Keep local data fabricated. Before
using this policy model with real records or promoting it to production, move
Personnel-ID operations behind verified per-user authentication and replace the
broad `anon` policies with scoped policies.

## Order

Dependency order, not chronological. It matters:

| # | Migration | Why here |
|---|---|---|
| 000100 | `base_schema` | Tables, RLS, storage bucket, realtime publication |
| 000200 | `add_region_columns` | Must precede `security_lock_passwords`, which grants on `Region` |
| 000300 | `add_task_checkbox_columns` | `PriorityFlags`, `PurposeCheckboxes`, `ApprovalAction` — written by `createTask()` |
| 000400 | `google_auth_rls_policies` | `authenticated`-role policies |
| 000500 | `comments_google_auth_update_policy` | Fixes an omission in 000400; must follow it |
| 000600 | `storage_anon_policies` | Uploads for Personnel-ID (anon) logins |
| 000700 | `manual_mode_rls_policies` | Drops and recreates anon policies; must follow both policy migrations |
| 000800 | `director_rpcs` | Defines `_taskflow_verify_director_actor`, used by later RPCs |
| 000900–001200 | profile / status / chat-read / unsend RPCs | Independent of each other |
| 001300 | `fix_records_role` | Widens the Role CHECK **and** redefines `director_update_user_role` from 000800 — must follow it |
| 001400 | `push_subscriptions` | Standalone |
| 001500 | `reconcile_undocumented_prod_drift` | **Must precede 001600** — creates the signatory columns it grants on |
| 001600 | `security_lock_passwords` | Revokes `Password` from anon, adds `login_user()` |
| 001700 | `announcements` | Newest feature |
| 20261013 02:44 | `fix_chat_read_name_matching` | Uses exact HiddenBy name tokens to avoid overlapping-name false reads |
| 20261013 04:00 | `shared_presence_schedules` | Persists future travel/leave across accounts and adds verified owner write RPCs |

## Not migrations

Two root `.sql` files are deliberately excluded — they are data operations, not
schema:

- `create-director-account.sql` — replaced by `seed.sql`, with fabricated users
- `cleanup-demo-announcements.sql` — a one-off production cleanup

`optional-drop-signatory.sql` is also excluded: it has never been applied to
production, and adding it here would put local out of sync with live.

## Seed data

`seed.sql` is entirely fabricated — fake names, `@example.test` emails, the
password `localdev` for every account. **Never** load a production dump in its
place; it carries real personnel records and plain-text passwords.

It covers every role, all three task states, an overdue task, an archived task, a
Pending and a Deactivated account, and a second region for testing isolation.

One row does double duty as a regression test: `TEST-EMP-02` is seeded with a
full `Official Travel — … [GEO:…]` presence string. If the drift migration is
ever dropped, the base `Users_Status_check` constraint comes back and the seed
fails loudly instead of leaving you to discover it through a broken feature.

## Unverified

The Supabase CLI is available, but local Postgres did not respond on
`127.0.0.1:54322` during the current audit. This migration set has not been
validated with `supabase db reset`; expect that run to surface ordering or
syntax problems before relying on the local schema.
