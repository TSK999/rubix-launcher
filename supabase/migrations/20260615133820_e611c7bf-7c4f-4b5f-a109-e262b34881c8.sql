
-- LFG posts
CREATE TABLE public.lfg_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_title text NOT NULL,
  game_cover text,
  slots_total int NOT NULL DEFAULT 2 CHECK (slots_total BETWEEN 2 AND 32),
  mode text NOT NULL DEFAULT 'casual',
  notes text,
  mic_required boolean NOT NULL DEFAULT false,
  visibility text NOT NULL DEFAULT 'friends',
  community_id uuid REFERENCES public.communities(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '2 hours'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lfg_posts TO authenticated;
GRANT ALL ON public.lfg_posts TO service_role;

ALTER TABLE public.lfg_posts ENABLE ROW LEVEL SECURITY;

-- Validation trigger (use trigger not CHECK because of time-dependent/visibility logic)
CREATE OR REPLACE FUNCTION public.validate_lfg_post()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.mode NOT IN ('casual','ranked','event') THEN
    RAISE EXCEPTION 'invalid mode: %', NEW.mode;
  END IF;
  IF NEW.visibility NOT IN ('public','friends','community') THEN
    RAISE EXCEPTION 'invalid visibility: %', NEW.visibility;
  END IF;
  IF NEW.visibility = 'community' AND NEW.community_id IS NULL THEN
    RAISE EXCEPTION 'community visibility requires community_id';
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_lfg_post
BEFORE INSERT OR UPDATE ON public.lfg_posts
FOR EACH ROW EXECUTE FUNCTION public.validate_lfg_post();

CREATE TRIGGER trg_lfg_posts_updated_at
BEFORE UPDATE ON public.lfg_posts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS policies for lfg_posts
CREATE POLICY "View accessible lfg posts"
ON public.lfg_posts FOR SELECT
TO authenticated
USING (
  host_id = auth.uid()
  OR visibility = 'public'
  OR (visibility = 'friends' AND public.is_friend_of(host_id))
  OR (visibility = 'community' AND community_id IS NOT NULL AND public.is_community_member(community_id, auth.uid()))
);

CREATE POLICY "Host can insert own lfg posts"
ON public.lfg_posts FOR INSERT
TO authenticated
WITH CHECK (
  host_id = auth.uid()
  AND (visibility <> 'community' OR public.is_community_member(community_id, auth.uid()))
);

CREATE POLICY "Host can update own lfg posts"
ON public.lfg_posts FOR UPDATE
TO authenticated
USING (host_id = auth.uid())
WITH CHECK (host_id = auth.uid());

CREATE POLICY "Host can delete own lfg posts"
ON public.lfg_posts FOR DELETE
TO authenticated
USING (host_id = auth.uid());

-- LFG participants
CREATE TABLE public.lfg_participants (
  post_id uuid NOT NULL REFERENCES public.lfg_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.lfg_participants TO authenticated;
GRANT ALL ON public.lfg_participants TO service_role;

ALTER TABLE public.lfg_participants ENABLE ROW LEVEL SECURITY;

-- Helper: can current user see this post (mirrors lfg_posts SELECT policy)
CREATE OR REPLACE FUNCTION public.can_view_lfg_post(_post_id uuid, _uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.lfg_posts p
    WHERE p.id = _post_id
      AND (
        p.host_id = _uid
        OR p.visibility = 'public'
        OR (p.visibility = 'friends' AND public.are_rubix_friends(p.host_id, _uid))
        OR (p.visibility = 'community' AND p.community_id IS NOT NULL
            AND public.is_community_member(p.community_id, _uid))
      )
  );
$$;

CREATE POLICY "View participants of visible posts"
ON public.lfg_participants FOR SELECT
TO authenticated
USING (public.can_view_lfg_post(post_id, auth.uid()));

CREATE POLICY "Join visible posts"
ON public.lfg_participants FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND public.can_view_lfg_post(post_id, auth.uid())
);

CREATE POLICY "Leave own participation"
ON public.lfg_participants FOR DELETE
TO authenticated
USING (
  user_id = auth.uid()
  OR EXISTS (SELECT 1 FROM public.lfg_posts p WHERE p.id = post_id AND p.host_id = auth.uid())
);

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.lfg_posts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.lfg_participants;
