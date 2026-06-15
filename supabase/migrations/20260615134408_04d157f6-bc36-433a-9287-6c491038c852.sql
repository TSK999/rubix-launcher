
CREATE TABLE public.community_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  creator_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  game_title text,
  game_cover text,
  starts_at timestamptz NOT NULL,
  ends_at timestamptz,
  channel_id uuid REFERENCES public.community_channels(id) ON DELETE SET NULL,
  max_attendees int,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_events TO authenticated;
GRANT ALL ON public.community_events TO service_role;

ALTER TABLE public.community_events ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER trg_community_events_updated_at
BEFORE UPDATE ON public.community_events
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Members view events"
ON public.community_events FOR SELECT
TO authenticated
USING (public.is_community_member(community_id, auth.uid()));

CREATE POLICY "Admins create events"
ON public.community_events FOR INSERT
TO authenticated
WITH CHECK (
  creator_id = auth.uid()
  AND public.is_community_admin(community_id, auth.uid())
);

CREATE POLICY "Creator or admin edits events"
ON public.community_events FOR UPDATE
TO authenticated
USING (
  creator_id = auth.uid()
  OR public.is_community_admin(community_id, auth.uid())
)
WITH CHECK (
  creator_id = auth.uid()
  OR public.is_community_admin(community_id, auth.uid())
);

CREATE POLICY "Creator or admin deletes events"
ON public.community_events FOR DELETE
TO authenticated
USING (
  creator_id = auth.uid()
  OR public.is_community_admin(community_id, auth.uid())
);

-- RSVPs
CREATE TABLE public.community_event_rsvps (
  event_id uuid NOT NULL REFERENCES public.community_events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'going',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.community_event_rsvps TO authenticated;
GRANT ALL ON public.community_event_rsvps TO service_role;

ALTER TABLE public.community_event_rsvps ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.validate_event_rsvp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('going','maybe','declined') THEN
    RAISE EXCEPTION 'invalid rsvp status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_event_rsvp
BEFORE INSERT OR UPDATE ON public.community_event_rsvps
FOR EACH ROW EXECUTE FUNCTION public.validate_event_rsvp();

CREATE TRIGGER trg_event_rsvps_updated_at
BEFORE UPDATE ON public.community_event_rsvps
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.event_community(_eid uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT community_id FROM public.community_events WHERE id = _eid;
$$;

CREATE POLICY "Members view rsvps"
ON public.community_event_rsvps FOR SELECT
TO authenticated
USING (public.is_community_member(public.event_community(event_id), auth.uid()));

CREATE POLICY "Members rsvp themselves"
ON public.community_event_rsvps FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.is_community_member(public.event_community(event_id), auth.uid())
);

CREATE POLICY "Update own rsvp"
ON public.community_event_rsvps FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Delete own rsvp"
ON public.community_event_rsvps FOR DELETE
TO authenticated
USING (user_id = auth.uid());

ALTER PUBLICATION supabase_realtime ADD TABLE public.community_events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_event_rsvps;
