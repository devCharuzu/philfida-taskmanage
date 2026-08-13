-- ============================================================
-- FIX: the "Records" role can never be assigned
--
-- The app offers four roles in User Management (Unit Personnel, Unit Head,
-- Director, Records) and ships a full Records dashboard at /records with its
-- own ProtectedRoute. But the database rejects the value in two places:
--
--   1. "Users"."Role" CHECK allows only Director / Unit Head / Employee
--   2. director_update_user_role() raises 'invalid role' for anything else
--
-- So a Director choosing "Records" gets "invalid role" and the Records
-- dashboard is unreachable by anyone. This patch allows the value in both.
--
-- Idempotent: safe to run more than once.
-- ============================================================

-- 1. Widen the column constraint.
ALTER TABLE public."Users" DROP CONSTRAINT IF EXISTS "Users_Role_check";
ALTER TABLE public."Users"
  ADD CONSTRAINT "Users_Role_check"
  CHECK ("Role" IN ('Director', 'Unit Head', 'Employee', 'Records'));

-- 2. Widen the RPC's own validation. Only the guard clause changes; the rest
--    of the function is reproduced exactly as it already exists.
CREATE OR REPLACE FUNCTION public.director_update_user_role(
  p_director_id       text,
  p_director_password text,
  p_target_user_id    text,
  p_role              text,
  p_unit              text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n int;
BEGIN
  IF p_role NOT IN ('Director', 'Unit Head', 'Employee', 'Records') THEN
    RAISE EXCEPTION 'invalid role';
  END IF;
  PERFORM public._taskflow_verify_director_actor(p_director_id, p_director_password);

  UPDATE public."Users"
  SET "Role" = p_role,
      "Unit" = COALESCE(p_unit, ''),
      "Office" = COALESCE(p_unit, '')
  WHERE "ID" = p_target_user_id;

  GET DIAGNOSTICS n = ROW_COUNT;
  IF n = 0 THEN
    RAISE EXCEPTION 'target user not found';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.director_update_user_role(text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.director_update_user_role(text, text, text, text, text) TO anon, authenticated;

-- Verify:
--   SELECT "ID","Role" FROM public."Users" WHERE "Role" = 'Records';
