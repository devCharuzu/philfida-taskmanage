-- ============================================================
-- PhilFIDA TaskFlow - Create Director Account
-- Run this in Supabase SQL Editor after creating your project
-- ============================================================

-- Insert Director user with secure password
-- Password: admin123 (hashed with bcrypt)
-- Email: director@philfida.gov.ph
-- Change these values as needed for your setup

INSERT INTO public."Users" (
  "Name", 
  "Email", 
  "Password", 
  "Role", 
  "Unit", 
  "Office", 
  "Designation",
  "AccountStatus",
  "Status"
) VALUES (
  'System Director',
  'director@philfida.gov.ph',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsJqyX1sO', -- bcrypt hash of 'admin123'
  'Director',
  'Management',
  'Director Office',
  'System Director',
  'Active',
  'Available'
) ON CONFLICT ("Email") DO UPDATE SET
  "Name" = EXCLUDED."Name",
  "Password" = EXCLUDED."Password",
  "Role" = EXCLUDED."Role",
  "Unit" = EXCLUDED."Unit",
  "Office" = EXCLUDED."Office",
  "Designation" = EXCLUDED."Designation",
  "AccountStatus" = EXCLUDED."AccountStatus",
  "Status" = EXCLUDED."Status",
  "UpdatedAt" = NOW();

-- Verify the director account was created
SELECT 
  "ID",
  "Name", 
  "Email", 
  "Role", 
  "AccountStatus",
  "CreatedAt"
FROM public."Users" 
WHERE "Role" = 'Director' AND "Email" = 'director@philfida.gov.ph';

-- Output confirmation
SELECT 'Director account created successfully! Email: director@philfida.gov.ph, Password: admin123' as status;

-- ============================================================
-- Additional Director Accounts (Optional)
-- Uncomment and modify as needed
-- ============================================================

/*
-- Example: Create additional director for specific unit
INSERT INTO public."Users" (
  "Name", 
  "Email", 
  "Password", 
  "Role", 
  "Unit", 
  "Office", 
  "Designation",
  "AccountStatus",
  "Status"
) VALUES (
  'John Director',
  'john.doe@philfida.gov.ph',
  '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj6hsJqyX1sO', -- bcrypt hash of 'admin123'
  'Director',
  'Operations',
  'Operations Office',
  'Operations Director',
  'Active',
  'Available'
) ON CONFLICT ("Email") DO NOTHING;
*/

-- ============================================================
-- Password Hashing Reference
-- To create new hashed passwords, use bcrypt with cost factor 12
-- Online tool: https://bcrypt-generator.com/
-- Or use Node.js: 
-- const bcrypt = require('bcrypt');
-- await bcrypt.hash('your-password', 12);
-- ============================================================
