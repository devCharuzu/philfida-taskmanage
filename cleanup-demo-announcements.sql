-- One-off cleanup: removes the three DEMO announcements created while testing
-- the announcements flow (ids 1-3). Safe to run once, then delete this file.
-- Recipients go first: AnnouncementRecipients references Announcements.
delete from public."AnnouncementRecipients"
 where "AnnouncementID" in (
   select "ID" from public."Announcements" where "Title" like 'DEMO —%'
 );

delete from public."Announcements" where "Title" like 'DEMO —%';
