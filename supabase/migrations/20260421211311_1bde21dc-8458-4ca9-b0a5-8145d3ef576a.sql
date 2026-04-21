CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(_other_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _conversation_id uuid;
BEGIN
  IF _me IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF _me = _other_user_id THEN
    RAISE EXCEPTION 'Cannot DM yourself';
  END IF;

  SELECT c.id
  INTO _conversation_id
  FROM public.conversations c
  JOIN public.conversation_members mine
    ON mine.conversation_id = c.id
   AND mine.user_id = _me
  JOIN public.conversation_members theirs
    ON theirs.conversation_id = c.id
   AND theirs.user_id = _other_user_id
  WHERE c.is_group = false
    AND (
      SELECT count(*)
      FROM public.conversation_members cm
      WHERE cm.conversation_id = c.id
    ) = 2
  LIMIT 1;

  IF _conversation_id IS NOT NULL THEN
    RETURN _conversation_id;
  END IF;

  _conversation_id := gen_random_uuid();

  INSERT INTO public.conversations (id, is_group, created_by)
  VALUES (_conversation_id, false, _me);

  INSERT INTO public.conversation_members (conversation_id, user_id, is_admin)
  VALUES
    (_conversation_id, _me, true),
    (_conversation_id, _other_user_id, false);

  RETURN _conversation_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;