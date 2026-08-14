-- ============================================================
-- Announcements
--
-- Apply this whole file in the Supabase SQL editor. It is idempotent.
--
-- Director, Records and Unit Head compose an announcement, pick who receives
-- it, optionally attach files and set an expiry. Recipients see it as a popup
-- on their next sign-in until they dismiss it, and can archive it afterwards.
--
-- Two tables: the announcement itself, and one row per recipient carrying that
-- person's own read / dismissed / archived state. Per-recipient state has to
-- live in its own row — putting it on the announcement would mean one person
-- dismissing it hides it for everyone.
--
-- Writes go through SECURITY DEFINER functions for the same reason as the rest
-- of this schema: the manual Personnel-ID flow talks to Supabase as `anon`
-- with no auth.uid(), so a row-level policy has nothing to compare against.
-- ============================================================

CREATE TABLE IF NOT EXISTS public."Announcements" (
  "ID"          bigserial PRIMARY KEY,
  "Title"       text NOT NULL,
  "Body"        text NOT NULL DEFAULT '',
  "FileLink"    text DEFAULT '',            -- pipe-separated storage paths
  "SenderID"    text NOT NULL REFERENCES public."Users"("ID") ON DELETE CASCADE,
  "SenderName"  text NOT NULL,
  "SenderRole"  text NOT NULL,
  "Region"      text NOT NULL,
  "ExpiresAt"   timestamptz,                -- NULL = never expires
  "Archived"    text NOT NULL DEFAULT 'FALSE' CHECK ("Archived" IN ('TRUE','FALSE')),
  "CreatedAt"   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public."AnnouncementRecipients" (
  "ID"             bigserial PRIMARY KEY,
  "AnnouncementID" bigint NOT NULL REFERENCES public."Announcements"("ID") ON DELETE CASCADE,
  "UserID"         text   NOT NULL REFERENCES public."Users"("ID") ON DELETE CASCADE,
  "IsRead"         text NOT NULL DEFAULT 'FALSE' CHECK ("IsRead"    IN ('TRUE','FALSE')),
  "Dismissed"      text NOT NULL DEFAULT 'FALSE' CHECK ("Dismissed" IN ('TRUE','FALSE')),
  "Archived"       text NOT NULL DEFAULT 'FALSE' CHECK ("Archived"  IN ('TRUE','FALSE')),
  "ReadAt"         timestamptz,
  UNIQUE ("AnnouncementID", "UserID")
);

CREATE INDEX IF NOT EXISTS idx_ann_region   ON public."Announcements"("Region");
CREATE INDEX IF NOT EXISTS idx_ann_expires  ON public."Announcements"("ExpiresAt");
CREATE INDEX IF NOT EXISTS idx_annrcp_user  ON public."AnnouncementRecipients"("UserID");

ALTER TABLE public."Announcements"           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public."AnnouncementRecipients"  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anon can read Announcements" ON public."Announcements";
CREATE POLICY "Anon can read Announcements" ON public."Announcements"
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "Anon can read AnnouncementRecipients" ON public."AnnouncementRecipients";
CREATE POLICY "Anon can read AnnouncementRecipients" ON public."AnnouncementRecipients"
  FOR SELECT TO anon, authenticated USING (true);

-- ── Compose ─────────────────────────────────────────────────────────────
-- Only Director, Records and Unit Head may send. The role is read from the
-- database rather than trusted from the client.
CREATE OR REPLACE FUNCTION public.create_announcement(
  p_sender_id   text,
  p_title       text,
  p_body        text,
  p_file_link   text,
  p_expires_at  timestamptz,
  p_recipients  text[]
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  snd public."Users"%ROWTYPE;
  new_id bigint;
  r text;
BEGIN
  SELECT * INTO snd FROM public."Users" u WHERE u."ID" = p_sender_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'sender not found'; END IF;
  IF snd."Role" NOT IN ('Director','Records','Unit Head') THEN
    RAISE EXCEPTION 'not allowed to post announcements';
  END IF;
  IF coalesce(btrim(p_title),'') = '' THEN RAISE EXCEPTION 'title is required'; END IF;
  IF p_recipients IS NULL OR array_length(p_recipients,1) IS NULL THEN
    RAISE EXCEPTION 'select at least one recipient';
  END IF;

  INSERT INTO public."Announcements"
    ("Title","Body","FileLink","SenderID","SenderName","SenderRole","Region","ExpiresAt")
  VALUES (btrim(p_title), coalesce(p_body,''), coalesce(p_file_link,''),
          snd."ID", snd."Name", snd."Role", coalesce(snd."Region",'Region I'), p_expires_at)
  RETURNING "ID" INTO new_id;

  FOREACH r IN ARRAY p_recipients LOOP
    INSERT INTO public."AnnouncementRecipients" ("AnnouncementID","UserID")
    VALUES (new_id, r)
    ON CONFLICT ("AnnouncementID","UserID") DO NOTHING;
  END LOOP;

  RETURN new_id;
END;
$$;

-- ── Recipient state: read / "do not show again" / archive ───────────────
CREATE OR REPLACE FUNCTION public.set_announcement_state(
  p_announcement_id bigint,
  p_user_id         text,
  p_is_read         boolean DEFAULT NULL,
  p_dismissed       boolean DEFAULT NULL,
  p_archived        boolean DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  UPDATE public."AnnouncementRecipients"
     SET "IsRead"    = CASE WHEN p_is_read   IS NULL THEN "IsRead"
                            WHEN p_is_read   THEN 'TRUE' ELSE 'FALSE' END,
         "Dismissed" = CASE WHEN p_dismissed IS NULL THEN "Dismissed"
                            WHEN p_dismissed THEN 'TRUE' ELSE 'FALSE' END,
         "Archived"  = CASE WHEN p_archived  IS NULL THEN "Archived"
                            WHEN p_archived  THEN 'TRUE' ELSE 'FALSE' END,
         "ReadAt"    = CASE WHEN p_is_read THEN now() ELSE "ReadAt" END
   WHERE "AnnouncementID" = p_announcement_id
     AND "UserID" = p_user_id;
END;
$$;

-- ── Sender-side archive / delete ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.archive_announcement(
  p_announcement_id bigint,
  p_sender_id       text,
  p_archived        boolean
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE owner_id text;
BEGIN
  SELECT "SenderID" INTO owner_id FROM public."Announcements" WHERE "ID" = p_announcement_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'announcement not found'; END IF;
  IF owner_id IS DISTINCT FROM p_sender_id THEN RAISE EXCEPTION 'not your announcement'; END IF;
  UPDATE public."Announcements"
     SET "Archived" = CASE WHEN p_archived THEN 'TRUE' ELSE 'FALSE' END
   WHERE "ID" = p_announcement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.create_announcement(text,text,text,text,timestamptz,text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_announcement_state(bigint,text,boolean,boolean,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.archive_announcement(bigint,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_announcement(text,text,text,text,timestamptz,text[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_announcement_state(bigint,text,boolean,boolean,boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_announcement(bigint,text,boolean) TO anon, authenticated;
