-- FIX: Chat "unread" red dot never clears for Google-OAuth users.
--
-- google-auth-rls-patch.sql added SELECT + INSERT policies for the
-- `authenticated` role on Comments (and SELECT+INSERT+UPDATE on Tasks and
-- Notifications), but never added an UPDATE policy for Comments. Viewing a
-- chat calls markChatRead(), which does UPDATE Comments SET "HiddenBy" = ...
-- to mark that user's name into the row. Supabase does not error when RLS
-- blocks a matching row on UPDATE — it just silently affects 0 rows. So for
-- any user signed in via Google (Postgres role `authenticated`), that write
-- always no-ops: HiddenBy never gets their name appended, and
-- getUnreadCommentCount() keeps counting the thread as unread forever.
-- Personnel-ID (anon) logins are unaffected — their "Anon can update
-- Comments" policy is USING (true) WITH CHECK (true).
--
-- Mirrors the shape of "Comments viewable by google auth" /
-- "Comments insertable by google auth" in google-auth-rls-patch.sql.

CREATE POLICY "Comments updatable by google auth" ON public."Comments"
FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public."Tasks" t
    JOIN public."Users" u ON (t."EmployeeID" = u."ID" OR (u."Role" IN ('Director', 'Unit Head') AND u."AccountStatus" = 'Active'))
    WHERE t."TaskID" = "TaskID" AND u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public."Tasks" t
    JOIN public."Users" u ON (t."EmployeeID" = u."ID" OR (u."Role" IN ('Director', 'Unit Head') AND u."AccountStatus" = 'Active'))
    WHERE t."TaskID" = "TaskID" AND u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);
