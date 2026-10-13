-- FIX: Chat unread badge (task cards, DashboardPage/UnitHead/Director/Records)
-- lingers after reading, and isn't real-time.
--
-- Root causes:
-- 1. markChatRead() did a client-side SELECT then N individual UPDATEs (one
--    per unread comment). Each UPDATE fires its own realtime "Comments"
--    change event, which independently triggers a full getData() resync
--    (see useSync.js checkCommentNotification). With N concurrent syncs in
--    flight, a slower one that started before all N updates committed can
--    resolve *after* the correct final sync and overwrite the store with a
--    partially-stale snapshot — the badge reappears even though the DB is
--    already correct.
-- 2. No optimistic local update — the badge only clears after a full round
--    trip (SELECT + N UPDATEs + a separate getData() refetch), which reads
--    as "not real time" even when it eventually works.
-- 3. For Google-OAuth users specifically, RLS never granted UPDATE on
--    Comments to the `authenticated` role at all (see
--    comments-google-auth-update-policy.sql) — this RPC runs as
--    SECURITY DEFINER, so it bypasses that gap too.
--
-- Fix: one atomic UPDATE via RPC (single write, single realtime event, no
-- race), paired with a client-side optimistic store update in ChatModal.jsx
-- so the badge clears instantly regardless of network latency.

CREATE OR REPLACE FUNCTION public.mark_chat_read(p_task_id text, p_session_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public."Comments"
  SET "HiddenBy" = CASE
    WHEN "HiddenBy" IS NULL OR "HiddenBy" = '' THEN p_session_name
    ELSE "HiddenBy" || ',' || p_session_name
  END
  WHERE "TaskID" = p_task_id
    AND "SenderName" IS DISTINCT FROM p_session_name
    AND POSITION(p_session_name IN COALESCE("HiddenBy", '')) = 0;
$$;

REVOKE ALL ON FUNCTION public.mark_chat_read(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mark_chat_read(text, text) TO anon, authenticated;
