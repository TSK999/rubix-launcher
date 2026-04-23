
-- =========================================================
-- ENUM
-- =========================================================
DO $$ BEGIN
  CREATE TYPE public.community_role AS ENUM ('owner', 'admin', 'member');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- COMMUNITIES
-- =========================================================
CREATE TABLE public.communities (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  icon_url     text,
  banner_url   text,
  owner_id     uuid NOT NULL,
  invite_code  text NOT NULL UNIQUE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.community_members (
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  role         public.community_role NOT NULL DEFAULT 'member',
  joined_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (community_id, user_id)
);
CREATE INDEX idx_community_members_user ON public.community_members(user_id);

CREATE TABLE public.community_channels (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  community_id uuid NOT NULL REFERENCES public.communities(id) ON DELETE CASCADE,
  name         text NOT NULL,
  kind         text NOT NULL CHECK (kind IN ('text','voice')),
  position     int  NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_channels_community ON public.community_channels(community_id);

CREATE TABLE public.community_messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id   uuid NOT NULL REFERENCES public.community_channels(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL,
  content      text,
  reply_to_id  uuid REFERENCES public.community_messages(id) ON DELETE SET NULL,
  edited_at    timestamptz,
  deleted_at   timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_cmsg_channel_created ON public.community_messages(channel_id, created_at);

CREATE TABLE public.community_message_attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id   uuid NOT NULL REFERENCES public.community_messages(id) ON DELETE CASCADE,
  kind         text NOT NULL,
  storage_path text,
  external_url text,
  mime_type    text,
  file_name    text,
  size_bytes   bigint,
  width        int,
  height       int,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.community_message_reactions (
  message_id   uuid NOT NULL REFERENCES public.community_messages(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL,
  emoji        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- =========================================================
-- CALLS
-- =========================================================
CREATE TABLE public.call_sessions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  channel_id      uuid REFERENCES public.community_channels(id) ON DELETE CASCADE,
  started_by      uuid NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  CHECK (
    (conversation_id IS NOT NULL AND channel_id IS NULL) OR
    (conversation_id IS NULL AND channel_id IS NOT NULL)
  )
);
CREATE INDEX idx_call_sessions_conv    ON public.call_sessions(conversation_id) WHERE conversation_id IS NOT NULL;
CREATE INDEX idx_call_sessions_channel ON public.call_sessions(channel_id)      WHERE channel_id IS NOT NULL;

CREATE TABLE public.call_participants (
  call_id   uuid NOT NULL REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  user_id   uuid NOT NULL,
  peer_id   text NOT NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  left_at   timestamptz,
  PRIMARY KEY (call_id, user_id)
);

-- =========================================================
-- SECURITY DEFINER HELPERS
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_community_member(_cid uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.community_members WHERE community_id = _cid AND user_id = _uid);
$$;

CREATE OR REPLACE FUNCTION public.community_role_of(_cid uuid, _uid uuid)
RETURNS public.community_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.community_members WHERE community_id = _cid AND user_id = _uid;
$$;

CREATE OR REPLACE FUNCTION public.is_community_admin(_cid uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.community_members
    WHERE community_id = _cid AND user_id = _uid AND role IN ('owner','admin')
  );
$$;

CREATE OR REPLACE FUNCTION public.channel_community(_chid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT community_id FROM public.community_channels WHERE id = _chid;
$$;

CREATE OR REPLACE FUNCTION public.message_community(_mid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cc.community_id
  FROM public.community_messages cm
  JOIN public.community_channels cc ON cc.id = cm.channel_id
  WHERE cm.id = _mid;
$$;

CREATE OR REPLACE FUNCTION public.gen_invite_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
  END LOOP;
  RETURN result;
END $$;

-- Create community + owner membership + default channels
CREATE OR REPLACE FUNCTION public.create_community(_name text, _icon_url text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _cid uuid;
  _code text;
  _tries int := 0;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF _name IS NULL OR length(trim(_name)) = 0 THEN RAISE EXCEPTION 'Name required'; END IF;

  LOOP
    _code := public.gen_invite_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.communities WHERE invite_code = _code);
    _tries := _tries + 1;
    IF _tries > 10 THEN RAISE EXCEPTION 'Could not generate invite code'; END IF;
  END LOOP;

  INSERT INTO public.communities(name, icon_url, owner_id, invite_code)
  VALUES (trim(_name), _icon_url, _me, _code)
  RETURNING id INTO _cid;

  INSERT INTO public.community_members(community_id, user_id, role)
  VALUES (_cid, _me, 'owner');

  INSERT INTO public.community_channels(community_id, name, kind, position) VALUES
    (_cid, 'general', 'text', 0),
    (_cid, 'General Voice', 'voice', 1);

  RETURN _cid;
END $$;

-- Join via invite code
CREATE OR REPLACE FUNCTION public.join_community_by_code(_code text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _cid uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT id INTO _cid FROM public.communities WHERE invite_code = upper(trim(_code));
  IF _cid IS NULL THEN RAISE EXCEPTION 'Invalid invite code'; END IF;

  INSERT INTO public.community_members(community_id, user_id, role)
  VALUES (_cid, _me, 'member')
  ON CONFLICT (community_id, user_id) DO NOTHING;

  RETURN _cid;
END $$;

CREATE OR REPLACE FUNCTION public.regenerate_invite_code(_cid uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _me uuid := auth.uid();
  _code text;
  _tries int := 0;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.is_community_admin(_cid, _me) THEN RAISE EXCEPTION 'Forbidden'; END IF;

  LOOP
    _code := public.gen_invite_code();
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.communities WHERE invite_code = _code);
    _tries := _tries + 1;
    IF _tries > 10 THEN RAISE EXCEPTION 'Could not generate invite code'; END IF;
  END LOOP;

  UPDATE public.communities SET invite_code = _code, updated_at = now() WHERE id = _cid;
  RETURN _code;
END $$;

-- Triggers: updated_at + edited_at
CREATE TRIGGER trg_communities_updated
BEFORE UPDATE ON public.communities
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.mark_cmsg_edited()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content AND NEW.deleted_at IS NULL THEN
    NEW.edited_at = now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_cmsg_edited
BEFORE UPDATE ON public.community_messages
FOR EACH ROW EXECUTE FUNCTION public.mark_cmsg_edited();

-- =========================================================
-- RLS
-- =========================================================
ALTER TABLE public.communities                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_members             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_channels            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_messages            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.community_message_reactions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_sessions                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_participants             ENABLE ROW LEVEL SECURITY;

-- communities
CREATE POLICY "Members view community" ON public.communities
  FOR SELECT TO authenticated USING (public.is_community_member(id, auth.uid()));
CREATE POLICY "Anyone can lookup by invite" ON public.communities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated create community" ON public.communities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = owner_id);
CREATE POLICY "Admins update community" ON public.communities
  FOR UPDATE TO authenticated USING (public.is_community_admin(id, auth.uid()));
CREATE POLICY "Owner deletes community" ON public.communities
  FOR DELETE TO authenticated USING (auth.uid() = owner_id);

-- community_members
CREATE POLICY "Members view roster" ON public.community_members
  FOR SELECT TO authenticated USING (public.is_community_member(community_id, auth.uid()));
CREATE POLICY "Self or admin add member" ON public.community_members
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id OR public.is_community_admin(community_id, auth.uid())
  );
CREATE POLICY "Admins update roles" ON public.community_members
  FOR UPDATE TO authenticated USING (public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "Self leave or admin remove" ON public.community_members
  FOR DELETE TO authenticated USING (
    auth.uid() = user_id OR public.is_community_admin(community_id, auth.uid())
  );

-- community_channels
CREATE POLICY "Members view channels" ON public.community_channels
  FOR SELECT TO authenticated USING (public.is_community_member(community_id, auth.uid()));
CREATE POLICY "Admins create channels" ON public.community_channels
  FOR INSERT TO authenticated WITH CHECK (public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "Admins update channels" ON public.community_channels
  FOR UPDATE TO authenticated USING (public.is_community_admin(community_id, auth.uid()));
CREATE POLICY "Admins delete channels" ON public.community_channels
  FOR DELETE TO authenticated USING (public.is_community_admin(community_id, auth.uid()));

-- community_messages
CREATE POLICY "Members view messages" ON public.community_messages
  FOR SELECT TO authenticated USING (public.is_community_member(public.channel_community(channel_id), auth.uid()));
CREATE POLICY "Members send messages" ON public.community_messages
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = sender_id AND public.is_community_member(public.channel_community(channel_id), auth.uid())
  );
CREATE POLICY "Sender edits own message" ON public.community_messages
  FOR UPDATE TO authenticated USING (auth.uid() = sender_id);
CREATE POLICY "Sender deletes own message" ON public.community_messages
  FOR DELETE TO authenticated USING (auth.uid() = sender_id);

-- community_message_attachments
CREATE POLICY "Members view cmsg attachments" ON public.community_message_attachments
  FOR SELECT TO authenticated USING (public.is_community_member(public.message_community(message_id), auth.uid()));
CREATE POLICY "Sender adds cmsg attachments" ON public.community_message_attachments
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM public.community_messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
  );
CREATE POLICY "Sender removes cmsg attachments" ON public.community_message_attachments
  FOR DELETE TO authenticated USING (
    EXISTS (SELECT 1 FROM public.community_messages m WHERE m.id = message_id AND m.sender_id = auth.uid())
  );

-- community_message_reactions
CREATE POLICY "Members view cmsg reactions" ON public.community_message_reactions
  FOR SELECT TO authenticated USING (public.is_community_member(public.message_community(message_id), auth.uid()));
CREATE POLICY "Members add cmsg reactions" ON public.community_message_reactions
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND public.is_community_member(public.message_community(message_id), auth.uid())
  );
CREATE POLICY "Members remove own cmsg reactions" ON public.community_message_reactions
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- call_sessions
CREATE POLICY "Participants view call sessions" ON public.call_sessions
  FOR SELECT TO authenticated USING (
    (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()))
    OR (channel_id IS NOT NULL AND public.is_community_member(public.channel_community(channel_id), auth.uid()))
  );
CREATE POLICY "Participants create call session" ON public.call_sessions
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = started_by AND (
      (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()))
      OR (channel_id IS NOT NULL AND public.is_community_member(public.channel_community(channel_id), auth.uid()))
    )
  );
CREATE POLICY "Participants end call session" ON public.call_sessions
  FOR UPDATE TO authenticated USING (
    (conversation_id IS NOT NULL AND public.is_conversation_member(conversation_id, auth.uid()))
    OR (channel_id IS NOT NULL AND public.is_community_member(public.channel_community(channel_id), auth.uid()))
  );

-- call_participants
CREATE POLICY "Participants view roster" ON public.call_participants
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.call_sessions cs
      WHERE cs.id = call_id AND (
        (cs.conversation_id IS NOT NULL AND public.is_conversation_member(cs.conversation_id, auth.uid()))
        OR (cs.channel_id IS NOT NULL AND public.is_community_member(public.channel_community(cs.channel_id), auth.uid()))
      )
    )
  );
CREATE POLICY "Self join call" ON public.call_participants
  FOR INSERT TO authenticated WITH CHECK (
    auth.uid() = user_id AND EXISTS (
      SELECT 1 FROM public.call_sessions cs
      WHERE cs.id = call_id AND (
        (cs.conversation_id IS NOT NULL AND public.is_conversation_member(cs.conversation_id, auth.uid()))
        OR (cs.channel_id IS NOT NULL AND public.is_community_member(public.channel_community(cs.channel_id), auth.uid()))
      )
    )
  );
CREATE POLICY "Self update call participant" ON public.call_participants
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Self leave call" ON public.call_participants
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- =========================================================
-- REALTIME
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_channels;
ALTER PUBLICATION supabase_realtime ADD TABLE public.community_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_sessions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_participants;
