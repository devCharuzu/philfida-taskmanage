-- ============================================================
-- CRITICAL — run this before anything else.
--
-- Problem
--   public."Users" is readable by the `anon` role, and that includes the
--   "Password" column, which this app stores in PLAIN TEXT. The anon key is
--   embedded in the deployed JavaScript bundle, so it is public by design —
--   which means anyone at all could run:
--
--     GET /rest/v1/Users?select=ID,Password
--
--   and harvest every account's password, Directors included. Making the
--   GitHub repository private does NOT fix this; the key ships to the browser.
--
-- Fix
--   Postgres column-level privileges, which PostgREST honours independently of
--   RLS. Every other column stays readable so the personnel lists, presence
--   indicators and roster screens keep working — only "Password" is withdrawn.
--
--   Login still works: it is moved to the login_user() function below, which
--   verifies the password inside the database and never returns it.
--
-- After running this, rotate every password (see the note at the end).
-- ============================================================

-- 1. Withdraw blanket SELECT, then hand back everything except "Password".
REVOKE SELECT ON public."Users" FROM anon, authenticated;

GRANT SELECT (
  "ID", "Name", "Email", "Role", "Unit", "Office", "Designation",
  "ProfilePic", "Status", "AccountStatus", "CreatedAt", "UpdatedAt",
  "Region", "SignatoryName", "SignatoryDesignation"
) ON public."Users" TO anon, authenticated;

-- 2. Login moves server-side. Password is compared here and never leaves the
--    database. Returns the same shape the client used to read directly.
CREATE OR REPLACE FUNCTION public.login_user(
  p_id       text,
  p_password text,
  p_region   text DEFAULT NULL
)
RETURNS TABLE (
  "ID" text, "Name" text, "Email" text, "Role" text, "Unit" text,
  "Office" text, "Designation" text, "ProfilePic" text, "Status" text,
  "AccountStatus" text, "Region" text,
  "SignatoryName" text, "SignatoryDesignation" text,
  login_error text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public."Users"%ROWTYPE;
BEGIN
  -- Alias the table: RETURNS TABLE declares output variables named "ID",
  -- "Name", etc., so an unqualified "ID" here is ambiguous (Postgres 42702).
  SELECT * INTO rec FROM public."Users" u WHERE u."ID" = btrim(p_id);

  -- Same message whether the ID is unknown or the password is wrong, so this
  -- cannot be used to enumerate which employee IDs exist.
  IF NOT FOUND OR rec."Password" IS DISTINCT FROM p_password THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
                        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
                        NULL::text, NULL::text, NULL::text, 'invalid_credentials'::text;
    RETURN;
  END IF;

  IF p_region IS NOT NULL AND rec."Region" IS NOT NULL AND rec."Region" <> p_region THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
                        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
                        NULL::text, NULL::text, NULL::text, 'invalid_region'::text;
    RETURN;
  END IF;

  IF rec."AccountStatus" = 'Pending' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
                        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
                        NULL::text, NULL::text, NULL::text, 'pending'::text;
    RETURN;
  END IF;

  IF rec."AccountStatus" = 'Deactivated' THEN
    RETURN QUERY SELECT NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
                        NULL::text, NULL::text, NULL::text, NULL::text, NULL::text,
                        NULL::text, NULL::text, NULL::text, 'deactivated'::text;
    RETURN;
  END IF;

  RETURN QUERY SELECT rec."ID", rec."Name", rec."Email", rec."Role", rec."Unit",
                      rec."Office", rec."Designation", rec."ProfilePic", rec."Status",
                      rec."AccountStatus", rec."Region",
                      rec."SignatoryName", rec."SignatoryDesignation", NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.login_user(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_user(text, text, text) TO anon, authenticated;

-- ============================================================
-- AFTER RUNNING THIS
--
-- Every existing password must be treated as already compromised — they were
-- readable by anyone for as long as the project has been deployed. Reset them:
--
--   UPDATE public."Users" SET "Password" = '<new-unique-password>' WHERE "ID" = '...';
--
-- Verify the hole is closed (this should now fail with a column error):
--   curl "$SUPABASE_URL/rest/v1/Users?select=ID,Password&limit=1" \
--        -H "apikey: <publishable key>"
-- ============================================================
