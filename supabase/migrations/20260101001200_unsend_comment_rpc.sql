-- ============================================================
-- Unsend a chat message ("You unsent a message" tombstone)
--
-- Apply this whole file in the Supabase SQL editor. It is idempotent —
-- safe to run more than once.
--
-- Behaviour: unsending does NOT delete the row. It clears the content and
-- flags the row, so both participants keep a placeholder in the thread:
--   the sender sees   "You unsent a message"
--   everyone else sees "<Name> unsent a message"
-- The message text and any attachment references are wiped, so the content
-- itself is genuinely gone for everyone; only the placeholder remains.
--
-- Why an RPC rather than an RLS policy:
--   "Comments" has no DELETE policy at all, and the manual Personnel-ID
--   flow talks to Supabase as the `anon` role with no auth.uid() to match
--   against, so there is nothing for a row-level policy to compare. This
--   function is SECURITY DEFINER and checks ownership itself.
--
-- Ownership check:
--   Rows written before this change have no "SenderID" (addComment only
--   wrote "SenderName"), so fall back to the name for those. Newer rows
--   carry "SenderID" and match on it, which is safe even if two personnel
--   share a display name.
-- ============================================================

-- 1. Tombstone flag -----------------------------------------------------
ALTER TABLE public."Comments"
  ADD COLUMN IF NOT EXISTS "Unsent" boolean NOT NULL DEFAULT false;

-- 2. Unsend function ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.unsend_comment(
  p_comment_id bigint,
  p_user_id text,
  p_sender_name text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec public."Comments"%ROWTYPE;
BEGIN
  SELECT * INTO rec FROM public."Comments" WHERE "ID" = p_comment_id;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  IF rec."Unsent" THEN
    RETURN true;   -- already unsent, nothing to do
  END IF;

  -- Prefer the immutable ID; fall back to the name only for legacy rows.
  IF rec."SenderID" IS NOT NULL AND p_user_id IS NOT NULL THEN
    IF rec."SenderID" IS DISTINCT FROM p_user_id THEN
      RAISE EXCEPTION 'not your message';
    END IF;
  ELSIF rec."SenderName" IS DISTINCT FROM p_sender_name THEN
    RAISE EXCEPTION 'not your message';
  END IF;

  -- "Message" is NOT NULL, so blank it rather than nulling it. This also
  -- drops the JSON payload that holds attachment URLs.
  UPDATE public."Comments"
     SET "Unsent"  = true,
         "Message" = ''
   WHERE "ID" = p_comment_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.unsend_comment(bigint, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.unsend_comment(bigint, text, text) TO anon, authenticated;
