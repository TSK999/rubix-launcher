
-- Per-user, per-game notes & tags
CREATE TABLE public.game_user_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  game_key TEXT NOT NULL,
  title_snapshot TEXT,
  source TEXT,
  notes TEXT NOT NULL DEFAULT '',
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_key)
);
CREATE INDEX idx_game_user_data_user ON public.game_user_data(user_id);
CREATE INDEX idx_game_user_data_tags ON public.game_user_data USING GIN(tags);

ALTER TABLE public.game_user_data ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own game data" ON public.game_user_data FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner inserts own game data" ON public.game_user_data FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner updates own game data" ON public.game_user_data FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner deletes own game data" ON public.game_user_data FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_game_user_data_updated_at
BEFORE UPDATE ON public.game_user_data
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Per-user screenshot gallery
CREATE TABLE public.game_screenshots_user (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  game_key TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  width INTEGER,
  height INTEGER,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_game_screenshots_user_lookup ON public.game_screenshots_user(user_id, game_key, taken_at DESC);

ALTER TABLE public.game_screenshots_user ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner reads own shots" ON public.game_screenshots_user FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner inserts own shots" ON public.game_screenshots_user FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Owner updates own shots" ON public.game_screenshots_user FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Owner deletes own shots" ON public.game_screenshots_user FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Private storage bucket for user screenshots
INSERT INTO storage.buckets (id, name, public) VALUES ('game-screenshots', 'game-screenshots', false);

CREATE POLICY "Owner reads own screenshot files"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'game-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner uploads own screenshot files"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'game-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner updates own screenshot files"
ON storage.objects FOR UPDATE TO authenticated
USING (bucket_id = 'game-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owner deletes own screenshot files"
ON storage.objects FOR DELETE TO authenticated
USING (bucket_id = 'game-screenshots' AND auth.uid()::text = (storage.foldername(name))[1]);
