
CREATE TABLE public.user_presence (
  user_id uuid PRIMARY KEY,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz NOT NULL DEFAULT now(),
  game text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_presence_last_seen ON public.user_presence (last_seen_at DESC);

ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read presence"
  ON public.user_presence FOR SELECT TO authenticated USING (true);

CREATE POLICY "Self upsert presence insert"
  ON public.user_presence FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Self upsert presence update"
  ON public.user_presence FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Self delete presence"
  ON public.user_presence FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER update_user_presence_updated_at
  BEFORE UPDATE ON public.user_presence
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.user_presence REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.user_presence;
