# Local Development Setup — Step by Step

A working local copy of TaskFlow that **cannot reach the live database**, so you
can build, debug and revise without any risk to the users on the deployed system.

Steps 1–6 below touch production exactly once, and only to read from it (Step 1,
the backup). Everything else happens on your machine.

**Time:** roughly 2 hours, most of it waiting on downloads. Step 1 alone is 15
minutes and is worth doing today even if you stop there.

**Cost:** nothing. Every tool here is free and open source. See
[Why not Docker Desktop](#why-not-docker-desktop).

---

## Why this is needed

The app has no server layer — the browser talks to Supabase directly. The only
thing deciding whether you are hitting production or a sandbox is one line in
`taskflow-app/.env.local`, which currently names the **live** project
(`uyykiioakukzcmjxglyn`).

So `npm run dev` today gives you a client pointed at real data, with every write
path the live app has. Every test login, every task created to check a layout,
every presence toggle lands in the table your users are reading.
`cleanup-demo-announcements.sql` exists in this repo because that already
happened once and had to be scrubbed by hand.

---

## Step 1 — Back up production

**Do this before anything else, and do it even if you abandon the rest.**

Supabase's free plan does not include restorable backups. Right now there is no
recovery path for the live system — not from this work, not from a mistaken click
in the dashboard, not from anything.

### 1a. Install `pg_dump`

```bash
brew install libpq
```

```bash
echo 'export PATH="/opt/homebrew/opt/libpq/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc
```

`libpq` is used here rather than `supabase db dump` on purpose: it gives you
`pg_dump` directly, with no container runtime, so the backup is not blocked
behind the Colima setup in Step 3.

```bash
pg_dump --version
```

Expect `pg_dump (PostgreSQL) 17.x` or newer. A newer `pg_dump` can dump an older
server; the reverse fails.

### 1b. Get the connection string

In the Supabase Dashboard, open your project and look for **Connect** in the top
bar. (On older layouts it is **Project Settings → Database → Connection string**.
Supabase moves this; if neither matches what you see, search the dashboard for
"connection string".)

You will be offered **three** connection strings. They are not interchangeable,
and picking the wrong one fails in two different ways.

| | Host / port | Works with `pg_dump`? |
|---|---|---|
| **Transaction pooler** | `...pooler.supabase.com:6543` | **No** |
| **Session pooler** | `...pooler.supabase.com:5432` | Yes — start here |
| **Direct connection** | `db.<ref>.supabase.co:5432` | Yes, if your network has IPv6 |

**Start with the Session pooler.** It is the one most likely to work first try.

**Never the transaction pooler (6543).** Transaction mode hands you a different
backend connection between statements, so session state does not survive.
`pg_dump` needs a single session throughout: it opens a repeatable-read
transaction to get a consistent snapshot and sets session parameters. Against
6543 it fails partway, sometimes after appearing to start — which is worse than
failing immediately, because you may not notice.

**Why not direct first?** On projects created since early 2024, the direct
connection is **IPv6-only** — IPv4 is a paid add-on. If your network is IPv4-only
the hostname simply will not resolve or connect, and the error looks like a
network fault rather than a configuration choice. The session pooler is reachable
over IPv4, which is why it is the safer default. If direct works for you, it is
equally fine.

Note the **username differs** between them, which is easy to miss when copying:

- Direct: `postgres`
- Session pooler: `postgres.uyykiioakukzcmjxglyn` (your project ref is part of it)

Copy the string exactly as the dashboard gives it rather than editing one into
the other.

There are also multiple pooler **clusters** per region — `aws-0-…`, `aws-1-…` —
and each knows only its own tenants. Using the wrong one gives
`FATAL: (ENOTFOUND) tenant/user postgres.<ref> not found`, which looks like a
credential problem but is not; it is rejected at tenant lookup, before any
password check. This is why the string must be copied from the dashboard rather
than assembled by hand. For this project the working value is
`aws-1-ap-southeast-1.pooler.supabase.com` (verified 2026-09-02).

### The password

`[YOUR-PASSWORD]` is the **database password**, set when the project was created.
It is not the anon key, not the service-role key, and not your Supabase account
password.

If it is lost, reset it on that same page. **For this app, a reset is safe** —
the deployed site authenticates with the publishable (anon) key and
`/api/push-send` uses the service-role key. Neither is the database password, so
rotating it does not affect the live site or its users. Only tools connecting
directly to Postgres would need updating, and this project has none.

### If the password contains punctuation

A connection URI parses `:`, `@`, `/`, `?` and `#` as structure. A password
containing any of them will be misread, usually as a confusing "could not
translate host name" error. Supabase-generated passwords are alphanumeric, but a
hand-chosen one may not be. If you hit that, skip the URI and pass the parts
separately:

```bash
PGPASSWORD='your-password' pg_dump -h db.uyykiioakukzcmjxglyn.supabase.co -p 5432 -U postgres -d postgres -f "backups/prod-$(date +%F).sql"
```

### Load it into your shell

```bash
read -rs PROD_DB_URL && export PROD_DB_URL
```

**The terminal will look frozen — it is waiting.** `read` prints no prompt and
`-s` hides what you type, so you get a blank line. Paste the URI and press Enter.

Why not `export PROD_DB_URL="postgresql://..."` directly? That command, password
and all, gets written to `~/.zsh_history` in plain text and stays there. `read`
is not a value you typed as part of a command, so nothing is recorded.

- `-r` treats backslashes literally, so a password containing one survives intact
- `-s` keeps it off your screen and out of any scrollback you might screenshot

The variable lives only in **that one terminal tab**, and disappears when you
close it. If you open a new tab and `pg_dump` complains about a missing host,
this is why — re-run the `read` command there.

### Confirm it works before dumping

Fail fast rather than discovering a bad string halfway through a dump:

```bash
psql "$PROD_DB_URL" -c 'select current_database(), version();'
```

`psql` came with `libpq` in Step 1a. You should get one row naming `postgres` and
a PostgreSQL version. Quote `"$PROD_DB_URL"` every time — unquoted, the shell
will split it on special characters.

If this errors:

- **`could not translate host name`** — the string is malformed, or you are on
  IPv4 trying to reach a direct IPv6-only host. Switch to the session pooler.
- **`password authentication failed`** — wrong password, or you used the anon key
  by mistake.
- **`Connection refused` / timeout** — usually a network or firewall issue rather
  than a credential one.

### 1c. Take the dump

```bash
mkdir -p backups
```

```bash
pg_dump "$PROD_DB_URL" -f "backups/prod-$(date +%F).sql"
```

A few seconds to a minute. No output means success — `pg_dump` is silent when it
works, and everything it prints is a problem.

Do **not** add `-j` (parallel jobs). It opens several connections at once, which
the session pooler will not give you consistently. A single-threaded dump of a
database this size takes seconds anyway.

### 1d. Verify the backup is real

An unverified backup is not a backup.

```bash
ls -lh backups/ && grep -c "INSERT INTO\|COPY public" "backups/prod-$(date +%F).sql"
```

The file should be tens of KB at minimum, and the count should be well above
zero. If it is a few hundred bytes, the dump failed and the error scrolled past —
re-run 1c and read the output.

```bash
grep -o 'CREATE TABLE public\."[A-Za-z]*"' "backups/prod-$(date +%F).sql" | sort -u
```

You should see `Users`, `Tasks`, `Comments`, `Notifications`, `TaskHistory`,
`Announcements`, `AnnouncementRecipients`, `PushSubscriptions`.

### 1e. Store it properly

**This file contains every employee's record and their plain-text password.**

`/backups/` is already in `.gitignore`, so it will not be committed. But it is
sitting on your laptop in the clear. Copy it somewhere durable and
access-controlled — an encrypted drive, or your agency's approved storage. Not a
personal cloud folder.

### What this backup does not cover

`pg_dump` captures the database only. **File attachments live in the
`taskflow-files` storage bucket and are not in this dump.** If attachments matter
— and for dispatched tasks they will — that is a separate backup you do not
currently have either. Worth solving, but not in this document's scope.

---

## Step 2 — Commit the work already done

The plan, the migration set and the new rules are all sitting uncommitted. One
accident loses them.

```bash
git checkout -b chore/local-dev-isolation
```

```bash
git add -A && git status
```

Read the list. It should show the doc updates, the deleted files from the earlier
cleanup, and the new `supabase/` directory. It must **not** show anything under
`backups/`.

```bash
git commit -m "chore: local dev isolation plan, migration set, and safety rules"
```

Stay on this branch for now. Nothing deploys until it reaches `main`.

---

## Step 3 — Install the container runtime

The local Supabase stack runs Postgres, Auth, Storage, Realtime and Studio as
containers.

```bash
brew install colima docker supabase/tap/supabase
```

Three separate things: `colima` is the VM that runs containers, `docker` is the
CLI that talks to it (the free CLI formula, **not** the Desktop cask), and
`supabase` is the CLI that orchestrates the stack.

```bash
colima start --cpu 2 --memory 4
```

First start takes a few minutes while it downloads and boots a Linux VM. The disk
is sparse — it claims a large maximum but only consumes what is actually used,
which matters because this machine has roughly 20 GB free and the Supabase images
are 3–5 GB.

```bash
docker ps
```

An empty table with headers means everything is wired up. `Cannot connect to the
Docker daemon` means Colima is not running — re-run `colima start`.

### If image pulls fail with `docker-credential-desktop`

If `supabase start` floods the terminal with:

```
error getting credentials - err: exec: "docker-credential-desktop":
executable file not found in $PATH
```

...then `~/.docker/config.json` carries `"credsStore": "desktop"`, left behind by
a Docker Desktop install that is no longer present. Every image pull shells out
to that helper, it does not exist, and all twelve images fail across all three
registries. It is unrelated to Colima, Supabase, or your network.

The Supabase images are public and `"auths"` is empty, so no credential helper is
needed. Remove the line:

```bash
cp ~/.docker/config.json ~/.docker/config.json.bak
```

```bash
python3 -c "import json,pathlib; p=pathlib.Path.home()/'.docker/config.json'; d=json.loads(p.read_text()); d.pop('credsStore',None); p.write_text(json.dumps(d,indent=2)); print('credsStore removed')"
```

```bash
grep -E 'credsStore|currentContext' ~/.docker/config.json
```

Only `currentContext` should remain, and it should still say `colima`. Then
re-run `supabase start`.

**Colima does not start on login.** After a reboot you must `colima start` again
before `supabase start`. To make it automatic:

```bash
brew services start colima
```

---

## Step 4 — Build the local database

### 4a. Initialise

```bash
supabase init
```

This creates `supabase/config.toml`. The `supabase/migrations/` and
`supabase/seed.sql` files already exist and are left alone. If it says the
directory exists, that is expected — it only adds the config.

Answer `n` to the VS Code / IntelliJ settings prompts unless you want them.

### 4b. Match the Postgres version to production

Easy to skip, and it is how you end up debugging a difference that is not in your
code.

Production runs **PostgreSQL 17.6** — confirmed 2026-09-02 by querying it
directly in Step 1b. So local must be major version **17**.

```bash
grep major_version supabase/config.toml
```

If it does not say `17`, edit `supabase/config.toml`:

```toml
[db]
major_version = 17
```

Then apply it — the version is read when the container is created, so a running
stack keeps the old one:

```bash
supabase stop && supabase start
```

(To re-confirm the production version at any time:
`psql "$PROD_DB_URL" -c 'select version();'`)

### 4c. Start the stack

```bash
supabase start
```

**First run takes 5–15 minutes** pulling images. Later runs take seconds.

It prints a block like:

```
         API URL: http://127.0.0.1:54321
      Studio URL: http://127.0.0.1:54323
        anon key: eyJhbGciOi...
service_role key: eyJhbGciOi...
```

Keep it. `supabase status` reprints it any time.

These keys are the same fixed development keys on every machine running Supabase
locally. They are not secret and grant nothing beyond your own laptop.

### 4d. Apply migrations and seed

```bash
supabase db reset
```

This drops the local database, replays all 18 migrations in order, then runs
`supabase/seed.sql`.

**Expect this to fail the first time.** Those migrations were reconstructed from
the repo's hand-applied SQL patches and have never been executed. Finding the
problems is exactly what this step is for, and it is free to retry.

Read the error. It names the migration file and the line:

- **`already exists`** — two migrations create the same object. Add
  `IF NOT EXISTS`, or `DROP ... IF EXISTS` first.
- **`does not exist`** — ordering. Something is referenced before it is created.
  Rename the file to a later timestamp so it runs after its dependency.
- **`violates check constraint`** — a constraint in the base schema rejects data
  a later migration or the seed writes. This is the class of problem that
  `20260101001500_reconcile_undocumented_prod_drift.sql` exists to fix.

Fix the file, run `supabase db reset` again. Repeat until clean. It only ever
touches your local database.

### 4e. Confirm the data landed

```bash
supabase status
```

Open Studio at **http://127.0.0.1:54323** → Table Editor.

- `Users` — 8 rows, all with `@example.test` emails
- `Tasks` — 5 rows across Assigned, Received and Completed
- `Users` → `TEST-EMP-02` → `Status` should read
  `Official Travel — Fiber Survey at Batac, Ilocos Norte (Sep 8-12) [GEO:...]`

That last row is deliberate. If the presence CHECK constraint were still in
place, the seed would have failed outright rather than letting you discover it
later through a broken feature.

---

## Step 5 — Point the app at local

### 5a. Move the production credentials out of the working tree

```bash
mv taskflow-app/.env.local ~/philfida-prod-env.backup
```

Those values live in Vercel from now on, not in your repo. If you ever need them
back, they are in that file and in the Vercel dashboard.

### 5b. Confirm the app accepts a local stack — already applied

**No action needed; verify only.** This change is already committed, but it is
documented here because without it nothing in Step 5 works.

`validateEnvironment()` in `taskflow-app/src/lib/supabase.js` enforced two rules
that a local stack cannot satisfy — a URL must start with `https://`, and a key
must start with `sb_`. A local stack is served over plain `http` on 127.0.0.1, and
in dev these errors `throw` at module load rather than warning, so the app would
not have rendered at all.

The URL rule blocks every local stack. The key rule depends on your CLI version:
older ones issue a JWT (`eyJ…`) which the `sb_` check rejects, while current ones
issue `sb_publishable_…` which passes. The gate covers both.

Both rules are now gated on a localhost check:

```js
const isLocalSupabase = /^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(SUPABASE_URL || '')
```

Verify it is present:

```bash
grep -n isLocalSupabase taskflow-app/src/lib/supabase.js
```

Three lines: the definition, and one use in each of the two checks.

Production is unaffected. A deployed build has an `https://` URL, so
`isLocalSupabase` is false and both original rules apply in full. The pattern is
anchored at both ends and accepts only `127.0.0.1` or `localhost` followed by a
port, so no remote host can slip through it — `http://127.0.0.1.evil.com:80` and
`http://localhost:1@evil.com` both fail to match.

### 5c. Write the local environment file

Replace `PASTE_ANON_KEY_HERE` with the `anon key` from Step 4c:

```bash
printf 'VITE_SUPABASE_URL=http://127.0.0.1:54321\nVITE_SUPABASE_PUBLISHABLE_KEY=PASTE_ANON_KEY_HERE\nVITE_VAPID_PUBLIC_KEY=\n' > taskflow-app/.env.local
```

Then edit the file and paste the real key in.

Depending on your CLI version that key is either a JWT starting `eyJ` or a newer
`sb_publishable_...` value. Either works once 5b is in place.

The URL must have **no trailing slash** — the regex in 5b expects
`http://127.0.0.1:54321` exactly.

### 5d. Fix the CSP, or nothing will connect

`taskflow-app/index.html` line 6 sets `connect-src 'self' https://*.supabase.co`,
and **that meta tag applies in dev, not only in production**. A local stack at
`http://127.0.0.1:54321` is not `'self'` (that is `localhost:3000`), so every
database call is blocked — silently, with only a console error.

In `taskflow-app/index.html`, add to **both** `connect-src` and `img-src`:

```
http://127.0.0.1:54321 ws://127.0.0.1:54321
```

`connect-src` covers the REST and Realtime traffic; `img-src` covers attachments
and avatars served from local storage. Miss the second and the app appears to
work until someone opens a task with an image.

Leave `vercel.json` alone. Production has no business allowing localhost, and
this deliberately diverges the two CSP definitions that CLAUDE.md says to keep in
sync: the meta tag is now the dev-permissive one, `vercel.json` the
production-strict one.

### 5e. Run it

```bash
cd taskflow-app && npm run dev
```

Open http://localhost:3000 and log in with Personnel ID `TEST-DIR-01`, password
`localdev`.

Open the browser console. It should be clean. A `Refused to connect` error means
5d did not take effect — check the meta tag and hard-reload.

### 5f. Prove the isolation actually holds

Do not assume this. Verify it, in this order:

1. In the **Supabase dashboard** (production), Table Editor → `Tasks` → note the
   exact row count.
2. In your **local** app, dispatch a task to Emma Ployee.
3. In **local Studio** (127.0.0.1:54323) → `Tasks` — the new row is there.
4. Back in the **production dashboard**, refresh `Tasks`. **The count is
   unchanged.**

Until you have watched step 4 come back unchanged, treat the setup as unproven.

---

## Step 6 — Work in it

That is the whole setup. Daily use:

```bash
colima start && supabase start
```

```bash
cd taskflow-app && npm run dev
```

Reset to clean seeded data whenever you have made a mess:

```bash
supabase db reset
```

Shut down at the end of the day (optional — it idles cheaply):

```bash
supabase stop && colima stop
```

### Now stop and use it

Build features. Fix bugs. Break things freely — `supabase db reset` is always 30
seconds away from a clean slate.

**Do not go straight to wiring up migration-based deployment.** That comes later,
deliberately, and the reasons are below.

### Three things that will not work locally, by design

- **Google OAuth** needs redirect configuration against a real Supabase project.
  Use Personnel-ID login locally. Do not spend an afternoon on this.
- **Web push** — `/api/push-send` is a Vercel serverless function, not served by
  Vite. Untestable under `npm run dev` regardless of database.
- **Real data volumes.** Eight users and five tasks will not surface pagination
  or performance problems. Seed more rows in `supabase/seed.sql` if you need to.

---

## Shipping to the live system

Code-only changes are already safe. Merge your branch to `main` and push:

```bash
git push origin main
```

Vercel builds and deploys. Nothing else required.

### Schema changes — keep doing these by hand, for now

The obvious next move is `supabase db push` to promote migrations automatically.
**Not yet.**

That migration set is a *reconstruction* assembled from the repo's SQL patches,
and it has already been proven wrong twice — a dropped `Users_Status_check`
constraint and two `Signatory*` columns that no file creates. Production was
hand-built over months. Assume more drift exists.

Pushing an unverified baseline at a live database is precisely the accident this
whole exercise exists to prevent.

So until the reconciliation below is done: **make the change locally first**,
confirm it works, then apply the same SQL by hand in the Supabase editor — after
taking a Step 1 backup. Not elegant, but it is a process you already know works.

### Reconciling, when you are ready

Once you have been working locally for a couple of weeks and trust the setup:

```bash
supabase link --project-ref uyykiioakukzcmjxglyn
```

```bash
supabase db pull
```

`db pull` introspects the live schema and writes it to a new migration. It also
writes one thing to production — the `supabase_migrations` bookkeeping table.
That is metadata; no table, row, policy or function of yours is touched. Take a
fresh backup first anyway.

Then diff the generated file against `supabase/migrations/`. Every difference is
either drift to fold into the drift migration, or a mistake in the
reconstruction. **Only when the two agree is production genuinely baselined**,
and only then is `supabase db push` safe.

When that day comes, the safe sequence is: `supabase db diff -f name` → read the
generated SQL → `supabase db reset` to prove it applies from nothing → back up
production → `supabase db push --dry-run` → `supabase db push` → `git push`.

Migrations must be additive: add columns, never rename; add tables, never drop.
Schema and code deploy at different moments, so the old code briefly runs against
the new schema. Removals ship as two releases.

---

## Standing rules

- **`.env.local` names localhost. Permanently.** Production credentials live in
  Vercel and nowhere else on this machine.
- **Never run `supabase db reset --linked`.** Without the flag it rebuilds your
  local database, which is routine. With it, it wipes the remote one.
- **Never run `vercel --prod` or `vercel deploy`.** These ship your working tree,
  uncommitted changes included, bypassing git entirely. Deployment is `git push`
  to `main`, and nothing else.
- **Back up before every production schema change.** Step 1, every time.
- **Feature branches, not direct commits to `main`.** `main` is the deploy
  trigger; treat it as production.

---

## Why not Docker Desktop

Docker Desktop is free only for personal use, education, non-commercial open
source, and small businesses — under 250 employees **and** under $10M revenue. A
national government agency does not qualify, so it would be a licensing expense.

Colima is MIT-licensed, free for any use, and the Supabase CLI supports it. The
`docker` Homebrew *formula* installed in Step 3 is the CLI only (Apache-2.0), not
the Desktop *cask*.

| Component | License | Cost |
|---|---|---|
| Colima | MIT | Free |
| Docker CLI (formula) | Apache-2.0 | Free |
| Supabase CLI | Apache-2.0 | Free |
| Local Supabase stack | Runs on your machine | Free |
| libpq / `pg_dump` | PostgreSQL License | Free |
| Vercel | Existing project, unchanged | No change |

---

## Still outstanding

Not part of this setup, but a larger live risk than anything above: **every
account still uses the password `password`**, and those passwords were publicly
readable before `SECURITY-lock-passwords.sql`. For a system holding government
personnel records, rotating them outranks the migration work.
