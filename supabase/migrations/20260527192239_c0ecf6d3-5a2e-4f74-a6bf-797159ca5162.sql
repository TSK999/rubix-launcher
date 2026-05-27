
-- 1) PROFILES: restrict reads by privacy field + friend/community relationship
DROP POLICY IF EXISTS "Profiles readable by authenticated" ON public.profiles;

CREATE POLICY "Profiles readable by privacy rules"
ON public.profiles
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR privacy = 'public'
  OR (privacy = 'friends' AND public.are_rubix_friends(auth.uid(), user_id))
  OR EXISTS (
    SELECT 1
    FROM public.community_members me
    JOIN public.community_members them
      ON them.community_id = me.community_id
    WHERE me.user_id = auth.uid()
      AND them.user_id = profiles.user_id
  )
);

-- 2) COMMUNITIES: hide invite_code at column level; expose via admin-only RPC
REVOKE SELECT (invite_code) ON public.communities FROM authenticated;
REVOKE SELECT (invite_code) ON public.communities FROM anon;

CREATE OR REPLACE FUNCTION public.get_community_invite_code(_cid uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT invite_code
  FROM public.communities
  WHERE id = _cid
    AND public.is_community_admin(_cid, auth.uid())
$$;

GRANT EXECUTE ON FUNCTION public.get_community_invite_code(uuid) TO authenticated;

-- 3) GAME-BUILDS storage: tighten INSERT/UPDATE/DELETE to verify game ownership.
-- Expected path format: {developer_uid}/{game_id}/...
DROP POLICY IF EXISTS "Devs upload game-builds" ON storage.objects;
DROP POLICY IF EXISTS "Devs update game-builds" ON storage.objects;
DROP POLICY IF EXISTS "Devs delete game-builds" ON storage.objects;

CREATE POLICY "Devs upload game-builds"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'game-builds'
  AND auth.uid()::text = (storage.foldername(name))[1]
  AND public.has_role(auth.uid(), 'developer'::app_role)
  AND EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id::text = (storage.foldername(name))[2]
      AND g.developer_id = auth.uid()
  )
);

CREATE POLICY "Devs update game-builds"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'game-builds'
  AND EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id::text = (storage.foldername(name))[2]
      AND (g.developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);

CREATE POLICY "Devs delete game-builds"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'game-builds'
  AND EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id::text = (storage.foldername(name))[2]
      AND (g.developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role))
  )
);
