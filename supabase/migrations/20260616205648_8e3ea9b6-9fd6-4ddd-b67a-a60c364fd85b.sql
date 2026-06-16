
-- helper: random share code generator
CREATE OR REPLACE FUNCTION public.gen_modpack_code()
RETURNS text
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  alphabet text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  result text := '';
  i int;
BEGIN
  FOR i IN 1..8 LOOP
    result := result || substr(alphabet, 1 + floor(random()*length(alphabet))::int, 1);
  END LOOP;
  RETURN result;
END $$;

-- modpacks
CREATE TABLE public.modpacks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_slug text NOT NULL,
  name text NOT NULL,
  description text,
  share_code text NOT NULL UNIQUE,
  is_public boolean NOT NULL DEFAULT false,
  download_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX modpacks_user_game_idx ON public.modpacks(user_id, game_slug);
CREATE INDEX modpacks_share_code_idx ON public.modpacks(share_code);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modpacks TO authenticated;
GRANT ALL ON public.modpacks TO service_role;

ALTER TABLE public.modpacks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modpacks_owner_select" ON public.modpacks FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR is_public = true);
CREATE POLICY "modpacks_owner_insert" ON public.modpacks FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY "modpacks_owner_update" ON public.modpacks FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "modpacks_owner_delete" ON public.modpacks FOR DELETE TO authenticated
  USING (user_id = auth.uid());

CREATE TRIGGER update_modpacks_updated_at BEFORE UPDATE ON public.modpacks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- modpack_mods
CREATE TABLE public.modpack_mods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  modpack_id uuid NOT NULL REFERENCES public.modpacks(id) ON DELETE CASCADE,
  mod_source text NOT NULL,
  mod_id text NOT NULL,
  mod_name text NOT NULL,
  version text,
  enabled boolean NOT NULL DEFAULT true,
  position integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX modpack_mods_modpack_idx ON public.modpack_mods(modpack_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.modpack_mods TO authenticated;
GRANT ALL ON public.modpack_mods TO service_role;

ALTER TABLE public.modpack_mods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "modpack_mods_select" ON public.modpack_mods FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modpacks m
    WHERE m.id = modpack_id AND (m.user_id = auth.uid() OR m.is_public = true)
  ));
CREATE POLICY "modpack_mods_insert" ON public.modpack_mods FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.modpacks m WHERE m.id = modpack_id AND m.user_id = auth.uid()
  ));
CREATE POLICY "modpack_mods_update" ON public.modpack_mods FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modpacks m WHERE m.id = modpack_id AND m.user_id = auth.uid()
  ));
CREATE POLICY "modpack_mods_delete" ON public.modpack_mods FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.modpacks m WHERE m.id = modpack_id AND m.user_id = auth.uid()
  ));

-- installed_mods
CREATE TABLE public.installed_mods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_slug text NOT NULL,
  mod_source text NOT NULL,
  mod_id text NOT NULL,
  mod_name text NOT NULL,
  version text,
  install_path text,
  installed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_slug, mod_source, mod_id)
);
CREATE INDEX installed_mods_user_game_idx ON public.installed_mods(user_id, game_slug);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.installed_mods TO authenticated;
GRANT ALL ON public.installed_mods TO service_role;

ALTER TABLE public.installed_mods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "installed_mods_owner_all" ON public.installed_mods FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- game_launch_prefs
CREATE TABLE public.game_launch_prefs (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  game_id uuid NOT NULL,
  last_mode text NOT NULL DEFAULT 'vanilla',
  active_modpack_id uuid REFERENCES public.modpacks(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, game_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.game_launch_prefs TO authenticated;
GRANT ALL ON public.game_launch_prefs TO service_role;

ALTER TABLE public.game_launch_prefs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "launch_prefs_owner_all" ON public.game_launch_prefs FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER update_launch_prefs_updated_at BEFORE UPDATE ON public.game_launch_prefs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- mode validation trigger
CREATE OR REPLACE FUNCTION public.validate_launch_mode()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.last_mode NOT IN ('vanilla','modded') THEN
    RAISE EXCEPTION 'invalid last_mode: %', NEW.last_mode;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER validate_launch_mode_trg BEFORE INSERT OR UPDATE ON public.game_launch_prefs
  FOR EACH ROW EXECUTE FUNCTION public.validate_launch_mode();

-- auto-generate share code if missing
CREATE OR REPLACE FUNCTION public.set_modpack_share_code()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  _code text;
  _tries int := 0;
BEGIN
  IF NEW.share_code IS NULL OR NEW.share_code = '' THEN
    LOOP
      _code := public.gen_modpack_code();
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.modpacks WHERE share_code = _code);
      _tries := _tries + 1;
      IF _tries > 10 THEN RAISE EXCEPTION 'Could not generate share code'; END IF;
    END LOOP;
    NEW.share_code := _code;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER set_modpack_share_code_trg BEFORE INSERT ON public.modpacks
  FOR EACH ROW EXECUTE FUNCTION public.set_modpack_share_code();

-- redeem
CREATE OR REPLACE FUNCTION public.redeem_modpack_code(_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _src public.modpacks%ROWTYPE;
  _new_id uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _src FROM public.modpacks WHERE share_code = upper(trim(_code));
  IF _src.id IS NULL THEN RAISE EXCEPTION 'Invalid share code'; END IF;

  INSERT INTO public.modpacks(user_id, game_slug, name, description, is_public)
  VALUES (_me, _src.game_slug, _src.name || ' (imported)', _src.description, false)
  RETURNING id INTO _new_id;

  INSERT INTO public.modpack_mods(modpack_id, mod_source, mod_id, mod_name, version, enabled, position)
  SELECT _new_id, mod_source, mod_id, mod_name, version, enabled, position
  FROM public.modpack_mods WHERE modpack_id = _src.id;

  UPDATE public.modpacks SET download_count = download_count + 1 WHERE id = _src.id;

  RETURN _new_id;
END $$;
