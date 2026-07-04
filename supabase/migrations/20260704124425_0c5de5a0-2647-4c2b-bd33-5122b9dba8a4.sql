
DROP POLICY IF EXISTS "Self join or admin add" ON public.conversation_members;
CREATE POLICY "Creator or admin add member"
ON public.conversation_members
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_members.conversation_id AND c.created_by = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = conversation_members.conversation_id
      AND m.user_id = auth.uid()
      AND m.is_admin = true
  )
);

CREATE OR REPLACE FUNCTION public.prevent_conv_member_selfpromo()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_admin IS DISTINCT FROM OLD.is_admin THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.conversation_members m
      WHERE m.conversation_id = NEW.conversation_id
        AND m.user_id = auth.uid()
        AND m.is_admin = true
    ) THEN
      RAISE EXCEPTION 'Only conversation admins can change admin status';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS prevent_conv_member_selfpromo ON public.conversation_members;
CREATE TRIGGER prevent_conv_member_selfpromo
BEFORE UPDATE ON public.conversation_members
FOR EACH ROW EXECUTE FUNCTION public.prevent_conv_member_selfpromo();

DROP POLICY IF EXISTS "Public read shared-clips" ON storage.objects;
CREATE POLICY "Viewable shared-clips read"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (
  bucket_id = 'shared-clips'
  AND (
    (auth.uid())::text = (storage.foldername(name))[1]
    OR EXISTS (
      SELECT 1 FROM public.shared_clips sc
      WHERE sc.visibility IN ('public','unlisted')
        AND (sc.original_path = name OR sc.stream_path = name OR sc.thumbnail_path = name)
    )
  )
);

DROP POLICY IF EXISTS "Presence visible to self, friends, or community co-members" ON public.user_presence;
CREATE POLICY "Presence visible to self or friends"
ON public.user_presence
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.are_rubix_friends(auth.uid(), user_id)
);
