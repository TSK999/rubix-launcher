
CREATE TABLE public.game_clips_user (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  game_key TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  caption TEXT,
  duration_seconds INTEGER,
  width INTEGER,
  height INTEGER,
  size_bytes BIGINT,
  taken_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_game_clips_user_user_game ON public.game_clips_user(user_id, game_key, taken_at DESC);

ALTER TABLE public.game_clips_user ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own clips" ON public.game_clips_user
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own clips" ON public.game_clips_user
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users update own clips" ON public.game_clips_user
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users delete own clips" ON public.game_clips_user
  FOR DELETE USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('game-clips', 'game-clips', false, 209715200, ARRAY['video/webm','video/mp4'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users read own clip files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'game-clips' AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users upload own clip files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'game-clips' AND auth.uid()::text = (storage.foldername(name))[1]
  );
CREATE POLICY "Users delete own clip files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'game-clips' AND auth.uid()::text = (storage.foldername(name))[1]
  );
