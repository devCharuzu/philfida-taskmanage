-- ============================================================
-- Web Push subscriptions
--
-- Apply this whole file in the Supabase SQL editor. It is idempotent.
--
-- Stores one row per device per user, so a notification can reach someone
-- whose browser is closed. The endpoint is the push service's own URL and is
-- unique per device+browser, which makes it the natural primary key.
--
-- Writes go through an RPC for the same reason as the other tables here: the
-- manual Personnel-ID flow talks to Supabase as `anon` with no auth.uid(), so
-- a row-level policy has nothing to compare against. Reads are NOT granted to
-- anon at all — only the serverless sender (service-role key) reads these, so
-- one user can never enumerate another's devices.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."PushSubscriptions" (
  "Endpoint"   text PRIMARY KEY,
  "UserID"     text NOT NULL REFERENCES public."Users"("ID") ON DELETE CASCADE,
  "P256dh"     text NOT NULL,
  "Auth"       text NOT NULL,
  "UserAgent"  text DEFAULT '',
  "CreatedAt"  timestamptz DEFAULT now(),
  "LastSeenAt" timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pushsubs_user ON public."PushSubscriptions"("UserID");

ALTER TABLE public."PushSubscriptions" ENABLE ROW LEVEL SECURITY;
-- No anon/authenticated policies by design: all access is via the RPCs below
-- (SECURITY DEFINER) or the service-role key in the send function.

-- ── Save / refresh this device's subscription ───────────────────────────
CREATE OR REPLACE FUNCTION public.save_push_subscription(
  p_user_id    text,
  p_endpoint   text,
  p_p256dh     text,
  p_auth       text,
  p_user_agent text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL OR p_endpoint IS NULL THEN
    RAISE EXCEPTION 'user id and endpoint are required';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = p_user_id) THEN
    RAISE EXCEPTION 'user not found';
  END IF;

  INSERT INTO public."PushSubscriptions" AS s
    ("Endpoint", "UserID", "P256dh", "Auth", "UserAgent", "LastSeenAt")
  VALUES (p_endpoint, p_user_id, p_p256dh, p_auth, COALESCE(p_user_agent, ''), now())
  ON CONFLICT ("Endpoint") DO UPDATE
    SET "UserID"     = EXCLUDED."UserID",   -- shared device: reassign to whoever logged in
        "P256dh"     = EXCLUDED."P256dh",
        "Auth"       = EXCLUDED."Auth",
        "UserAgent"  = EXCLUDED."UserAgent",
        "LastSeenAt" = now();
END;
$$;

-- ── Remove this device (logout / toggle off / expired) ───────────────────
CREATE OR REPLACE FUNCTION public.delete_push_subscription(p_endpoint text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public."PushSubscriptions" WHERE "Endpoint" = p_endpoint;
$$;

REVOKE ALL ON FUNCTION public.save_push_subscription(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.delete_push_subscription(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_push_subscription(text, text, text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_push_subscription(text) TO anon, authenticated;
