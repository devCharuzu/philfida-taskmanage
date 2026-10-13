-- ============================================================
-- Reconcile undocumented production drift
--
-- Production was built by hand-pasting SQL into the Supabase editor, and two
-- changes were made that NO file in this repository reproduces. Without them a
-- database rebuilt from these migrations does not match production, and the app
-- breaks in ways that look like application bugs.
--
-- Both were found by reading the code against the schema, not from any record.
-- If `supabase db pull` later reveals further drift, add it here.
-- ============================================================

-- ── 1. Users."Status" must accept presence strings, not just three literals ──
--
-- The base schema constrains Status to exactly 'Available' | 'Official Travel'
-- | 'On Leave'. But buildTravelStatus() in src/lib/api.js writes strings like:
--
--   Official Travel — Seminar at Manila (Sep 1-3) [TO:path/f.pdf] [GEO:14.5,120.9]
--
-- and user_update_status() assigns that value straight into the column. A CHECK
-- constraint is not bypassed by SECURITY DEFINER, so with the base constraint in
-- place EVERY travel presence update fails. Since the feature demonstrably works
-- in production, the constraint was dropped there by hand.
--
-- Dropped rather than widened: the marker format is open-ended (travel activity,
-- venue, date range, file path, coordinates), so no CHECK can meaningfully
-- validate it. Presence values are normalised in application code through
-- stripStatusMarkers() / getPresenceBase().
ALTER TABLE public."Users" DROP CONSTRAINT IF EXISTS "Users_Status_check";

-- ── 2. Signatory columns ─────────────────────────────────────────────────────
--
-- SECURITY-lock-passwords.sql grants column-level SELECT on "SignatoryName" and
-- "SignatoryDesignation", and login_user() returns both. Neither the base schema
-- nor any patch ever creates them, so the next migration fails on a fresh
-- database with: column "SignatoryName" of relation "Users" does not exist.
--
-- They are leftovers from the removed Action/Routing Slip feature and are
-- unreferenced by client code. They exist here only so login_user() compiles and
-- so local matches production. `optional-drop-signatory.sql` removes them and
-- rebuilds login_user() in the same transaction; it has NOT been applied.
ALTER TABLE public."Users"
  ADD COLUMN IF NOT EXISTS "SignatoryName"        text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "SignatoryDesignation" text DEFAULT '';
