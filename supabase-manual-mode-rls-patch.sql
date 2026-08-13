-- ============================================================
-- TaskFlow manual-login RLS compatibility patch
-- Apply on existing DBs created before anon policies were added.
-- ============================================================

DROP POLICY IF EXISTS "Anon can read Tasks" ON public."Tasks";
DROP POLICY IF EXISTS "Anon can insert Tasks" ON public."Tasks";
DROP POLICY IF EXISTS "Anon can update Tasks" ON public."Tasks";
DROP POLICY IF EXISTS "Anon can delete Tasks" ON public."Tasks";
DROP POLICY IF EXISTS "Anon can read Comments" ON public."Comments";
DROP POLICY IF EXISTS "Anon can insert Comments" ON public."Comments";
DROP POLICY IF EXISTS "Anon can update Comments" ON public."Comments";
DROP POLICY IF EXISTS "Anon can read Notifications" ON public."Notifications";
DROP POLICY IF EXISTS "Anon can insert Notifications" ON public."Notifications";
DROP POLICY IF EXISTS "Anon can update Notifications" ON public."Notifications";
DROP POLICY IF EXISTS "Anon can delete Notifications" ON public."Notifications";
DROP POLICY IF EXISTS "Anon can read TaskHistory" ON public."TaskHistory";
DROP POLICY IF EXISTS "Anon can insert TaskHistory" ON public."TaskHistory";

CREATE POLICY "Anon can read Tasks" ON public."Tasks"
FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert Tasks" ON public."Tasks"
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update Tasks" ON public."Tasks"
FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete Tasks" ON public."Tasks"
FOR DELETE TO anon USING (true);

CREATE POLICY "Anon can read Comments" ON public."Comments"
FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert Comments" ON public."Comments"
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update Comments" ON public."Comments"
FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can read Notifications" ON public."Notifications"
FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert Notifications" ON public."Notifications"
FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon can update Notifications" ON public."Notifications"
FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon can delete Notifications" ON public."Notifications"
FOR DELETE TO anon USING (true);

CREATE POLICY "Anon can read TaskHistory" ON public."TaskHistory"
FOR SELECT TO anon USING (true);

CREATE POLICY "Anon can insert TaskHistory" ON public."TaskHistory"
FOR INSERT TO anon WITH CHECK (true);

SELECT 'Manual mode RLS patch applied ✓' AS status;
