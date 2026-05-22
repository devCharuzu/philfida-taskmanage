-- ============================================================
-- PhilFIDA TaskFlow — Admin System Fix Migration
-- Run this in Supabase SQL Editor to fix all admin operations.
--
-- Root cause: Personnel ID login uses anon JWT, but RLS policies
-- only allow authenticated role for Tasks, Comments, Notifications,
-- and TaskHistory. This blocks all Director operations.
--
-- This migration:
-- 1. Adds anon RLS policies for read access on all tables
-- 2. Creates SECURITY DEFINER RPCs for all write operations
-- 3. Adds missing user_update_status and user_update_own_profile RPCs
-- 4. Adds anon storage policies for file operations
-- 5. Ensures admin account uses plain-text password for loginUser()
-- ============================================================

-- ============================================================
-- 1. ANON READ POLICIES (allow Personnel ID login users to read data)
-- ============================================================

-- Tasks: anon SELECT (filtered by Region in the app)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'Tasks' AND policyname = 'Anon select Tasks'
  ) THEN
    CREATE POLICY "Anon select Tasks" ON public."Tasks" FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- Comments: anon SELECT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'Comments' AND policyname = 'Anon select Comments'
  ) THEN
    CREATE POLICY "Anon select Comments" ON public."Comments" FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- Notifications: anon SELECT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'Notifications' AND policyname = 'Anon select Notifications'
  ) THEN
    CREATE POLICY "Anon select Notifications" ON public."Notifications" FOR SELECT TO anon USING (true);
  END IF;
END $$;

-- TaskHistory: anon SELECT
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'TaskHistory' AND policyname = 'Anon select TaskHistory'
  ) THEN
    CREATE POLICY "Anon select TaskHistory" ON public."TaskHistory" FOR SELECT TO anon USING (true);
  END IF;
END $$;


-- ============================================================
-- 2. TASK OPERATION RPCs (SECURITY DEFINER — bypass RLS)
-- ============================================================

-- Helper: verify that a user exists and is active (for any role)
CREATE OR REPLACE FUNCTION public._taskflow_verify_user(p_user_id text, p_password text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  u RECORD;
BEGIN
  IF p_user_id IS NULL OR btrim(p_user_id) = '' THEN
    RAISE EXCEPTION 'user id required';
  END IF;

  SELECT * INTO u FROM public."Users" WHERE "ID" = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;
  IF u."AccountStatus" IS DISTINCT FROM 'Active' THEN RAISE EXCEPTION 'account not active'; END IF;

  -- Google OAuth users: match JWT email
  IF jwt_email <> '' AND lower(trim(coalesce(u."Email", ''))) = jwt_email THEN
    RETURN;
  END IF;

  -- Manual login: verify password
  IF p_password IS NOT NULL AND length(btrim(p_password)) > 0 THEN
    IF u."Password" IS NOT DISTINCT FROM p_password THEN
      RETURN;
    END IF;
  END IF;

  RAISE EXCEPTION 'authorization failed';
END;
$$;

REVOKE ALL ON FUNCTION public._taskflow_verify_user(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._taskflow_verify_user(text, text) TO anon;
GRANT EXECUTE ON FUNCTION public._taskflow_verify_user(text, text) TO authenticated;


-- RPC: Create a task
CREATE OR REPLACE FUNCTION public.rpc_create_task(
  p_actor_id text,
  p_actor_password text,
  p_task_id text,
  p_employee_id text,
  p_employee_name text,
  p_title text,
  p_instructions text,
  p_file_link text DEFAULT '',
  p_deadline timestamptz DEFAULT NULL,
  p_priority text DEFAULT 'Normal',
  p_category text DEFAULT 'General',
  p_priority_flags jsonb DEFAULT '[]',
  p_purpose_checkboxes jsonb DEFAULT '[]',
  p_approval_action text DEFAULT '',
  p_region text DEFAULT 'Region I'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);

  INSERT INTO public."Tasks" (
    "TaskID", "EmployeeID", "EmployeeName", "Title", "Instructions",
    "FileLink", "Status", "Archived", "Deadline", "Priority", "Category",
    "PriorityFlags", "PurposeCheckboxes", "ApprovalAction", "Region", "CreatedAt"
  ) VALUES (
    p_task_id, p_employee_id, p_employee_name, p_title, p_instructions,
    COALESCE(p_file_link, ''), 'Assigned', 'FALSE', p_deadline, p_priority, p_category,
    p_priority_flags, p_purpose_checkboxes, COALESCE(p_approval_action, ''), p_region, NOW()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_task(text,text,text,text,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_task(text,text,text,text,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_task(text,text,text,text,text,text,text,text,timestamptz,text,text,jsonb,jsonb,text,text) TO authenticated;


-- RPC: Update a task
CREATE OR REPLACE FUNCTION public.rpc_update_task(
  p_actor_id text,
  p_actor_password text,
  p_task_id text,
  p_title text DEFAULT NULL,
  p_instructions text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_deadline timestamptz DEFAULT NULL,
  p_file_link text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);

  UPDATE public."Tasks" SET
    "Title"        = COALESCE(p_title, "Title"),
    "Instructions" = COALESCE(p_instructions, "Instructions"),
    "Priority"     = COALESCE(p_priority, "Priority"),
    "Category"     = COALESCE(p_category, "Category"),
    "Deadline"     = CASE WHEN p_deadline IS NOT NULL THEN p_deadline ELSE "Deadline" END,
    "FileLink"     = CASE WHEN p_file_link IS NOT NULL THEN p_file_link ELSE "FileLink" END
  WHERE "TaskID" = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_update_task(text,text,text,text,text,text,text,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_update_task(text,text,text,text,text,text,text,timestamptz,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_update_task(text,text,text,text,text,text,text,timestamptz,text) TO authenticated;


-- RPC: Set task status (Received / Completed)
CREATE OR REPLACE FUNCTION public.rpc_set_task_status(
  p_actor_id text,
  p_actor_password text,
  p_task_id text,
  p_status text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_status NOT IN ('Assigned', 'Received', 'Completed') THEN
    RAISE EXCEPTION 'invalid task status';
  END IF;
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);

  IF p_status = 'Received' THEN
    UPDATE public."Tasks" SET "Status" = p_status, "ReceivedAt" = NOW() WHERE "TaskID" = p_task_id;
  ELSIF p_status = 'Completed' THEN
    UPDATE public."Tasks" SET "Status" = p_status, "CompletedAt" = NOW() WHERE "TaskID" = p_task_id;
  ELSE
    UPDATE public."Tasks" SET "Status" = p_status WHERE "TaskID" = p_task_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_set_task_status(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_set_task_status(text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_set_task_status(text,text,text,text) TO authenticated;


-- RPC: Toggle task archive
CREATE OR REPLACE FUNCTION public.rpc_toggle_archive(
  p_actor_id text,
  p_actor_password text,
  p_task_id text,
  p_archived text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_archived NOT IN ('TRUE', 'FALSE') THEN
    RAISE EXCEPTION 'invalid archived value';
  END IF;
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);

  UPDATE public."Tasks" SET "Archived" = p_archived WHERE "TaskID" = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_toggle_archive(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_toggle_archive(text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_toggle_archive(text,text,text,text) TO authenticated;


-- RPC: Delete a task (and related records)
CREATE OR REPLACE FUNCTION public.rpc_delete_task(
  p_actor_id text,
  p_actor_password text,
  p_task_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);

  DELETE FROM public."Comments" WHERE "TaskID" = p_task_id;
  DELETE FROM public."Notifications" WHERE "TaskID" = p_task_id;
  DELETE FROM public."TaskHistory" WHERE "TaskID" = p_task_id;
  DELETE FROM public."Tasks" WHERE "TaskID" = p_task_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_task(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_delete_task(text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_task(text,text,text) TO authenticated;


-- ============================================================
-- 3. COMMENT & NOTIFICATION RPCs
-- ============================================================

-- RPC: Add a comment
CREATE OR REPLACE FUNCTION public.rpc_add_comment(
  p_actor_id text,
  p_actor_password text,
  p_task_id text,
  p_sender_name text,
  p_message text,
  p_hidden_by text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);

  INSERT INTO public."Comments" ("TaskID", "SenderName", "Message", "TimeStamp", "HiddenBy")
  VALUES (p_task_id, p_sender_name, p_message, NOW(), COALESCE(p_hidden_by, ''));
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_add_comment(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_add_comment(text,text,text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_add_comment(text,text,text,text,text,text) TO authenticated;


-- RPC: Create a notification
CREATE OR REPLACE FUNCTION public.rpc_create_notification(
  p_actor_id text,
  p_actor_password text,
  p_user_id text,
  p_message text,
  p_type text DEFAULT 'info',
  p_task_id text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);

  INSERT INTO public."Notifications" ("UserID", "Message", "Type", "IsRead", "CreatedAt", "TaskID")
  VALUES (p_user_id, p_message, p_type, 'FALSE', NOW(), p_task_id);
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_create_notification(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_create_notification(text,text,text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_notification(text,text,text,text,text,text) TO authenticated;


-- RPC: Mark notifications as read
CREATE OR REPLACE FUNCTION public.rpc_mark_notifications_read(
  p_actor_id text,
  p_actor_password text,
  p_user_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);
  UPDATE public."Notifications" SET "IsRead" = 'TRUE' WHERE "UserID" = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_notifications_read(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_notifications_read(text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_mark_notifications_read(text,text,text) TO authenticated;


-- RPC: Mark single notification as read
CREATE OR REPLACE FUNCTION public.rpc_mark_notification_read(
  p_actor_id text,
  p_actor_password text,
  p_notif_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);
  UPDATE public."Notifications" SET "IsRead" = 'TRUE' WHERE "ID" = p_notif_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_notification_read(text,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_notification_read(text,text,bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_mark_notification_read(text,text,bigint) TO authenticated;


-- RPC: Mark chat notifications read for a task
CREATE OR REPLACE FUNCTION public.rpc_mark_chat_notifications_read(
  p_actor_id text,
  p_actor_password text,
  p_task_id text,
  p_user_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);
  UPDATE public."Notifications"
  SET "IsRead" = 'TRUE'
  WHERE "TaskID" = p_task_id AND "Type" = 'chat' AND "UserID" = p_user_id AND "IsRead" = 'FALSE';
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_chat_notifications_read(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_chat_notifications_read(text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_mark_chat_notifications_read(text,text,text,text) TO authenticated;


-- RPC: Delete a notification
CREATE OR REPLACE FUNCTION public.rpc_delete_notification(
  p_actor_id text,
  p_actor_password text,
  p_notif_id bigint
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);
  DELETE FROM public."Notifications" WHERE "ID" = p_notif_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_delete_notification(text,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_delete_notification(text,text,bigint) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_delete_notification(text,text,bigint) TO authenticated;


-- RPC: Clear all notifications for a user
CREATE OR REPLACE FUNCTION public.rpc_clear_notifications(
  p_actor_id text,
  p_actor_password text,
  p_user_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);
  DELETE FROM public."Notifications" WHERE "UserID" = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_clear_notifications(text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_clear_notifications(text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_clear_notifications(text,text,text) TO authenticated;


-- RPC: Log task history
CREATE OR REPLACE FUNCTION public.rpc_log_history(
  p_actor_id text,
  p_actor_password text,
  p_task_id text,
  p_action text,
  p_actor_name text,
  p_note text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);

  INSERT INTO public."TaskHistory" ("TaskID", "Action", "Actor", "Note", "CreatedAt")
  VALUES (p_task_id, p_action, p_actor_name, COALESCE(p_note, ''), NOW());
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_log_history(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_log_history(text,text,text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_log_history(text,text,text,text,text,text) TO authenticated;


-- RPC: Mark chat as read (update HiddenBy on comments)
CREATE OR REPLACE FUNCTION public.rpc_mark_chat_read(
  p_actor_id text,
  p_actor_password text,
  p_task_id text,
  p_session_name text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public._taskflow_verify_user(p_actor_id, p_actor_password);

  UPDATE public."Comments"
  SET "HiddenBy" = CASE
    WHEN "HiddenBy" IS NULL OR "HiddenBy" = '' THEN p_session_name
    ELSE "HiddenBy" || ',' || p_session_name
  END
  WHERE "TaskID" = p_task_id
    AND "SenderName" <> p_session_name
    AND (COALESCE("HiddenBy", '') NOT LIKE '%' || p_session_name || '%');
END;
$$;

REVOKE ALL ON FUNCTION public.rpc_mark_chat_read(text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rpc_mark_chat_read(text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.rpc_mark_chat_read(text,text,text,text) TO authenticated;


-- ============================================================
-- 4. MISSING USER RPCs (user_update_status, user_update_own_profile)
-- ============================================================

CREATE OR REPLACE FUNCTION public.user_update_status(
  p_user_id text,
  p_status text,
  p_verify_password text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  u RECORD;
BEGIN
  SELECT * INTO u FROM public."Users" WHERE "ID" = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;

  -- Verify identity: JWT email or password
  IF jwt_email <> '' AND lower(trim(coalesce(u."Email", ''))) = jwt_email THEN
    -- OK: Google OAuth
  ELSIF p_verify_password IS NOT NULL AND length(btrim(p_verify_password)) > 0 AND u."Password" IS NOT DISTINCT FROM p_verify_password THEN
    -- OK: password match
  ELSE
    RAISE EXCEPTION 'authorization failed';
  END IF;

  UPDATE public."Users" SET "Status" = p_status WHERE "ID" = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.user_update_status(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_update_status(text, text, text) TO anon;
GRANT EXECUTE ON FUNCTION public.user_update_status(text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.user_update_own_profile(
  p_user_id text,
  p_verify_password text DEFAULT '',
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
  jwt_email text := lower(trim(coalesce(auth.jwt() ->> 'email', '')));
  u RECORD;
BEGIN
  SELECT * INTO u FROM public."Users" WHERE "ID" = p_user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'user not found'; END IF;

  -- Verify identity
  IF jwt_email <> '' AND lower(trim(coalesce(u."Email", ''))) = jwt_email THEN
    -- OK
  ELSIF p_verify_password IS NOT NULL AND length(btrim(p_verify_password)) > 0 AND u."Password" IS NOT DISTINCT FROM p_verify_password THEN
    -- OK
  ELSE
    RAISE EXCEPTION 'authorization failed';
  END IF;

  UPDATE public."Users" SET
    "Name"        = COALESCE(p_name, "Name"),
    "Designation" = COALESCE(p_designation, "Designation"),
    "Email"       = COALESCE(p_email, "Email"),
    "Unit"        = COALESCE(p_unit, "Unit"),
    "Office"      = COALESCE(p_unit, "Office"),
    "Password"    = CASE WHEN p_new_password IS NOT NULL AND length(btrim(p_new_password)) > 0 THEN p_new_password ELSE "Password" END,
    "ProfilePic"  = COALESCE(p_profile_pic, "ProfilePic")
  WHERE "ID" = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.user_update_own_profile(text,text,text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_update_own_profile(text,text,text,text,text,text,text,text) TO anon;
GRANT EXECUTE ON FUNCTION public.user_update_own_profile(text,text,text,text,text,text,text,text) TO authenticated;


-- ============================================================
-- 5. STORAGE ANON POLICIES (allow Personnel ID users to upload/download)
-- ============================================================

-- Anon can view files (download signed URLs)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Anon can view taskflow files'
  ) THEN
    CREATE POLICY "Anon can view taskflow files" ON storage.objects
    FOR SELECT TO anon USING (bucket_id = 'taskflow-files');
  END IF;
END $$;

-- Anon can upload files
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Anon can upload taskflow files'
  ) THEN
    CREATE POLICY "Anon can upload taskflow files" ON storage.objects
    FOR INSERT TO anon WITH CHECK (bucket_id = 'taskflow-files');
  END IF;
END $$;

-- Anon can update files
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND policyname = 'Anon can update taskflow files'
  ) THEN
    CREATE POLICY "Anon can update taskflow files" ON storage.objects
    FOR UPDATE TO anon USING (bucket_id = 'taskflow-files');
  END IF;
END $$;


-- ============================================================
-- 6. ENSURE ADMIN ACCOUNT HAS PLAIN-TEXT PASSWORD
-- ============================================================

-- The default schema seeds password as bcrypt hash, but loginUser() does
-- plain-text comparison. Set plain password for DIR-001 if it still has bcrypt.
UPDATE public."Users"
SET "Password" = 'admin123'
WHERE "ID" = 'DIR-001'
  AND "Password" LIKE '$2b$%';

-- Also ensure Region column exists
ALTER TABLE public."Users" ADD COLUMN IF NOT EXISTS "Region" text DEFAULT 'Region I';
ALTER TABLE public."Tasks" ADD COLUMN IF NOT EXISTS "Region" text DEFAULT 'Region I';
ALTER TABLE public."Tasks" ADD COLUMN IF NOT EXISTS "PriorityFlags" jsonb DEFAULT '[]';
ALTER TABLE public."Tasks" ADD COLUMN IF NOT EXISTS "PurposeCheckboxes" jsonb DEFAULT '[]';
ALTER TABLE public."Tasks" ADD COLUMN IF NOT EXISTS "ApprovalAction" text DEFAULT '';

-- Backfill Region for existing users/tasks without it
UPDATE public."Users" SET "Region" = 'Region I' WHERE "Region" IS NULL OR "Region" = '';
UPDATE public."Tasks" SET "Region" = 'Region I' WHERE "Region" IS NULL OR "Region" = '';


-- ============================================================
-- DONE
-- ============================================================
SELECT 'Admin system fix migration completed successfully' as status;
SELECT 'Anon RLS policies added for: Tasks, Comments, Notifications, TaskHistory, Storage' as rls_fix;
SELECT 'RPCs created for: task CRUD, comments, notifications, history, presence, profile' as rpc_fix;
SELECT 'Admin account DIR-001 password set to plain text for loginUser() compatibility' as admin_fix;
