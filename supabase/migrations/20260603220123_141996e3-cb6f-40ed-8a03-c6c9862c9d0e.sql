-- Catalog of stamps that can be earned
CREATE TABLE public.passport_stamps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL,
  icon_emoji text NOT NULL DEFAULT '⭐',
  rarity text NOT NULL DEFAULT 'common',
  criteria_type text NOT NULL,
  criteria_value integer NOT NULL DEFAULT 1,
  game_key text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.passport_stamps TO authenticated;
GRANT ALL ON public.passport_stamps TO service_role;
ALTER TABLE public.passport_stamps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone signed in can view stamps"
  ON public.passport_stamps FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admins manage stamps insert"
  ON public.passport_stamps FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage stamps update"
  ON public.passport_stamps FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins manage stamps delete"
  ON public.passport_stamps FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Validation: keep rarity + criteria_type sane
CREATE OR REPLACE FUNCTION public.validate_passport_stamp()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.rarity NOT IN ('common','rare','epic','legendary') THEN
    RAISE EXCEPTION 'invalid rarity: %', NEW.rarity;
  END IF;
  IF NEW.criteria_type NOT IN (
    'first_launch','playtime_hours','launches_count',
    'games_owned','friends_added','signup','manual'
  ) THEN
    RAISE EXCEPTION 'invalid criteria_type: %', NEW.criteria_type;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_passport_stamp
  BEFORE INSERT OR UPDATE ON public.passport_stamps
  FOR EACH ROW EXECUTE FUNCTION public.validate_passport_stamp();

-- Stamps a user has earned
CREATE TABLE public.user_passport_stamps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  stamp_id uuid NOT NULL REFERENCES public.passport_stamps(id) ON DELETE CASCADE,
  game_key text,
  earned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, stamp_id, game_key)
);

GRANT SELECT, INSERT, DELETE ON public.user_passport_stamps TO authenticated;
GRANT ALL ON public.user_passport_stamps TO service_role;
ALTER TABLE public.user_passport_stamps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own earned stamps"
  ON public.user_passport_stamps FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own earned stamps"
  ON public.user_passport_stamps FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own earned stamps"
  ON public.user_passport_stamps FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_passport_stamps_user ON public.user_passport_stamps(user_id);

-- Per-user, per-game playtime tracking (the data stamps are evaluated against)
CREATE TABLE public.user_game_playtime (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_key text NOT NULL,
  title_snapshot text,
  total_seconds integer NOT NULL DEFAULT 0,
  launch_count integer NOT NULL DEFAULT 0,
  longest_session_seconds integer NOT NULL DEFAULT 0,
  first_launched_at timestamptz NOT NULL DEFAULT now(),
  last_launched_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_key)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_game_playtime TO authenticated;
GRANT ALL ON public.user_game_playtime TO service_role;
ALTER TABLE public.user_game_playtime ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own playtime"
  ON public.user_game_playtime FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own playtime"
  ON public.user_game_playtime FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own playtime"
  ON public.user_game_playtime FOR UPDATE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users delete own playtime"
  ON public.user_game_playtime FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_user_game_playtime_user ON public.user_game_playtime(user_id);

CREATE TRIGGER trg_user_game_playtime_updated
  BEFORE UPDATE ON public.user_game_playtime
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed global stamps
INSERT INTO public.passport_stamps (code, name, description, icon_emoji, rarity, criteria_type, criteria_value, sort_order) VALUES
  ('welcome',         'Welcome to RUBIX',  'Joined the launcher.',                                  '🎟️', 'common',    'signup',          1, 0),
  ('first_launch',    'Maiden Voyage',     'Launched your first game.',                             '🚀', 'common',    'first_launch',    1, 10),
  ('night_owl',       'Night Owl',         'Played a game past midnight.',                          '🦉', 'rare',      'manual',          1, 20),
  ('marathon',        'Marathon',          'Played for 4 hours in a single session.',               '🏃', 'rare',      'manual',          1, 30),
  ('dedicated_10',    'Dedicated',         'Reached 10 hours in a single game.',                    '🎯', 'rare',      'playtime_hours', 10, 40),
  ('obsessed_50',     'Obsessed',          'Reached 50 hours in a single game.',                    '🔥', 'epic',      'playtime_hours', 50, 50),
  ('legend_100',      'Legend',            'Reached 100 hours in a single game.',                   '👑', 'legendary', 'playtime_hours',100, 60),
  ('collector_5',     'Collector',         'Owns 5 games on RUBIX.',                                '📚', 'common',    'games_owned',     5, 70),
  ('collector_25',    'Curator',           'Owns 25 games on RUBIX.',                               '🏛️', 'epic',      'games_owned',    25, 80),
  ('social_1',        'Plus One',          'Made your first RUBIX friend.',                         '🤝', 'common',    'friends_added',   1, 90),
  ('social_10',       'Squad Up',          'Made 10 RUBIX friends.',                                '👥', 'rare',      'friends_added',  10,100),
  ('loyalist_25',     'Loyalist',          'Launched the same game 25 times.',                      '🎖️', 'epic',      'launches_count', 25,110);