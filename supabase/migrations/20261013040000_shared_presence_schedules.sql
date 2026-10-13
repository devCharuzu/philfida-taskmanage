-- Shared future availability schedules.
--
-- The browser previously kept travel/leave schedules only in per-user
-- localStorage. That meant other accounts could not see an absence until the
-- owner's browser activated it and updated Users.Status. The shared roster is
-- returned through a credential-verified RPC; write/removal RPCs also verify
-- ownership so callers cannot edit another user's schedule.

CREATE TABLE IF NOT EXISTS public."PresenceSchedules" (
  "ID" text PRIMARY KEY,
  "UserID" text NOT NULL REFERENCES public."Users"("ID") ON DELETE CASCADE,
  "EmployeeName" text NOT NULL,
  "Region" text NOT NULL DEFAULT 'Region I',
  "Type" text NOT NULL CHECK ("Type" IN ('travel', 'leave')),
  "StartDate" date NOT NULL,
  "StartTime" time NOT NULL DEFAULT '00:00',
  "EndDate" date NOT NULL,
  "EndTime" time NOT NULL DEFAULT '23:59',
  "TravelActivity" text NOT NULL DEFAULT '',
  "TravelLocation" text NOT NULL DEFAULT '',
  "TravelLat" double precision,
  "TravelLng" double precision,
  "LeaveType" text NOT NULL DEFAULT '',
  "LeaveReason" text NOT NULL DEFAULT '',
  "Attachments" text NOT NULL DEFAULT '',
  "CreatedAt" timestamptz NOT NULL DEFAULT now(),
  CHECK (("EndDate" + "EndTime") >= ("StartDate" + "StartTime"))
);

CREATE INDEX IF NOT EXISTS idx_presence_schedules_user_window
  ON public."PresenceSchedules" ("UserID", "StartDate", "EndDate");

ALTER TABLE public."PresenceSchedules" ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public."PresenceSchedules" FROM PUBLIC, anon, authenticated;

-- The schedule details include travel locations and leave reasons. App users
-- have a custom login (so most API requests use the shared anon role), which
-- means a table-wide SELECT policy would expose those details to anyone with
-- the public API key. Return the shared roster only after verifying the
-- requesting app account, using the same login model as user_update_status.
CREATE OR REPLACE FUNCTION public.user_get_presence_schedules(
  p_user_id text,
  p_verify_password text DEFAULT NULL
)
RETURNS SETOF public."PresenceSchedules"
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rec public."Users"%ROWTYPE;
  jwt_email text;
  authorized boolean := false;
BEGIN
  SELECT * INTO rec FROM public."Users" WHERE "ID" = p_user_id;
  IF NOT FOUND OR rec."AccountStatus" IS DISTINCT FROM 'Active' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  jwt_email := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  IF jwt_email IS NOT NULL
     AND nullif(lower(trim(coalesce(rec."Email", ''))), '') = jwt_email THEN
    authorized := true;
  END IF;

  IF NOT authorized
     AND coalesce(trim(p_verify_password), '') <> ''
     AND rec."Password" IS NOT DISTINCT FROM trim(p_verify_password) THEN
    authorized := true;
  END IF;
  IF NOT authorized THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
    SELECT schedule.*
    FROM public."PresenceSchedules" AS schedule
    JOIN public."Users" AS employee ON employee."ID" = schedule."UserID"
    WHERE employee."AccountStatus" = 'Active'
    ORDER BY schedule."StartDate", schedule."StartTime", schedule."EmployeeName";
END;
$$;

CREATE OR REPLACE FUNCTION public.user_save_presence_schedule(
  p_user_id text,
  p_verify_password text,
  p_schedule jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rec public."Users"%ROWTYPE;
  jwt_email text;
  authorized boolean := false;
  v_id text;
  v_type text;
  v_start_date date;
  v_start_time time;
  v_end_date date;
  v_end_time time;
  affected_rows integer;
BEGIN
  SELECT * INTO rec FROM public."Users" WHERE "ID" = p_user_id;
  IF NOT FOUND OR rec."AccountStatus" IS DISTINCT FROM 'Active' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  jwt_email := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  IF jwt_email IS NOT NULL
     AND nullif(lower(trim(coalesce(rec."Email", ''))), '') = jwt_email THEN
    authorized := true;
  END IF;

  IF NOT authorized
     AND coalesce(trim(p_verify_password), '') <> ''
     AND rec."Password" IS NOT DISTINCT FROM trim(p_verify_password) THEN
    authorized := true;
  END IF;
  IF NOT authorized THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  v_id := nullif(trim(p_schedule ->> 'ID'), '');
  v_type := lower(trim(coalesce(p_schedule ->> 'Type', '')));
  IF v_id IS NULL OR v_type NOT IN ('travel', 'leave') THEN
    RAISE EXCEPTION 'invalid presence schedule';
  END IF;

  v_start_date := (p_schedule ->> 'StartDate')::date;
  v_start_time := coalesce(nullif(p_schedule ->> 'StartTime', '')::time, time '00:00');
  v_end_date := (p_schedule ->> 'EndDate')::date;
  v_end_time := coalesce(nullif(p_schedule ->> 'EndTime', '')::time, time '23:59');
  IF (v_end_date + v_end_time) < (v_start_date + v_start_time) THEN
    RAISE EXCEPTION 'schedule end must be after schedule start';
  END IF;

  INSERT INTO public."PresenceSchedules" (
    "ID", "UserID", "EmployeeName", "Region", "Type",
    "StartDate", "StartTime", "EndDate", "EndTime",
    "TravelActivity", "TravelLocation", "TravelLat", "TravelLng",
    "LeaveType", "LeaveReason", "Attachments"
  ) VALUES (
    v_id, rec."ID", rec."Name", coalesce(rec."Region", 'Region I'), v_type,
    v_start_date, v_start_time, v_end_date, v_end_time,
    coalesce(p_schedule ->> 'TravelActivity', ''),
    coalesce(p_schedule ->> 'TravelLocation', ''),
    nullif(p_schedule ->> 'TravelLat', '')::double precision,
    nullif(p_schedule ->> 'TravelLng', '')::double precision,
    coalesce(p_schedule ->> 'LeaveType', ''),
    coalesce(p_schedule ->> 'LeaveReason', ''),
    coalesce(p_schedule ->> 'Attachments', '')
  )
  ON CONFLICT ("ID") DO UPDATE SET
    "EmployeeName" = EXCLUDED."EmployeeName",
    "Region" = EXCLUDED."Region",
    "Type" = EXCLUDED."Type",
    "StartDate" = EXCLUDED."StartDate",
    "StartTime" = EXCLUDED."StartTime",
    "EndDate" = EXCLUDED."EndDate",
    "EndTime" = EXCLUDED."EndTime",
    "TravelActivity" = EXCLUDED."TravelActivity",
    "TravelLocation" = EXCLUDED."TravelLocation",
    "TravelLat" = EXCLUDED."TravelLat",
    "TravelLng" = EXCLUDED."TravelLng",
    "LeaveType" = EXCLUDED."LeaveType",
    "LeaveReason" = EXCLUDED."LeaveReason",
    "Attachments" = EXCLUDED."Attachments"
  WHERE public."PresenceSchedules"."UserID" = rec."ID";

  GET DIAGNOSTICS affected_rows = ROW_COUNT;
  IF affected_rows = 0 THEN RAISE EXCEPTION 'schedule id is already in use'; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.user_cancel_presence_schedule(
  p_user_id text,
  p_verify_password text,
  p_schedule_id text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  rec public."Users"%ROWTYPE;
  jwt_email text;
  authorized boolean := false;
BEGIN
  SELECT * INTO rec FROM public."Users" WHERE "ID" = p_user_id;
  IF NOT FOUND OR rec."AccountStatus" IS DISTINCT FROM 'Active' THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  jwt_email := nullif(lower(trim(coalesce(auth.jwt() ->> 'email', ''))), '');
  IF jwt_email IS NOT NULL
     AND nullif(lower(trim(coalesce(rec."Email", ''))), '') = jwt_email THEN
    authorized := true;
  END IF;

  IF NOT authorized
     AND coalesce(trim(p_verify_password), '') <> ''
     AND rec."Password" IS NOT DISTINCT FROM trim(p_verify_password) THEN
    authorized := true;
  END IF;
  IF NOT authorized THEN
    RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_schedule_id IS NULL THEN
    DELETE FROM public."PresenceSchedules" WHERE "UserID" = rec."ID";
  ELSE
    DELETE FROM public."PresenceSchedules"
    WHERE "ID" = p_schedule_id AND "UserID" = rec."ID";
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.user_get_presence_schedules(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_get_presence_schedules(text, text) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.user_save_presence_schedule(text, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_save_presence_schedule(text, text, jsonb) TO anon, authenticated;
REVOKE ALL ON FUNCTION public.user_cancel_presence_schedule(text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.user_cancel_presence_schedule(text, text, text) TO anon, authenticated;

-- Make newly created RPCs visible to PostgREST immediately after migration.
NOTIFY pgrst, 'reload schema';

