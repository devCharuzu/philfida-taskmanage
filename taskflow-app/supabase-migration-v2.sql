-- ============================================================
-- TaskFlow PhilFIDA — Role Expansion Migration
-- Run this in Supabase SQL Editor
-- ============================================================

-- Add Unit column to Users
ALTER TABLE public."Users"
  ADD COLUMN IF NOT EXISTS "Unit" text DEFAULT '',
  ADD COLUMN IF NOT EXISTS "AccountStatus" text DEFAULT 'Active';

-- Set existing users as Active
UPDATE public."Users" SET "AccountStatus" = 'Active' WHERE "AccountStatus" IS NULL OR "AccountStatus" = '';

-- Update Director accounts to Active (just in case)
UPDATE public."Users" SET "AccountStatus" = 'Active' WHERE "Role" = 'Director';

-- Done
SELECT 'Migration complete ✓' as status;
