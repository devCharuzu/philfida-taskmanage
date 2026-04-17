-- ============================================================
-- Fix RLS Policies for Permission Issues
-- Run this in Supabase SQL Editor if you get permission errors
-- ============================================================

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view all users" ON public."Users";
DROP POLICY IF EXISTS "Users can update own profile" ON public."Users";
DROP POLICY IF EXISTS "Tasks are viewable by all users" ON public."Tasks";
DROP POLICY IF EXISTS "Tasks can be inserted by authenticated users" ON public."Tasks";
DROP POLICY IF EXISTS "Tasks can be updated by authenticated users" ON public."Tasks";
DROP POLICY IF EXISTS "Comments are viewable by all users" ON public."Comments";
DROP POLICY IF EXISTS "Comments can be inserted by authenticated users" ON public."Comments";
DROP POLICY IF EXISTS "Users can view own notifications" ON public."Notifications";
DROP POLICY IF EXISTS "Users can insert own notifications" ON public."Notifications";
DROP POLICY IF EXISTS "Users can update own notifications" ON public."Notifications";
DROP POLICY IF EXISTS "TaskHistory is viewable by all users" ON public."TaskHistory";
DROP POLICY IF EXISTS "TaskHistory can be inserted by authenticated users" ON public."TaskHistory";

-- Create corrected and more secure policies

-- Users policies
CREATE POLICY "Users can view all users" ON public."Users" FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Users can update own profile" ON public."Users" FOR UPDATE USING (auth.uid()::text = "ID");
CREATE POLICY "Directors can insert users" ON public."Users" FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND 
  EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" = 'Director' AND "AccountStatus" = 'Active')
);

-- Tasks policies
CREATE POLICY "Tasks are viewable by relevant users" ON public."Tasks" FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    "EmployeeID" = auth.uid()::text OR
    EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active')
  )
);
CREATE POLICY "Tasks can be inserted by directors and unit heads" ON public."Tasks" FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND 
  EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active')
);
CREATE POLICY "Tasks can be updated by relevant users" ON public."Tasks" FOR UPDATE USING (
  auth.role() = 'authenticated' AND (
    "EmployeeID" = auth.uid()::text OR
    EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active')
  )
);

-- Comments policies
CREATE POLICY "Comments are viewable by task participants" ON public."Comments" FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    EXISTS (
      SELECT 1 FROM public."Tasks" t 
      WHERE t."TaskID" = public."Comments"."TaskID" 
      AND (t."EmployeeID" = auth.uid()::text OR 
           EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active'))
    )
  )
);
CREATE POLICY "Comments can be inserted by task participants" ON public."Comments" FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND (
    EXISTS (
      SELECT 1 FROM public."Tasks" t 
      WHERE t."TaskID" = public."Comments"."TaskID" 
      AND (t."EmployeeID" = auth.uid()::text OR 
           EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active'))
    )
  )
);

-- Notifications policies
CREATE POLICY "Users can view own notifications" ON public."Notifications" FOR SELECT USING (auth.uid()::text = "UserID");
CREATE POLICY "Users can insert own notifications" ON public."Notifications" FOR INSERT WITH CHECK (auth.uid()::text = "UserID");
CREATE POLICY "Users can update own notifications" ON public."Notifications" FOR UPDATE USING (auth.uid()::text = "UserID");

-- TaskHistory policies
CREATE POLICY "TaskHistory is viewable by task participants" ON public."TaskHistory" FOR SELECT USING (
  auth.role() = 'authenticated' AND (
    EXISTS (
      SELECT 1 FROM public."Tasks" t 
      WHERE t."TaskID" = public."TaskHistory"."TaskID" 
      AND (t."EmployeeID" = auth.uid()::text OR 
           EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active'))
    )
  )
);
CREATE POLICY "TaskHistory can be inserted by task participants" ON public."TaskHistory" FOR INSERT WITH CHECK (
  auth.role() = 'authenticated' AND (
    EXISTS (
      SELECT 1 FROM public."Tasks" t 
      WHERE t."TaskID" = public."TaskHistory"."TaskID" 
      AND (t."EmployeeID" = auth.uid()::text OR 
           EXISTS (SELECT 1 FROM public."Users" WHERE "ID" = auth.uid()::text AND "Role" IN ('Director', 'Unit Head') AND "AccountStatus" = 'Active'))
    )
  )
);

SELECT 'RLS policies fixed successfully ✓' as status;
