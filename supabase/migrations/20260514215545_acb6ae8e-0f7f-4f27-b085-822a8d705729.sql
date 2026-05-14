
-- Presence System 2.0: extend user_presence with rich ambient state
ALTER TABLE public.user_presence
  ADD COLUMN IF NOT EXISTS manual_status text,
  ADD COLUMN IF NOT EXISTS auto_status text,
  ADD COLUMN IF NOT EXISTS game_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_game text,
  ADD COLUMN IF NOT EXISTS last_game_ended_at timestamptz,
  ADD COLUMN IF NOT EXISTS session_seconds_today integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS session_day date,
  ADD COLUMN IF NOT EXISTS vc_call_id uuid,
  ADD COLUMN IF NOT EXISTS vc_channel_id uuid,
  ADD COLUMN IF NOT EXISTS vc_conversation_id uuid,
  ADD COLUMN IF NOT EXISTS vc_joined_at timestamptz,
  ADD COLUMN IF NOT EXISTS vc_speaking boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS spotify_track text,
  ADD COLUMN IF NOT EXISTS spotify_artist text,
  ADD COLUMN IF NOT EXISTS spotify_art_url text,
  ADD COLUMN IF NOT EXISTS spotify_updated_at timestamptz;

-- Validate manual_status values
CREATE OR REPLACE FUNCTION public.validate_user_presence()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.manual_status IS NOT NULL AND NEW.manual_status NOT IN
    ('online','available','gaming','in_match','idle','dnd','looking_to_play') THEN
    RAISE EXCEPTION 'invalid manual_status: %', NEW.manual_status;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS user_presence_validate ON public.user_presence;
CREATE TRIGGER user_presence_validate
  BEFORE INSERT OR UPDATE ON public.user_presence
  FOR EACH ROW EXECUTE FUNCTION public.validate_user_presence();

-- RPC: rich presence + active VC channel info for a set of user ids
CREATE OR REPLACE FUNCTION public.get_friend_presence(_uids uuid[])
RETURNS TABLE (
  user_id uuid,
  last_seen_at timestamptz,
  last_active_at timestamptz,
  game text,
  game_started_at timestamptz,
  last_game text,
  last_game_ended_at timestamptz,
  session_seconds_today integer,
  manual_status text,
  vc_call_id uuid,
  vc_channel_id uuid,
  vc_conversation_id uuid,
  vc_joined_at timestamptz,
  vc_speaking boolean,
  vc_channel_name text,
  vc_conversation_name text,
  vc_participant_count integer,
  spotify_track text,
  spotify_artist text,
  spotify_art_url text,
  spotify_updated_at timestamptz
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT
    p.user_id,
    p.last_seen_at,
    p.last_active_at,
    p.game,
    p.game_started_at,
    p.last_game,
    p.last_game_ended_at,
    p.session_seconds_today,
    p.manual_status,
    p.vc_call_id,
    p.vc_channel_id,
    p.vc_conversation_id,
    p.vc_joined_at,
    p.vc_speaking,
    cc.name AS vc_channel_name,
    conv.name AS vc_conversation_name,
    (SELECT count(*)::int FROM call_participants cp
       WHERE cp.call_id = p.vc_call_id AND cp.left_at IS NULL) AS vc_participant_count,
    p.spotify_track,
    p.spotify_artist,
    p.spotify_art_url,
    p.spotify_updated_at
  FROM user_presence p
  LEFT JOIN community_channels cc ON cc.id = p.vc_channel_id
  LEFT JOIN conversations conv ON conv.id = p.vc_conversation_id
  WHERE p.user_id = ANY(_uids);
$$;
