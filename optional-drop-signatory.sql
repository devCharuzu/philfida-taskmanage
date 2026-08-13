-- ============================================================
-- OPTIONAL — only run if you are sure the routing slip will not return.
--
-- The Action/Routing Slip feature was removed from the application. These
-- database objects existed solely to support it and are now unused:
--
--   • "Users"."SignatoryName"        — who signs the slip
--   • "Users"."SignatoryDesignation" — their title on the slip
--   • director_update_signatory()    — the RPC that set them
--
-- Nothing in the app reads or writes them any more, so leaving them in place
-- is harmless. Dropping them is tidier but irreversible, and it also means
-- login_user() must stop returning the two columns — both steps are below and
-- must be run together.
-- ============================================================

DROP FUNCTION IF EXISTS public.director_update_signatory(text, text, text, text);

-- login_user() currently returns the two signatory columns. Re-create it
-- without them BEFORE dropping the columns, or the function breaks.
CREATE OR REPLACE FUNCTION public.login_user(
  p_id text, p_password text, p_region text DEFAULT NULL
)
RETURNS TABLE (
  "ID" text, "Name" text, "Email" text, "Role" text, "Unit" text,
  "Office" text, "Designation" text, "ProfilePic" text, "Status" text,
  "AccountStatus" text, "Region" text, login_error text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE rec public."Users"%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM public."Users" u WHERE u."ID" = btrim(p_id);

  IF NOT FOUND OR rec."Password" IS DISTINCT FROM p_password THEN
    RETURN QUERY SELECT NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,
                        NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,
                        NULL::text,'invalid_credentials'::text; RETURN;
  END IF;
  IF p_region IS NOT NULL AND rec."Region" IS NOT NULL AND rec."Region" <> p_region THEN
    RETURN QUERY SELECT NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,
                        NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,
                        NULL::text,'invalid_region'::text; RETURN;
  END IF;
  IF rec."AccountStatus" = 'Pending' THEN
    RETURN QUERY SELECT NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,
                        NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,
                        NULL::text,'pending'::text; RETURN;
  END IF;
  IF rec."AccountStatus" = 'Deactivated' THEN
    RETURN QUERY SELECT NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,
                        NULL::text,NULL::text,NULL::text,NULL::text,NULL::text,
                        NULL::text,'deactivated'::text; RETURN;
  END IF;

  RETURN QUERY SELECT rec."ID", rec."Name", rec."Email", rec."Role", rec."Unit",
                      rec."Office", rec."Designation", rec."ProfilePic", rec."Status",
                      rec."AccountStatus", rec."Region", NULL::text;
END;
$$;

REVOKE ALL ON FUNCTION public.login_user(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_user(text, text, text) TO anon, authenticated;

ALTER TABLE public."Users" DROP COLUMN IF EXISTS "SignatoryName";
ALTER TABLE public."Users" DROP COLUMN IF EXISTS "SignatoryDesignation";
