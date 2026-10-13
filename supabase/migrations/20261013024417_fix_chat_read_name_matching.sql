-- Compare HiddenBy values as comma-delimited names. Substring matching made
-- "Ann" look like she had read a message when only "Anna" had read it.
CREATE OR REPLACE FUNCTION public.mark_chat_read(p_task_id text, p_session_name text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public."Comments"
  SET "HiddenBy" = CASE
    WHEN "HiddenBy" IS NULL OR "HiddenBy" = '' THEN btrim(p_session_name)
    ELSE "HiddenBy" || ',' || btrim(p_session_name)
  END
  WHERE "TaskID" = p_task_id
    AND nullif(btrim(p_session_name), '') IS NOT NULL
    AND "SenderName" IS DISTINCT FROM btrim(p_session_name)
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(string_to_array(COALESCE("HiddenBy", ''), ',')) AS hidden(name)
      WHERE btrim(hidden.name) = btrim(p_session_name)
    );
$$;
