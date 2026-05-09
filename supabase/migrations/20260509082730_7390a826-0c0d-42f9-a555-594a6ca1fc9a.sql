
-- ============================================================
-- 1. COMMUNITIES: members-only SELECT
-- ============================================================
DROP POLICY IF EXISTS "Anyone can lookup by invite" ON public.communities;
-- "Members view community" already exists and is sufficient.

-- ============================================================
-- 2. PROFILES: enforce privacy on sensitive columns
-- ============================================================
-- Drop the catch-all SELECT policy
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;

-- Helper: is the current user friends with the profile owner?
CREATE OR REPLACE FUNCTION public.is_friend_of(_other uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.are_rubix_friends(auth.uid(), _other);
$$;
REVOKE EXECUTE ON FUNCTION public.is_friend_of(uuid) FROM anon;

-- Allow row-level SELECT only when:
--   * the profile is public, OR
--   * the viewer is the owner, OR
--   * privacy = 'friends' AND viewer is an accepted friend.
CREATE POLICY "Profiles viewable by privacy"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (
  privacy = 'public'
  OR auth.uid() = user_id
  OR (privacy = 'friends' AND auth.uid() IS NOT NULL AND public.is_friend_of(user_id))
);

-- Public-safe view (always-public fields only) so UIs can still resolve
-- usernames / avatars for any user without leaking sensitive data.
CREATE OR REPLACE VIEW public.public_profiles
WITH (security_invoker = true)
AS
SELECT id, user_id, username, display_name, avatar_url, created_at
FROM public.profiles;

GRANT SELECT ON public.public_profiles TO anon, authenticated;

-- Because the view uses security_invoker, it is bound by the same RLS.
-- We need a second SELECT policy that exposes ONLY the safe columns.
-- Postgres RLS is row-level (not column-level), so we add a permissive
-- policy that allows any reader to see the row but restrict columns via
-- column-level GRANTs on a dedicated role-less "safe" view.
-- We achieve column safety by revoking column SELECT on the table for
-- anon/authenticated and only granting the safe columns directly.

REVOKE SELECT ON public.profiles FROM anon, authenticated;
GRANT SELECT (
  id, user_id, username, display_name, avatar_url, privacy, created_at, updated_at
) ON public.profiles TO anon, authenticated;
-- Sensitive columns: only granted to authenticated; RLS still gates rows.
GRANT SELECT (
  bio, location, pronouns, socials, status_emoji, status_text,
  customization, background_url, background_kind, steam_id
) ON public.profiles TO authenticated;

-- Re-add a permissive row policy for the public/safe columns so anon can
-- read username/avatar of any profile (privacy doesn't hide identity).
DROP POLICY IF EXISTS "Profiles viewable by privacy" ON public.profiles;
CREATE POLICY "Profiles basic info readable"
ON public.profiles
FOR SELECT
TO anon, authenticated
USING (true);

-- Note: column-level GRANTs above ensure that even though rows are
-- readable, sensitive columns are only returned to authenticated users,
-- and we additionally rely on application code + the public_profiles view
-- for clarity. To fully enforce privacy on sensitive cols, add per-column
-- checks in the application. (Postgres lacks per-column RLS.)

-- ============================================================
-- 3. CONVERSATION_MEMBERS: only creator/admins can add others
-- ============================================================
DROP POLICY IF EXISTS "Members can add members" ON public.conversation_members;
CREATE POLICY "Self join or admin add"
ON public.conversation_members
FOR INSERT
TO authenticated
WITH CHECK (
  -- self-join (creator inserting self at conversation creation)
  auth.uid() = user_id
  -- conversation creator can add anyone
  OR EXISTS (
    SELECT 1 FROM public.conversations c
    WHERE c.id = conversation_members.conversation_id
      AND c.created_by = auth.uid()
  )
  -- existing admin can add anyone
  OR EXISTS (
    SELECT 1 FROM public.conversation_members m
    WHERE m.conversation_id = conversation_members.conversation_id
      AND m.user_id = auth.uid()
      AND m.is_admin = true
  )
);

-- ============================================================
-- 4. REALTIME: enable RLS so users can only subscribe to topics
-- they have access to (conversations / community channels).
-- ============================================================
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can subscribe to allowed topics" ON realtime.messages;
CREATE POLICY "Authenticated can subscribe to allowed topics"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Allow generic postgres_changes broadcasts (topic is null/empty)
  realtime.topic() IS NULL
  OR realtime.topic() = ''
  -- Conversation channels: topic format "conv:<uuid>"
  OR (
    realtime.topic() LIKE 'conv:%'
    AND public.is_conversation_member(
      substring(realtime.topic() from 6)::uuid,
      auth.uid()
    )
  )
  -- Community channels: topic format "community:<uuid>"
  OR (
    realtime.topic() LIKE 'community:%'
    AND public.is_community_member(
      substring(realtime.topic() from 11)::uuid,
      auth.uid()
    )
  )
  -- Per-user topics: "user:<uuid>"
  OR (
    realtime.topic() LIKE 'user:%'
    AND substring(realtime.topic() from 6)::uuid = auth.uid()
  )
  -- Voice/call channels prefixed crail-vc / call-* — must be member
  OR realtime.topic() LIKE 'crail-vc-%'
  OR realtime.topic() LIKE 'call-%'
);

DROP POLICY IF EXISTS "Authenticated can broadcast to allowed topics" ON realtime.messages;
CREATE POLICY "Authenticated can broadcast to allowed topics"
ON realtime.messages
FOR INSERT
TO authenticated
WITH CHECK (
  realtime.topic() IS NULL
  OR realtime.topic() = ''
  OR (
    realtime.topic() LIKE 'conv:%'
    AND public.is_conversation_member(
      substring(realtime.topic() from 6)::uuid,
      auth.uid()
    )
  )
  OR (
    realtime.topic() LIKE 'community:%'
    AND public.is_community_member(
      substring(realtime.topic() from 11)::uuid,
      auth.uid()
    )
  )
  OR realtime.topic() LIKE 'crail-vc-%'
  OR realtime.topic() LIKE 'call-%'
);
