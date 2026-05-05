-- ============================================================
-- PhilFIDA TaskFlow - Complete Database Schema (Fixed)
-- Run this in Supabase SQL Editor after creating new project
-- ============================================================

-- ============================================================
-- CORE TABLES
-- ============================================================

-- Users table - stores all user accounts and profiles
CREATE TABLE public."Users" (
  "ID" TEXT PRIMARY KEY,
  "Name" TEXT NOT NULL,
  "Email" TEXT UNIQUE NOT NULL,
  "Password" TEXT, -- For manual login (bcrypt hashed)
  "Role" TEXT NOT NULL CHECK ("Role" IN ('Director', 'Unit Head', 'Employee')),
  "Unit" TEXT DEFAULT '',
  "Office" TEXT DEFAULT '',
  "Designation" TEXT DEFAULT '',
  "ProfilePic" TEXT DEFAULT '',
  "Status" TEXT DEFAULT 'Available' CHECK ("Status" IN ('Available', 'Official Travel', 'On Leave')),
  "AccountStatus" TEXT DEFAULT 'Active' CHECK ("AccountStatus" IN ('Active', 'Pending', 'Deactivated')),
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "UpdatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks table - stores all task assignments
CREATE TABLE public."Tasks" (
  "TaskID" TEXT PRIMARY KEY,
  "EmployeeID" TEXT REFERENCES public."Users"("ID"),
  "EmployeeName" TEXT NOT NULL,
  "Title" TEXT NOT NULL,
  "Instructions" TEXT NOT NULL,
  "FileLink" TEXT DEFAULT '', -- Pipe-separated URLs for attachments
  "Status" TEXT DEFAULT 'Assigned' CHECK ("Status" IN ('Assigned', 'Received', 'Completed')),
  "Archived" TEXT DEFAULT 'FALSE' CHECK ("Archived" IN ('TRUE', 'FALSE')),
  "Deadline" TIMESTAMP WITH TIME ZONE,
  "Priority" TEXT DEFAULT 'Normal' CHECK ("Priority" IN ('Low', 'Normal', 'High', 'Urgent')),
  "Category" TEXT DEFAULT 'General',
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "ReceivedAt" TIMESTAMP WITH TIME ZONE,
  "CompletedAt" TIMESTAMP WITH TIME ZONE
);

-- Comments table - stores task discussions and attachments
CREATE TABLE public."Comments" (
  "ID" SERIAL PRIMARY KEY,
  "TaskID" TEXT NOT NULL REFERENCES public."Tasks"("TaskID") ON DELETE CASCADE,
  "SenderName" TEXT NOT NULL,
  "SenderID" TEXT REFERENCES public."Users"("ID"),
  "Message" TEXT NOT NULL, -- Can be plain text or JSON: {text: "...", files: "..."}
  "TimeStamp" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "HiddenBy" TEXT DEFAULT '' -- Comma-separated user IDs who marked as read
);

-- Notifications table - stores user notifications
CREATE TABLE public."Notifications" (
  "ID" SERIAL PRIMARY KEY,
  "UserID" TEXT NOT NULL REFERENCES public."Users"("ID") ON DELETE CASCADE,
  "Message" TEXT NOT NULL,
  "Type" TEXT DEFAULT 'info' CHECK ("Type" IN ('info', 'success', 'warning', 'error', 'task', 'chat')),
  "IsRead" TEXT DEFAULT 'FALSE' CHECK ("IsRead" IN ('TRUE', 'FALSE')),
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "TaskID" TEXT REFERENCES public."Tasks"("TaskID")
);

-- TaskHistory table - stores audit trail for task changes
CREATE TABLE public."TaskHistory" (
  "ID" SERIAL PRIMARY KEY,
  "TaskID" TEXT NOT NULL REFERENCES public."Tasks"("TaskID") ON DELETE CASCADE,
  "Action" TEXT NOT NULL, -- 'Dispatched', 'Received', 'Completed', 'Updated'
  "Actor" TEXT NOT NULL, -- Name of person who performed action
  "ActorID" TEXT REFERENCES public."Users"("ID"),
  "Note" TEXT DEFAULT '',
  "CreatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================
-- INDEXES FOR PERFORMANCE
-- ============================================================

CREATE INDEX idx_users_email ON public."Users"("Email");
CREATE INDEX idx_users_role ON public."Users"("Role");
CREATE INDEX idx_users_unit ON public."Users"("Unit");
CREATE INDEX idx_users_status ON public."Users"("AccountStatus");

CREATE INDEX idx_tasks_employee ON public."Tasks"("EmployeeID");
CREATE INDEX idx_tasks_status ON public."Tasks"("Status");
CREATE INDEX idx_tasks_archived ON public."Tasks"("Archived");
CREATE INDEX idx_tasks_created ON public."Tasks"("CreatedAt");
CREATE INDEX idx_tasks_deadline ON public."Tasks"("Deadline");

CREATE INDEX idx_comments_task ON public."Comments"("TaskID");
CREATE INDEX idx_comments_timestamp ON public."Comments"("TimeStamp");

CREATE INDEX idx_notifications_user ON public."Notifications"("UserID");
CREATE INDEX idx_notifications_read ON public."Notifications"("IsRead");
CREATE INDEX idx_notifications_created ON public."Notifications"("CreatedAt");

CREATE INDEX idx_taskhistory_task ON public."TaskHistory"("TaskID");
CREATE INDEX idx_taskhistory_created ON public."TaskHistory"("CreatedAt");

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================

-- Enable RLS on all tables
ALTER TABLE public."Users" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Comments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."Notifications" ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."TaskHistory" ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS POLICIES
-- ============================================================

-- Users table policies
CREATE POLICY "Users can view all users" ON public."Users" 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Users can update own profile" ON public."Users" 
FOR UPDATE
USING (
  auth.role() = 'authenticated' AND (
    auth.uid()::text = "ID" OR
    EXISTS (SELECT 1 FROM public."Users" u WHERE u."ID" = auth.uid()::text AND u."Role" = 'Director' AND u."AccountStatus" = 'Active')
  )
)
WITH CHECK (
  auth.role() = 'authenticated' AND (
    auth.uid()::text = "ID" OR
    EXISTS (SELECT 1 FROM public."Users" u WHERE u."ID" = auth.uid()::text AND u."Role" = 'Director' AND u."AccountStatus" = 'Active')
  )
);

CREATE POLICY "Directors can insert users" ON public."Users" 
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND 
  EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" = 'Director' AND "AccountStatus" = 'Active')
);

CREATE POLICY "Directors can delete users" ON public."Users" 
FOR DELETE USING (
  auth.role() = 'authenticated' AND 
  EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" = 'Director' AND "AccountStatus" = 'Active')
);

-- Anonymous API role (anon JWT): Personnel ID login + registration tab happen before Supabase Auth.
CREATE POLICY "Anon select Users for login" ON public."Users"
FOR SELECT TO anon USING (true);

CREATE POLICY "Anon insert pending Users" ON public."Users"
FOR INSERT TO anon
WITH CHECK (
  COALESCE("AccountStatus", '') = 'Pending'
  AND COALESCE("Role", '') IN ('Employee', 'Unit Head', 'Director')
);

-- Tasks table policies
CREATE POLICY "Tasks are viewable by relevant users" ON public."Tasks" 
FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    "EmployeeID" = auth.uid()::text OR
    EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active')
  )
);

CREATE POLICY "Tasks can be inserted by directors and unit heads" ON public."Tasks" 
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND 
  EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active')
);

CREATE POLICY "Tasks can be updated by relevant users" ON public."Tasks" 
FOR UPDATE
USING (
  auth.role() = 'authenticated' AND (
    "EmployeeID" = auth.uid()::text OR
    EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active')
  )
)
WITH CHECK (
  auth.role() = 'authenticated' AND (
    "EmployeeID" = auth.uid()::text OR
    EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active')
  )
);

CREATE POLICY "Directors can delete tasks" ON public."Tasks" 
FOR DELETE USING (
  auth.role() = 'authenticated' AND 
  EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" = 'Director' AND "AccountStatus" = 'Active')
);

-- Comments table policies
CREATE POLICY "Comments are viewable by task participants" ON public."Comments" 
FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    EXISTS (
      SELECT 1 FROM public."Tasks" t 
      WHERE t."TaskID" = public."Comments"."TaskID" 
      AND (t."EmployeeID" = auth.uid()::text OR 
           EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active'))
    )
  )
);

CREATE POLICY "Comments can be inserted by task participants" ON public."Comments" 
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND (
    EXISTS (
      SELECT 1 FROM public."Tasks" t 
      WHERE t."TaskID" = public."Comments"."TaskID" 
      AND (t."EmployeeID" = auth.uid()::text OR 
           EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active'))
    )
  )
);

-- Notifications table policies
CREATE POLICY "Users can view own notifications" ON public."Notifications" 
FOR SELECT USING (auth.uid()::text = "UserID");

CREATE POLICY "Users can insert notifications" ON public."Notifications" 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Users can update own notifications" ON public."Notifications" 
FOR UPDATE USING (auth.uid()::text = "UserID");

-- TaskHistory table policies
CREATE POLICY "TaskHistory is viewable by task participants" ON public."TaskHistory" 
FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    EXISTS (
      SELECT 1 FROM public."Tasks" t 
      WHERE t."TaskID" = public."TaskHistory"."TaskID" 
      AND (t."EmployeeID" = auth.uid()::text OR 
           EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active'))
    )
  )
);

CREATE POLICY "TaskHistory can be inserted by task participants" ON public."TaskHistory" 
FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND (
    EXISTS (
      SELECT 1 FROM public."Tasks" t 
      WHERE t."TaskID" = public."TaskHistory"."TaskID" 
      AND (t."EmployeeID" = auth.uid()::text OR 
           EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active'))
    )
  )
);

-- ============================================================
-- FUNCTIONS AND TRIGGERS
-- ============================================================

-- Function to automatically update UpdatedAt timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."UpdatedAt" = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for Users table to auto-update UpdatedAt
CREATE TRIGGER update_users_updated_at 
    BEFORE UPDATE ON public."Users" 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- DIRECTOR USER MANAGEMENT (RPCs bypass broken RLS: Users.ID ≠ auth.uid(),
-- personnel manual login uses anon JWT)
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

-- ============================================================
-- STORAGE CONFIGURATION
-- ============================================================

-- Create storage bucket for file attachments
INSERT INTO storage.buckets (id, name, public) 
VALUES ('taskflow-files', 'taskflow-files', false) 
ON CONFLICT (id) DO NOTHING;

-- Storage policies for file bucket
CREATE POLICY "Anyone can view files" ON storage.objects 
FOR SELECT USING (bucket_id = 'taskflow-files');

CREATE POLICY "Authenticated users can upload files" ON storage.objects 
FOR INSERT WITH CHECK (
  bucket_id = 'taskflow-files' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can update files" ON storage.objects 
FOR UPDATE USING (
  bucket_id = 'taskflow-files' AND 
  auth.role() = 'authenticated'
);

CREATE POLICY "Authenticated users can delete files" ON storage.objects 
FOR DELETE USING (
  bucket_id = 'taskflow-files' AND 
  auth.role() = 'authenticated'
);

-- ============================================================
-- DEFAULT DATA
-- ============================================================

-- Insert default Director account
-- Password: admin123 (bcrypt hashed with cost factor 12)
INSERT INTO public."Users" (
  "ID", "Name", "Email", "Password", "Role", "Unit", "Office", 
  "Designation", "AccountStatus", "Status"
) VALUES (
  'DIR-001',
  'System Director',
  'director@philfida.gov.ph',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsJqyX1sO',
  'Director',
  'Management',
  'Director Office',
  'System Director',
  'Active',
  'Available'
) ON CONFLICT ("Email") DO NOTHING;

-- ============================================================
-- REALTIME CONFIGURATION
-- ============================================================

-- Enable realtime for all tables
ALTER PUBLICATION supabase_realtime ADD TABLE public."Users";
ALTER PUBLICATION supabase_realtime ADD TABLE public."Tasks";
ALTER PUBLICATION supabase_realtime ADD TABLE public."Comments";
ALTER PUBLICATION supabase_realtime ADD TABLE public."Notifications";
ALTER PUBLICATION supabase_realtime ADD TABLE public."TaskHistory";

-- ============================================================
-- COMPLETION MESSAGE
-- ============================================================

SELECT 'PhilFIDA TaskFlow database schema created successfully ✓' as status;
SELECT 'Tables created: Users, Tasks, Comments, Notifications, TaskHistory' as tables_created;
SELECT 'Storage bucket created: taskflow-files' as storage_created;
SELECT 'RLS policies enabled and configured' as rls_status;
SELECT 'Default Director account: director@philfida.gov.ph / admin123' as default_account;
