-- Adds a configurable routing-slip signatory for Directors.
--
-- Previously the print template hardcoded "SAMUEL M. NACINO JR." /
-- "OIC-Regional Director" — a personnel change required a code deploy.
-- Now each Director can set SignatoryName/SignatoryDesignation on their own
-- account; when both are null, the app falls back to the Director's own
-- Name/Designation (checkbox: "Use my account name and designation").
--
-- Already applied directly to the live project (uyykiioakukzcmjxglyn) via
-- Supabase MCP on 2026-07-23. Kept here for the documented rebuild trail
-- (see DATABASE_RESTART_TUTORIAL.md) — running it again is a no-op
-- (IF NOT EXISTS / CREATE OR REPLACE).

ALTER TABLE public."Users" ADD COLUMN IF NOT EXISTS "SignatoryName" text;
ALTER TABLE public."Users" ADD COLUMN IF NOT EXISTS "SignatoryDesignation" text;

CREATE OR REPLACE FUNCTION public.director_update_signatory(
  p_director_id text, p_director_password text,
  p_signatory_name text, p_signatory_designation text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_director_actor(p_director_id, p_director_password);
  UPDATE public."Users"
  SET "SignatoryName" = p_signatory_name, "SignatoryDesignation" = p_signatory_designation, "UpdatedAt" = NOW()
  WHERE "ID" = p_director_id;
END;
$$;
REVOKE ALL ON FUNCTION public.director_update_signatory(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.director_update_signatory(text,text,text,text) TO anon, authenticated;
