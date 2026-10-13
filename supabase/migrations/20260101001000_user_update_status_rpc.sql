-- ============================================================
-- RPC: user_update_status
-- Allows users to update their own Status field securely.
-- Handles both Manual Personnel ID (via password verification)
-- and Google Auth (via JWT email verification).
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_update_status(
  p_user_id text,
  p_verify_password text DEFAULT NULL,
  p_status text DEFAULT 'Available'
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
BEGIN
  -- 1. Fetch the user record
  SELECT * INTO rec FROM public."Users" WHERE "ID" = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  -- 2. Check Google Auth (JWT email)
  jwt_email := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  IF auth.role() = 'authenticated' AND jwt_email <> ''
     AND nullif(lower(trim(coalesce(rec."Email", ''))), '') IS NOT NULL
     AND lower(trim(rec."Email")) = jwt_email THEN
    authorized := true;
  END IF;

  -- 3. Check Manual Login (Password)
  IF NOT authorized
     AND coalesce(trim(p_verify_password), '') <> ''
     AND rec."Password" IS NOT DISTINCT FROM trim(p_verify_password) THEN
    authorized := true;
  END IF;

  -- 4. Reject if not authorized
  IF NOT authorized THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  -- 5. Update the status
  UPDATE public."Users"
  SET 
    "Status" = p_status,
    "UpdatedAt" = NOW()
  WHERE "ID" = p_user_id;
END;
$$;

-- Grant permissions
REVOKE ALL ON FUNCTION public.user_update_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_update_status(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.user_update_status(text, text, text) TO authenticated;
