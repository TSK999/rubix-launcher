ALTER TABLE public.call_participants
  ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_call_participants_active_seen
  ON public.call_participants (call_id, last_seen_at)
  WHERE left_at IS NULL;