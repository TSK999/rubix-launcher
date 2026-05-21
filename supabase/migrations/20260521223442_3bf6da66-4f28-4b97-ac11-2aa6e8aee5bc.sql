
-- Slug generator (8 chars URL-safe)
CREATE OR REPLACE FUNCTION public.gen_clip_slug()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  alphabet text := 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..10 LOOP
    result := result || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
  END LOOP;
  RETURN result;
END $$;

-- shared_clips
CREATE TABLE public.shared_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  source_clip_id uuid,
  share_slug text NOT NULL UNIQUE DEFAULT public.gen_clip_slug(),
  title text NOT NULL DEFAULT 'Untitled clip',
  game_key text,
  game_title text,
  original_path text,
  stream_path text,
  thumbnail_path text,
  duration_seconds integer,
  size_bytes bigint,
  width integer,
  height integer,
  mime_type text,
  visibility text NOT NULL DEFAULT 'unlisted',
  processing_status text NOT NULL DEFAULT 'pending',
  view_count integer NOT NULL DEFAULT 0,
  share_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shared_clips_user_idx ON public.shared_clips(user_id, created_at DESC);
CREATE INDEX shared_clips_visibility_idx ON public.shared_clips(visibility, created_at DESC);

CREATE OR REPLACE FUNCTION public.validate_shared_clip()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.visibility NOT IN ('public','unlisted','private') THEN
    RAISE EXCEPTION 'invalid visibility: %', NEW.visibility;
  END IF;
  IF NEW.processing_status NOT IN ('pending','ready','failed') THEN
    RAISE EXCEPTION 'invalid processing_status: %', NEW.processing_status;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_validate_shared_clip
BEFORE INSERT OR UPDATE ON public.shared_clips
FOR EACH ROW EXECUTE FUNCTION public.validate_shared_clip();

CREATE TRIGGER trg_shared_clips_updated
BEFORE UPDATE ON public.shared_clips
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.shared_clips ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View non-private shared clips"
ON public.shared_clips FOR SELECT
USING (visibility <> 'private' OR auth.uid() = user_id);

CREATE POLICY "Owner inserts shared clip"
ON public.shared_clips FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner updates shared clip"
ON public.shared_clips FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Owner deletes shared clip"
ON public.shared_clips FOR DELETE
USING (auth.uid() = user_id);

-- Helper
CREATE OR REPLACE FUNCTION public.shared_clip_viewable(_clip_id uuid, _uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.shared_clips
    WHERE id = _clip_id AND (visibility <> 'private' OR user_id = _uid)
  );
$$;

-- clip_reactions
CREATE TABLE public.clip_reactions (
  clip_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clip_id, user_id, emoji)
);
ALTER TABLE public.clip_reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View reactions on viewable clips"
ON public.clip_reactions FOR SELECT
USING (public.shared_clip_viewable(clip_id, auth.uid()));
CREATE POLICY "Add own reaction"
ON public.clip_reactions FOR INSERT
WITH CHECK (auth.uid() = user_id AND public.shared_clip_viewable(clip_id, auth.uid()));
CREATE POLICY "Remove own reaction"
ON public.clip_reactions FOR DELETE
USING (auth.uid() = user_id);

-- clip_comments
CREATE TABLE public.clip_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX clip_comments_clip_idx ON public.clip_comments(clip_id, created_at);
ALTER TABLE public.clip_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View comments on viewable clips"
ON public.clip_comments FOR SELECT
USING (public.shared_clip_viewable(clip_id, auth.uid()));
CREATE POLICY "Add own comment"
ON public.clip_comments FOR INSERT
WITH CHECK (auth.uid() = user_id AND public.shared_clip_viewable(clip_id, auth.uid()));
CREATE POLICY "Delete own comment"
ON public.clip_comments FOR DELETE
USING (auth.uid() = user_id);

-- clip_views
CREATE TABLE public.clip_views (
  clip_id uuid NOT NULL,
  user_id uuid,
  viewed_on date NOT NULL DEFAULT (now()::date),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (clip_id, user_id, viewed_on)
);
ALTER TABLE public.clip_views ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Insert view on viewable clip"
ON public.clip_views FOR INSERT
WITH CHECK (auth.uid() = user_id AND public.shared_clip_viewable(clip_id, auth.uid()));
CREATE POLICY "View own views"
ON public.clip_views FOR SELECT
USING (auth.uid() = user_id);

-- clip_reports
CREATE TABLE public.clip_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clip_id uuid NOT NULL,
  reporter_id uuid NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clip_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated can report"
ON public.clip_reports FOR INSERT
WITH CHECK (auth.uid() = reporter_id);
CREATE POLICY "Reporter sees own reports"
ON public.clip_reports FOR SELECT
USING (auth.uid() = reporter_id);

-- Public bucket for shared clip streaming + thumbnails
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('shared-clips', 'shared-clips', true, 524288000,
  ARRAY['video/mp4','video/webm','video/x-matroska','video/quicktime','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read shared-clips"
ON storage.objects FOR SELECT
USING (bucket_id = 'shared-clips');

CREATE POLICY "Owner uploads shared-clips"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'shared-clips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner updates shared-clips"
ON storage.objects FOR UPDATE
USING (bucket_id = 'shared-clips' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner deletes shared-clips"
ON storage.objects FOR DELETE
USING (bucket_id = 'shared-clips' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Increment view counter (security definer to bypass RLS for counter)
CREATE OR REPLACE FUNCTION public.increment_clip_view(_clip_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  IF NOT public.shared_clip_viewable(_clip_id, _uid) THEN RETURN; END IF;

  INSERT INTO public.clip_views(clip_id, user_id, viewed_on)
  VALUES (_clip_id, _uid, now()::date)
  ON CONFLICT DO NOTHING;

  IF FOUND THEN
    UPDATE public.shared_clips SET view_count = view_count + 1 WHERE id = _clip_id;
  END IF;
END $$;

-- Increment share counter
CREATE OR REPLACE FUNCTION public.increment_clip_share(_clip_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN; END IF;
  IF NOT public.shared_clip_viewable(_clip_id, auth.uid()) THEN RETURN; END IF;
  UPDATE public.shared_clips SET share_count = share_count + 1 WHERE id = _clip_id;
END $$;
