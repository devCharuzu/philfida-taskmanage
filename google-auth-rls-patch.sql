-- SUPPLEMENTARY RLS POLICIES FOR GOOGLE AUTHENTICATED USERS
-- These policies ensure that users who log in via Google OAuth can access their data
-- even if their Supabase Auth UUID (auth.uid()) does not match their custom Users.ID string
-- (which happens when they registered manually and later bind Google, or were given a G- ID).
-- It matches them securely using the verified email from their JWT.

-- Tasks
CREATE POLICY "Tasks viewable by google auth" ON public."Tasks" 
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public."Users" u
    WHERE u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      AND (u."ID" = "EmployeeID" OR (u."Role" IN ('Director', 'Unit Head') AND u."AccountStatus" = 'Active'))
  )
);

CREATE POLICY "Tasks insertable by google auth" ON public."Tasks" 
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public."Users" u
    WHERE u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      AND u."Role" IN ('Director', 'Unit Head') 
      AND u."AccountStatus" = 'Active'
  )
);

CREATE POLICY "Tasks updatable by google auth" ON public."Tasks" 
FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public."Users" u
    WHERE u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      AND (u."ID" = "EmployeeID" OR (u."Role" IN ('Director', 'Unit Head') AND u."AccountStatus" = 'Active'))
  )
) WITH CHECK (
  EXISTS (
    SELECT 1 FROM public."Users" u
    WHERE u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
      AND (u."ID" = "EmployeeID" OR (u."Role" IN ('Director', 'Unit Head') AND u."AccountStatus" = 'Active'))
  )
);

-- Comments
CREATE POLICY "Comments viewable by google auth" ON public."Comments" 
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public."Tasks" t 
    JOIN public."Users" u ON (t."EmployeeID" = u."ID" OR (u."Role" IN ('Director', 'Unit Head') AND u."AccountStatus" = 'Active'))
    WHERE t."TaskID" = "TaskID" AND u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

CREATE POLICY "Comments insertable by google auth" ON public."Comments" 
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public."Tasks" t 
    JOIN public."Users" u ON (t."EmployeeID" = u."ID" OR (u."Role" IN ('Director', 'Unit Head') AND u."AccountStatus" = 'Active'))
    WHERE t."TaskID" = "TaskID" AND u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

-- TaskHistory
CREATE POLICY "TaskHistory viewable by google auth" ON public."TaskHistory" 
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public."Tasks" t 
    JOIN public."Users" u ON (t."EmployeeID" = u."ID" OR (u."Role" IN ('Director', 'Unit Head') AND u."AccountStatus" = 'Active'))
    WHERE t."TaskID" = "TaskID" AND u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

CREATE POLICY "TaskHistory insertable by google auth" ON public."TaskHistory" 
FOR INSERT TO authenticated WITH CHECK (
  EXISTS (
    SELECT 1 FROM public."Tasks" t 
    JOIN public."Users" u ON (t."EmployeeID" = u."ID" OR (u."Role" IN ('Director', 'Unit Head') AND u."AccountStatus" = 'Active'))
    WHERE t."TaskID" = "TaskID" AND u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

-- Notifications
CREATE POLICY "Notifications viewable by google auth" ON public."Notifications" 
FOR SELECT TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public."Users" u
    WHERE u."ID" = "UserID" AND u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

CREATE POLICY "Notifications insertable by google auth" ON public."Notifications" 
FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Notifications updatable by google auth" ON public."Notifications" 
FOR UPDATE TO authenticated USING (
  EXISTS (
    SELECT 1 FROM public."Users" u
    WHERE u."ID" = "UserID" AND u."Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
  )
);

-- Users (allow updating own presence/profile directly)
CREATE POLICY "Users updatable by google auth" ON public."Users" 
FOR UPDATE TO authenticated USING (
  "Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
) WITH CHECK (
  "Email" = lower(trim(coalesce(auth.jwt() ->> 'email', '')))
);
