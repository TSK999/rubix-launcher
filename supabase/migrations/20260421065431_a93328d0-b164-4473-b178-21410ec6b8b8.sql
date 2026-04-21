-- ============================================================
-- MESSAGING SCHEMA
-- ============================================================

-- Conversations (DMs and group chats)
CREATE TABLE public.conversations (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  is_group BOOLEAN NOT NULL DEFAULT false,
  name TEXT,
  avatar_url TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_conversations_last_message ON public.conversations(last_message_at DESC);

-- Members
CREATE TABLE public.conversation_members (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX idx_conv_members_user ON public.conversation_members(user_id);

-- Messages
CREATE TABLE public.messages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT,
  reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_messages_conv ON public.messages(conversation_id, created_at DESC);

-- Attachments (one or many per message)
CREATE TABLE public.message_attachments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  storage_path TEXT,            -- path in chat-attachments bucket (NULL for external GIFs)
  external_url TEXT,            -- for Tenor GIFs / external links
  kind TEXT NOT NULL,           -- 'image' | 'video' | 'file' | 'gif'
  mime_type TEXT,
  file_name TEXT,
  size_bytes BIGINT,
  width INT,
  height INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_attachments_message ON public.message_attachments(message_id);

-- Reactions
CREATE TABLE public.message_reactions (
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  emoji TEXT NOT NULL,          -- unicode emoji or custom:id
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

-- Typing indicators (ephemeral)
CREATE TABLE public.typing_indicators (
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (conversation_id, user_id)
);

-- Custom emojis (per-user personal pack)
CREATE TABLE public.custom_emojis (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  owner_id UUID NOT NULL,
  name TEXT NOT NULL,           -- shortcode without colons
  storage_path TEXT NOT NULL,   -- path in custom-emojis bucket
  url TEXT NOT NULL,            -- public URL
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (owner_id, name)
);
CREATE INDEX idx_custom_emojis_owner ON public.custom_emojis(owner_id);

-- ============================================================
-- HELPER FUNCTION (avoids recursive RLS on conversation_members)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_conversation_member(_conv UUID, _user UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.conversation_members
    WHERE conversation_id = _conv AND user_id = _user
  );
$$;

-- ============================================================
-- ENABLE RLS
-- ============================================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conversation_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.typing_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_emojis ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- POLICIES: conversations
-- ============================================================
CREATE POLICY "Members view conversations"
ON public.conversations FOR SELECT TO authenticated
USING (public.is_conversation_member(id, auth.uid()));

CREATE POLICY "Authenticated create conversations"
ON public.conversations FOR INSERT TO authenticated
WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Members update conversations"
ON public.conversations FOR UPDATE TO authenticated
USING (public.is_conversation_member(id, auth.uid()));

CREATE POLICY "Creator deletes conversation"
ON public.conversations FOR DELETE TO authenticated
USING (auth.uid() = created_by);

-- ============================================================
-- POLICIES: conversation_members
-- ============================================================
CREATE POLICY "Members view membership"
ON public.conversation_members FOR SELECT TO authenticated
USING (public.is_conversation_member(conversation_id, auth.uid()));

-- Allow inserting members if you're the conversation creator OR adding yourself OR already a member
CREATE POLICY "Members can add members"
ON public.conversation_members FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  OR public.is_conversation_member(conversation_id, auth.uid())
  OR EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_id AND c.created_by = auth.uid())
);

CREATE POLICY "Members update own membership"
ON public.conversation_members FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Leave or admin remove"
ON public.conversation_members FOR DELETE TO authenticated
USING (
  auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = conversation_members.conversation_id
      AND m.user_id = auth.uid() AND m.is_admin = true
  )
);

-- ============================================================
-- POLICIES: messages
-- ============================================================
CREATE POLICY "Members view messages"
ON public.messages FOR SELECT TO authenticated
USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "Members send messages"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = sender_id
  AND public.is_conversation_member(conversation_id, auth.uid())
);

CREATE POLICY "Sender edits own message"
ON public.messages FOR UPDATE TO authenticated
USING (auth.uid() = sender_id);

CREATE POLICY "Sender deletes own message"
ON public.messages FOR DELETE TO authenticated
USING (auth.uid() = sender_id);

-- ============================================================
-- POLICIES: message_attachments
-- ============================================================
CREATE POLICY "Members view attachments"
ON public.message_attachments FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
      AND public.is_conversation_member(m.conversation_id, auth.uid())
  )
);

CREATE POLICY "Sender adds attachments"
ON public.message_attachments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND m.sender_id = auth.uid()
  )
);

CREATE POLICY "Sender deletes attachments"
ON public.message_attachments FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id AND m.sender_id = auth.uid()
  )
);

-- ============================================================
-- POLICIES: message_reactions
-- ============================================================
CREATE POLICY "Members view reactions"
ON public.message_reactions FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
      AND public.is_conversation_member(m.conversation_id, auth.uid())
  )
);

CREATE POLICY "Members add own reactions"
ON public.message_reactions FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1 FROM public.messages m
    WHERE m.id = message_id
      AND public.is_conversation_member(m.conversation_id, auth.uid())
  )
);

CREATE POLICY "Members remove own reactions"
ON public.message_reactions FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- POLICIES: typing_indicators
-- ============================================================
CREATE POLICY "Members view typing"
ON public.typing_indicators FOR SELECT TO authenticated
USING (public.is_conversation_member(conversation_id, auth.uid()));

CREATE POLICY "Members set own typing"
ON public.typing_indicators FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND public.is_conversation_member(conversation_id, auth.uid())
);

CREATE POLICY "Members update own typing"
ON public.typing_indicators FOR UPDATE TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Members delete own typing"
ON public.typing_indicators FOR DELETE TO authenticated
USING (auth.uid() = user_id);

-- ============================================================
-- POLICIES: custom_emojis
-- ============================================================
CREATE POLICY "Anyone views custom emojis"
ON public.custom_emojis FOR SELECT TO authenticated
USING (true);

CREATE POLICY "Owner manages own emojis insert"
ON public.custom_emojis FOR INSERT TO authenticated
WITH CHECK (auth.uid() = owner_id);

CREATE POLICY "Owner manages own emojis update"
ON public.custom_emojis FOR UPDATE TO authenticated
USING (auth.uid() = owner_id);

CREATE POLICY "Owner manages own emojis delete"
ON public.custom_emojis FOR DELETE TO authenticated
USING (auth.uid() = owner_id);

-- ============================================================
-- TRIGGERS
-- ============================================================

-- Update conversations.last_message_at when a message is inserted
CREATE OR REPLACE FUNCTION public.bump_conversation_last_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE public.conversations
  SET last_message_at = NEW.created_at,
      updated_at = NEW.created_at
  WHERE id = NEW.conversation_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_bump_conv_last_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.bump_conversation_last_message();

-- updated_at trigger for conversations
CREATE TRIGGER trg_conversations_updated_at
BEFORE UPDATE ON public.conversations
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Mark message edited_at when content changes
CREATE OR REPLACE FUNCTION public.mark_message_edited()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.content IS DISTINCT FROM OLD.content AND NEW.deleted_at IS NULL THEN
    NEW.edited_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_mark_message_edited
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.mark_message_edited();

-- ============================================================
-- REALTIME
-- ============================================================
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;
ALTER TABLE public.typing_indicators REPLICA IDENTITY FULL;
ALTER TABLE public.conversation_members REPLICA IDENTITY FULL;
ALTER TABLE public.conversations REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_attachments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.typing_indicators;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversation_members;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;

-- ============================================================
-- STORAGE BUCKETS
-- ============================================================

-- Private bucket for chat attachments (signed URLs)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('chat-attachments', 'chat-attachments', false, 26214400) -- 25MB
ON CONFLICT (id) DO NOTHING;

-- Public bucket for custom emojis
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('custom-emojis', 'custom-emojis', true, 1048576) -- 1MB
ON CONFLICT (id) DO NOTHING;

-- Storage policies: chat-attachments
-- Path convention: {conversation_id}/{user_id}/{filename}
CREATE POLICY "Conv members read attachments"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND public.is_conversation_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

CREATE POLICY "Conv members upload attachments"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[2]
  AND public.is_conversation_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

CREATE POLICY "Uploader deletes own attachments"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'chat-attachments'
  AND auth.uid()::text = (storage.foldername(name))[2]
);

-- Storage policies: custom-emojis (path: {owner_id}/{filename})
CREATE POLICY "Anyone reads custom emojis"
ON storage.objects FOR SELECT
USING (bucket_id = 'custom-emojis');

CREATE POLICY "Owner uploads own emoji"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'custom-emojis'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Owner deletes own emoji"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'custom-emojis'
  AND auth.uid()::text = (storage.foldername(name))[1]
);