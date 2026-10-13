-- One-off cleanup for demo data created while producing the user guide.
-- Safe to run once, then delete this file.
--
-- Note: Tasks' primary key is "TaskID" (text), not "ID". Writing
-- `select "ID" from "Tasks"` silently resolves to the OUTER table's "ID"
-- (a correlated reference) and fails with text = integer, so every subquery
-- below names "TaskID" explicitly.

-- 1) Demo announcement(s) used for the guide screenshots.
--    Recipients first: AnnouncementRecipients references Announcements.
delete from public."AnnouncementRecipients"
 where "AnnouncementID" in (
   select a."ID" from public."Announcements" a
    where a."Title" like 'DEMO —%'
       or a."Title" = 'Regional Quarterly Meeting — August 28, 2026'
 );

delete from public."Announcements"
 where "Title" like 'DEMO —%'
    or "Title" = 'Regional Quarterly Meeting — August 28, 2026';

-- 2) Demo task dispatched to COS-B18 for the guide screenshots.
--    Comments and TaskHistory are ON DELETE CASCADE, so deleting the task
--    removes them; only Notifications needs clearing by hand.
delete from public."Notifications"
 where "TaskID" in (
   select t."TaskID" from public."Tasks" t
    where t."Title" = 'Submit Q3 Regional Compliance Report'
 );

delete from public."Tasks"
 where "Title" = 'Submit Q3 Regional Compliance Report';
