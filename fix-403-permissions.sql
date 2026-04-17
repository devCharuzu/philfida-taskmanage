-- ============================================================
-- Fix 403 Permission Errors - RLS Policy Adjustments
-- Run this in Supabase SQL Editor to fix permission issues
-- ============================================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view all users" ON public."Users";
DROP POLICY IF EXISTS "Users can update own profile" ON public."Users";
DROP POLICY IF EXISTS "Directors can insert users" ON public."Users";
DROP POLICY IF EXISTS "Tasks are viewable by relevant users" ON public."Tasks";
DROP POLICY IF EXISTS "Tasks can be inserted by directors and unit heads" ON public."Tasks";
DROP POLICY IF EXISTS "Tasks can be updated by relevant users" ON public."Tasks";
DROP POLICY IF EXISTS "Comments are viewable by task participants" ON public."Comments";
DROP POLICY IF EXISTS "Comments can be inserted by task participants" ON public."Comments";
DROP POLICY IF EXISTS "Users can view own notifications" ON public."Notifications";
DROP POLICY IF EXISTS "Users can insert own notifications" ON public."Notifications";
DROP POLICY IF EXISTS "Users can update own notifications" ON public."Notifications";
DROP POLICY IF EXISTS "TaskHistory is viewable by task participants" ON public."TaskHistory";
DROP POLICY IF EXISTS "TaskHistory can be inserted by task participants" ON public."TaskHistory";

-- Create more permissive policies for development/testing

-- Users table policies - more permissive for registration
CREATE POLICY "Enable read access for all authenticated users" ON public."Users" 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for authentication" ON public."Users" 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for users based on id" ON public."Users" 
FOR UPDATE USING (auth.uid()::text = "ID");

-- Tasks table policies
CREATE POLICY "Enable read access for all authenticated users" ON public."Tasks" 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for all authenticated users" ON public."Tasks" 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for all authenticated users" ON public."Tasks" 
FOR UPDATE USING (auth.role() = 'authenticated');

-- Comments table policies
CREATE POLICY "Enable read access for all authenticated users" ON public."Comments" 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for all authenticated users" ON public."Comments" 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Notifications table policies
CREATE POLICY "Enable read access for all authenticated users" ON public."Notifications" 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for all authenticated users" ON public."Notifications" 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for all authenticated users" ON public."Notifications" 
FOR UPDATE USING (auth.role() = 'authenticated');

-- TaskHistory table policies
CREATE POLICY "Enable read access for all authenticated users" ON public."TaskHistory" 
FOR SELECT USING (auth.role() = 'authenticated');

CREATE POLICY "Enable insert for all authenticated users" ON public."TaskHistory" 
FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Storage policies (if they exist)
DROP POLICY IF EXISTS "Anyone can view files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update files" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete files" ON storage.objects;

CREATE POLICY "Enable all operations for authenticated users" ON storage.objects 
FOR ALL USING (bucket_id = 'taskflow-files' AND auth.role() = 'authenticated');

SELECT '403 permission errors fixed - RLS policies updated to be more permissive' as status;
