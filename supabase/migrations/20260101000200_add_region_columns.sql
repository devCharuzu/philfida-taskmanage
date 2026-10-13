-- Migration: Add Region selection and isolation (Updated: Removed Central Office)
-- Run this in your Supabase SQL Editor

-- 1. Add Region column to Users table with Check Constraint
ALTER TABLE public."Users" 
ADD COLUMN IF NOT EXISTS "Region" TEXT DEFAULT 'Region I'
CHECK ("Region" IN ('Region I', 'Region IV', 'Region V', 'Region VI', 'Region VII', 'Region VIII', 'Region IX', 'Region X', 'Region XI', 'Region XIII'));

-- 2. Add Region column to Tasks table with Check Constraint
ALTER TABLE public."Tasks" 
ADD COLUMN IF NOT EXISTS "Region" TEXT DEFAULT 'Region I'
CHECK ("Region" IN ('Region I', 'Region IV', 'Region V', 'Region VI', 'Region VII', 'Region VIII', 'Region IX', 'Region X', 'Region XI', 'Region XIII'));

-- 3. Update existing data to a default region
UPDATE public."Users" SET "Region" = 'Region I' WHERE "Region" IS NULL OR "Region" = 'Central Office';
UPDATE public."Tasks" SET "Region" = 'Region I' WHERE "Region" IS NULL OR "Region" = 'Central Office';

-- 4. Fix: Allow NULL emails (Postgres allows multiple NULLs in UNIQUE column)
ALTER TABLE public."Users" ALTER COLUMN "Email" DROP NOT NULL;
UPDATE public."Users" SET "Email" = NULL WHERE "Email" = '';

-- 4. Add index for performance on Region columns
CREATE INDEX IF NOT EXISTS idx_users_region ON public."Users"("Region");
CREATE INDEX IF NOT EXISTS idx_tasks_region ON public."Tasks"("Region");

SELECT 'Region migration (no Central Office) applied successfully ✓' as status;
