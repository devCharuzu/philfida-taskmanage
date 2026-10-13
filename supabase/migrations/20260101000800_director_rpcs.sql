-- ============================================================
-- TaskFlow: director user-management RPCs (SECURITY DEFINER)
-- Run in Supabase SQL Editor on existing projects.
-- Fixes RLS mismatch: Users.ID ≠ auth.uid() (personnel IDs /
-- Google rows) and manual login uses anon JWT.
-- ============================================================

CREATE OR REPLACE FUNCTION public._taskflow_verify_director_actor(
  p_director_id text,
  p_director_password text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  d RECORD;
BEGIN
  IF p_director_id IS NULL OR btrim(p_director_id) = '' THEN
    RAISE EXCEPTION 'director id required';
  END IF;

  SELECT * INTO d FROM public."Users" WHERE "ID" = p_director_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'director not found';
  END IF;
  IF d."Role" IS DISTINCT FROM 'Director' OR d."AccountStatus" IS DISTINCT FROM 'Active' THEN
    RAISE EXCEPTION 'not an active director';
  END IF;

  IF jwt_email <> '' THEN
    IF lower(trim(coalesce(d."Email", ''))) = jwt_email THEN
      RETURN;
    END IF;
  END IF;

  IF p_director_password IS NOT NULL AND length(btrim(p_director_password)) > 0 THEN
    IF d."Password" IS NOT DISTINCT FROM p_director_password THEN
      RETURN;
    END IF;
  END IF;

  RAISE EXCEPTION 'director authorization failed';
END;
$$;

REVOKE ALL ON FUNCTION public._taskflow_verify_director_actor(text, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.director_set_account_status(
  p_director_id text,
  p_director_password text,
  p_target_user_id text,
  p_account_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF p_account_status NOT IN ('Active', 'Pending', 'Deactivated') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;
  PERFORM public._taskflow_verify_director_actor(p_director_id, p_director_password);

  UPDATE public."Users"
  SET "AccountStatus" = p_account_status, "UpdatedAt" = NOW()
  WHERE "ID" = p_target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'target user not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.director_update_user_role(
  p_director_id text,
  p_director_password text,
  p_target_user_id text,
  p_role text,
  p_unit text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF p_role NOT IN ('Director', 'Unit Head', 'Employee') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;
  PERFORM public._taskflow_verify_director_actor(p_director_id, p_director_password);

  UPDATE public."Users"
  SET "Role" = p_role,
      "Unit" = COALESCE(p_unit, ''),
      "Office" = COALESCE(p_unit, ''),
      "UpdatedAt" = NOW()
  WHERE "ID" = p_target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'target user not found';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.director_delete_user(
  p_director_id text,
  p_director_password text,
  p_target_user_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tid text;
  n int;
BEGIN
  PERFORM public._taskflow_verify_director_actor(p_director_id, p_director_password);

  IF p_target_user_id IS NOT DISTINCT FROM p_director_id THEN
    RAISE EXCEPTION 'cannot delete own director account';
  END IF;

  FOR tid IN SELECT "TaskID" FROM public."Tasks" WHERE "EmployeeID" = p_target_user_id
  LOOP
    DELETE FROM public."Comments" WHERE "TaskID" = tid;
    DELETE FROM public."TaskHistory" WHERE "TaskID" = tid;
    DELETE FROM public."Notifications" WHERE "TaskID" = tid;
    DELETE FROM public."Tasks" WHERE "TaskID" = tid;
  END LOOP;

  UPDATE public."Comments" SET "SenderID" = NULL WHERE "SenderID" = p_target_user_id;
  UPDATE public."TaskHistory" SET "ActorID" = NULL WHERE "ActorID" = p_target_user_id;

  DELETE FROM public."Notifications" WHERE "UserID" = p_target_user_id;
  DELETE FROM public."Users" WHERE "ID" = p_target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'target user not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.director_set_account_status(text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.director_update_user_role(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.director_delete_user(text, text, text) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.director_set_account_status(text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.director_set_account_status(text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.director_update_user_role(text, text, text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.director_update_user_role(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.director_delete_user(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.director_delete_user(text, text, text) TO authenticated;

-- Own profile (manual + Google): see supabase-user-update-own-profile-rpc.sql
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

SELECT 'Director RPCs installed ✓' AS status;
