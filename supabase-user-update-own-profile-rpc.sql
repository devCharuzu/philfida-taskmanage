-- ============================================================
-- Profile updates bypass broken Users UPDATE RLS (personnel ID ≠ auth.uid();
-- manual login uses anon). Apply in Supabase SQL Editor or via migration.
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_update_own_profile(
  p_user_id text,
  p_verify_password text,
  p_name text DEFAULT NULL,
  p_designation text DEFAULT NULL,
  p_email text DEFAULT NULL,
  p_unit text DEFAULT NULL,
  p_new_password text DEFAULT NULL,
  p_profile_pic text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public."Users"%ROWTYPE;
  jwt_email text;
  authorized boolean := false;
  new_pw text;
BEGIN
  SELECT * INTO rec FROM public."Users" WHERE "ID" = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  jwt_email := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');

  IF auth.role() = 'authenticated' AND jwt_email <> ''
     AND nullif(lower(trim(coalesce(rec."Email", ''))), '') IS NOT NULL
     AND lower(trim(rec."Email")) = jwt_email THEN
    authorized := true;
  END IF;

  IF NOT authorized
     AND coalesce(trim(p_verify_password), '') <> ''
     AND rec."Password" IS NOT DISTINCT FROM trim(p_verify_password) THEN
    authorized := true;
  END IF;

  IF NOT authorized THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  new_pw := rec."Password";
  IF p_new_password IS NOT NULL AND length(trim(p_new_password)) > 0 THEN
    new_pw := trim(p_new_password);
  END IF;

  UPDATE public."Users"
  SET
    "Name" = CASE WHEN p_name IS NOT NULL THEN trim(p_name) ELSE rec."Name" END,
    "Designation" = CASE WHEN p_designation IS NOT NULL THEN trim(p_designation) ELSE rec."Designation" END,
    "Email" = CASE WHEN p_email IS NOT NULL THEN trim(p_email) ELSE rec."Email" END,
    "Unit" = CASE WHEN p_unit IS NOT NULL THEN trim(p_unit) ELSE rec."Unit" END,
    "Office" = CASE WHEN p_unit IS NOT NULL THEN trim(p_unit) ELSE rec."Office" END,
    "Password" = new_pw,
    "ProfilePic" = CASE WHEN p_profile_pic IS NOT NULL THEN p_profile_pic ELSE rec."ProfilePic" END,
    "UpdatedAt" = NOW()
  WHERE "ID" = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.user_update_own_profile(text, text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_update_own_profile(text, text, text, text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.user_update_own_profile(text, text, text, text, text, text, text, text) TO authenticated;

SELECT 'user_update_own_profile RPC applied ✓' AS status;
