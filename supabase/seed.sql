-- ============================================================
-- Local development seed — FABRICATED DATA ONLY
--
-- Runs automatically on `supabase db reset`. Local stack only; this file must
-- never be applied to production.
--
-- Every name, email and password below is invented. Do NOT replace this with a
-- dump of production: real personnel records plus plain-text passwords on a
-- development laptop is exactly the exposure the local setup exists to prevent,
-- and one careless `git add` publishes it.
--
-- Passwords are plain text because that is how the app currently compares them
-- (login_user() does `rec."Password" = p_password`). When password hashing lands,
-- this file changes with it.
-- ============================================================

-- Remove the base schema's placeholder Director. Its bcrypt password cannot be
-- used to log in — loginUser() compares plain text — so it is dead weight
-- locally and would only cause confusion.
DELETE FROM public."Users" WHERE "ID" = 'DIR-001';

INSERT INTO public."Users" (
  "ID", "Name", "Email", "Password", "Role", "Unit", "Office",
  "Designation", "AccountStatus", "Status", "Region"
) VALUES
  -- Director — the only role that can manage users and dispatch to anyone.
  ('TEST-DIR-01', 'Testy Directorson', 'testy.director@example.test', 'localdev',
   'Director', 'Management', 'Office of the Director General',
   'Regional Director', 'Active', 'Available', 'Region I'),

  -- Unit Head — sees their unit's tasks, dispatches within the unit.
  ('TEST-UH-01', 'Uma Headley', 'uma.headley@example.test', 'localdev',
   'Unit Head', 'Planning Unit', 'Planning Division',
   'Unit Head', 'Active', 'Available', 'Region I'),

  -- Records — the role that used to be rejected by the Role CHECK constraint;
  -- seeded so the /records dashboard is reachable without hand-editing rows.
  ('TEST-REC-01', 'Reggie Cordova', 'reggie.cordova@example.test', 'localdev',
   'Records', 'Administrative and Management Unit', 'Administrative Division',
   'Records Officer', 'Active', 'Available', 'Region I'),

  -- Employee, stored value for what the UI labels "Unit Personnel".
  ('TEST-EMP-01', 'Emma Ployee', 'emma.ployee@example.test', 'localdev',
   'Employee', 'Planning Unit', 'Planning Division',
   'Planning Officer II', 'Active', 'Available', 'Region I'),

  -- Second Employee, on Official Travel with the full marker format. This row
  -- is the regression test for the drift migration: if the Users_Status_check
  -- constraint is present, this INSERT fails and the seed aborts loudly.
  ('TEST-EMP-02', 'Ferdinand Fieldworker', 'ferdinand.field@example.test', 'localdev',
   'Employee', 'Research Unit', 'Research & Development',
   'Science Research Specialist I', 'Active',
   'Official Travel — Fiber Survey at Batac, Ilocos Norte (Sep 8-12) [GEO:18.0554,120.5649]',
   'Region I'),

  -- Pending account, so the Director's approval queue is never empty.
  ('TEST-PEND-01', 'Pia Pending', 'pia.pending@example.test', 'localdev',
   'Employee', 'Regulatory Unit', 'Operations Division',
   'Regulation Officer I', 'Pending', 'Available', 'Region I'),

  -- Deactivated account, to exercise the 'deactivated' login_error path.
  ('TEST-DEAC-01', 'Dexter Deactivated', 'dexter.deac@example.test', 'localdev',
   'Employee', 'Technical Assistance Unit', 'Operations Division',
   'Agriculturist I', 'Deactivated', 'Available', 'Region I'),

  -- Different region — proves region isolation actually filters. Logging in as
  -- a Region I user must never surface this person or their tasks.
  ('TEST-EMP-R4', 'Rosa Regionfour', 'rosa.r4@example.test', 'localdev',
   'Employee', 'Planning Unit', 'Planning Division',
   'Planning Officer I', 'Active', 'Available', 'Region IV')
ON CONFLICT ("ID") DO NOTHING;

-- A task in each lifecycle state, so every dashboard has something to render
-- without clicking through the dispatch flow first.
INSERT INTO public."Tasks" (
  "TaskID", "EmployeeID", "EmployeeName", "Title", "Instructions",
  "Status", "Priority", "Category", "Archived", "Region", "Deadline"
) VALUES
  ('TASK-LOCAL-001', 'TEST-EMP-01', 'Emma Ployee',
   'Draft the quarterly planning memo',
   'Seeded locally. Assigned but not yet opened by the assignee.',
   'Assigned', 'High', 'Report', 'FALSE', 'Region I', NOW() + INTERVAL '5 days'),

  ('TASK-LOCAL-002', 'TEST-EMP-01', 'Emma Ployee',
   'Consolidate fiber production figures',
   'Seeded locally. Already accepted — exercises the Received state.',
   'Received', 'Normal', 'Data', 'FALSE', 'Region I', NOW() + INTERVAL '2 days'),

  ('TASK-LOCAL-003', 'TEST-EMP-02', 'Ferdinand Fieldworker',
   'Submit field survey photos',
   'Seeded locally. Completed — exercises the timeline''s final state.',
   'Completed', 'Low', 'Field', 'FALSE', 'Region I', NOW() - INTERVAL '1 day'),

  -- Overdue and still open: DeadlineProgress renders its urgent state from this.
  ('TASK-LOCAL-004', 'TEST-EMP-01', 'Emma Ployee',
   'Overdue compliance checklist',
   'Seeded locally. Deadline already passed while still Assigned.',
   'Assigned', 'Urgent', 'Compliance', 'FALSE', 'Region I', NOW() - INTERVAL '3 days'),

  -- Archived, so the Director's archive view is not empty.
  ('TASK-LOCAL-005', 'TEST-UH-01', 'Uma Headley',
   'Last quarter''s unit summary',
   'Seeded locally. Archived.',
   'Completed', 'Low', 'Report', 'TRUE', 'Region I', NOW() - INTERVAL '30 days')
ON CONFLICT ("TaskID") DO NOTHING;

-- Log in with any Personnel ID above and the password: localdev
