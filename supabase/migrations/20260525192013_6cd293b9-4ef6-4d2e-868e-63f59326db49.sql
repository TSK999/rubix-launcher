
-- 1) Restrict profiles SELECT to authenticated users only
DROP POLICY IF EXISTS "Profiles basic info readable" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated"
ON public.profiles
FOR SELECT
TO authenticated
USING (true);

-- 2) Restrict user_presence visibility to self, friends, or community co-members
DROP POLICY IF EXISTS "Authenticated read presence" ON public.user_presence;
DROP POLICY IF EXISTS "Users view presence" ON public.user_presence;
DROP POLICY IF EXISTS "All authenticated read presence" ON public.user_presence;

-- find and drop any permissive SELECT policy on user_presence
DO $$
DECLARE p record;
BEGIN
  FOR p IN SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='user_presence' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.user_presence', p.policyname);
  END LOOP;
END$$;

CREATE POLICY "Presence visible to self, friends, or community co-members"
ON public.user_presence
FOR SELECT
TO authenticated
USING (
  auth.uid() = user_id
  OR public.are_rubix_friends(auth.uid(), user_id)
  OR EXISTS (
    SELECT 1
    FROM public.community_members cm1
    JOIN public.community_members cm2
      ON cm1.community_id = cm2.community_id
    WHERE cm1.user_id = auth.uid()
      AND cm2.user_id = user_presence.user_id
  )
);

-- 3) Helper to check call membership by topic id
CREATE OR REPLACE FUNCTION public.is_call_member(_call_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.call_sessions cs
    WHERE cs.id = _call_id
      AND (
        (cs.conversation_id IS NOT NULL AND public.is_conversation_member(cs.conversation_id, _uid))
        OR (cs.channel_id IS NOT NULL AND public.is_community_member(public.channel_community(cs.channel_id), _uid))
      )
  );
$$;

-- 4) Tighten realtime SELECT/INSERT policies on call-% and crail-vc-% topics
DROP POLICY IF EXISTS "Authenticated can subscribe to allowed topics" ON realtime.messages;
DROP POLICY IF EXISTS "Authenticated can broadcast to allowed topics" ON realtime.messages;

CREATE POLICY "Authenticated can subscribe to allowed topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() IS NULL
  OR realtime.topic() = ''
  OR (realtime.topic() LIKE 'conv:%' AND public.is_conversation_member((substring(realtime.topic() from 6))::uuid, auth.uid()))
  OR (realtime.topic() LIKE 'community:%' AND public.is_community_member((substring(realtime.topic() from 11))::uuid, auth.uid()))
  OR (realtime.topic() LIKE 'user:%' AND (substring(realtime.topic() from 6))::uuid = auth.uid())
  OR (realtime.topic() LIKE 'crail-vc-%' AND public.is_community_member((substring(realtime.topic() from 10))::uuid, auth.uid()))
  OR (realtime.topic() LIKE 'call-%' AND public.is_call_member((substring(realtime.topic() from 6))::uuid, auth.uid()))
);

CREATE POLICY "Authenticated can broadcast to allowed topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() IS NULL
  OR realtime.topic() = ''
  OR (realtime.topic() LIKE 'conv:%' AND public.is_conversation_member((substring(realtime.topic() from 6))::uuid, auth.uid()))
  OR (realtime.topic() LIKE 'community:%' AND public.is_community_member((substring(realtime.topic() from 11))::uuid, auth.uid()))
  OR (realtime.topic() LIKE 'crail-vc-%' AND public.is_community_member((substring(realtime.topic() from 10))::uuid, auth.uid()))
  OR (realtime.topic() LIKE 'call-%' AND public.is_call_member((substring(realtime.topic() from 6))::uuid, auth.uid()))
);
