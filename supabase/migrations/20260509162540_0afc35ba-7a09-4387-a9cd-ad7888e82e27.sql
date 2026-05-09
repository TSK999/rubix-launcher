
ALTER TABLE public.conversation_members
  ADD COLUMN IF NOT EXISTS nickname text,
  ADD COLUMN IF NOT EXISTS muted boolean NOT NULL DEFAULT false;

INSERT INTO storage.buckets (id, name, public)
VALUES ('conversation-avatars', 'conversation-avatars', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Conversation avatars are public" ON storage.objects;
CREATE POLICY "Conversation avatars are public"
ON storage.objects FOR SELECT
USING (bucket_id = 'conversation-avatars');

DROP POLICY IF EXISTS "Members upload conversation avatars" ON storage.objects;
CREATE POLICY "Members upload conversation avatars"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'conversation-avatars'
  AND public.is_conversation_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

DROP POLICY IF EXISTS "Members update conversation avatars" ON storage.objects;
CREATE POLICY "Members update conversation avatars"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'conversation-avatars'
  AND public.is_conversation_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);

DROP POLICY IF EXISTS "Members delete conversation avatars" ON storage.objects;
CREATE POLICY "Members delete conversation avatars"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'conversation-avatars'
  AND public.is_conversation_member(
    ((storage.foldername(name))[1])::uuid,
    auth.uid()
  )
);
