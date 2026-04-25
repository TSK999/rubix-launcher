
-- =========================================================
-- 1. ROLES SYSTEM
-- =========================================================
CREATE TYPE public.app_role AS ENUM ('user', 'developer', 'admin');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  );
$$;

CREATE POLICY "Users view own roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles insert"
  ON public.user_roles FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles update"
  ON public.user_roles FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins manage roles delete"
  ON public.user_roles FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Auto-grant default 'user' role + admin for hardcoded email
CREATE OR REPLACE FUNCTION public.handle_new_user_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  IF lower(NEW.email) = 'ganr09805@gmail.com' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_role
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_role();

-- Backfill: give existing users the default user role + admin if matching email
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'user'::public.app_role FROM auth.users
ON CONFLICT DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'admin'::public.app_role FROM auth.users
WHERE lower(email) = 'ganr09805@gmail.com'
ON CONFLICT DO NOTHING;

-- =========================================================
-- 2. DEVELOPER APPLICATIONS
-- =========================================================
CREATE TABLE public.developer_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  company_name text NOT NULL,
  full_name text NOT NULL,
  contact_email text NOT NULL,
  website text,
  description text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.validate_dev_app_status()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending','approved','rejected') THEN
    RAISE EXCEPTION 'invalid status: %', NEW.status;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_dev_app_status
  BEFORE INSERT OR UPDATE ON public.developer_applications
  FOR EACH ROW EXECUTE FUNCTION public.validate_dev_app_status();

CREATE TRIGGER trg_dev_app_updated
  BEFORE UPDATE ON public.developer_applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.developer_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own application"
  ON public.developer_applications FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create own application"
  ON public.developer_applications FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Users update own pending application"
  ON public.developer_applications FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND status = 'pending');

CREATE POLICY "Admins update any application"
  ON public.developer_applications FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- On approval, grant developer role
CREATE OR REPLACE FUNCTION public.grant_developer_on_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'approved' AND (OLD.status IS DISTINCT FROM 'approved') THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.user_id, 'developer')
    ON CONFLICT DO NOTHING;
    NEW.reviewed_at = now();
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_grant_developer
  BEFORE UPDATE ON public.developer_applications
  FOR EACH ROW EXECUTE FUNCTION public.grant_developer_on_approval();

-- =========================================================
-- 3. GAMES
-- =========================================================
CREATE TABLE public.games (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  developer_id uuid NOT NULL,
  title text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text NOT NULL DEFAULT '',
  price_cents integer NOT NULL DEFAULT 0,
  age_rating text NOT NULL DEFAULT 'E',
  cover_url text,
  status text NOT NULL DEFAULT 'draft',
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_games_status ON public.games(status);
CREATE INDEX idx_games_developer ON public.games(developer_id);

CREATE OR REPLACE FUNCTION public.validate_game_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('draft','pending','approved','rejected') THEN
    RAISE EXCEPTION 'invalid status: %', NEW.status;
  END IF;
  IF NEW.price_cents < 0 THEN
    RAISE EXCEPTION 'price must be >= 0';
  END IF;
  IF NEW.age_rating NOT IN ('E','E10','T','M','A') THEN
    RAISE EXCEPTION 'invalid age rating: %', NEW.age_rating;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_game
  BEFORE INSERT OR UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.validate_game_fields();

CREATE TRIGGER trg_games_updated
  BEFORE UPDATE ON public.games
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public reads approved games"
  ON public.games FOR SELECT
  TO anon, authenticated
  USING (status = 'approved' OR developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Devs create own games"
  ON public.games FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = developer_id
    AND public.has_role(auth.uid(), 'developer')
  );

CREATE POLICY "Devs update own games"
  ON public.games FOR UPDATE
  TO authenticated
  USING (auth.uid() = developer_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Devs delete own games"
  ON public.games FOR DELETE
  TO authenticated
  USING (auth.uid() = developer_id OR public.has_role(auth.uid(), 'admin'));

-- =========================================================
-- 4. SCREENSHOTS
-- =========================================================
CREATE TABLE public.game_screenshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  url text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_screenshots_game ON public.game_screenshots(game_id);
ALTER TABLE public.game_screenshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read screenshots if game readable"
  ON public.game_screenshots FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = game_id
      AND (g.status = 'approved' OR g.developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Devs manage own screenshots insert"
  ON public.game_screenshots FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = game_id AND g.developer_id = auth.uid()
  ));

CREATE POLICY "Devs manage own screenshots update"
  ON public.game_screenshots FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = game_id AND (g.developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Devs manage own screenshots delete"
  ON public.game_screenshots FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = game_id AND (g.developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

-- =========================================================
-- 5. REQUIREMENTS
-- =========================================================
CREATE TABLE public.game_requirements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  type text NOT NULL,
  os text,
  cpu text,
  gpu text,
  ram_gb integer,
  storage_gb integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reqs_game ON public.game_requirements(game_id);

CREATE OR REPLACE FUNCTION public.validate_req_type()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.type NOT IN ('minimum','recommended') THEN
    RAISE EXCEPTION 'invalid type: %', NEW.type;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER trg_validate_req
  BEFORE INSERT OR UPDATE ON public.game_requirements
  FOR EACH ROW EXECUTE FUNCTION public.validate_req_type();

ALTER TABLE public.game_requirements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read requirements if game readable"
  ON public.game_requirements FOR SELECT
  TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g
    WHERE g.id = game_id
      AND (g.status = 'approved' OR g.developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Devs manage requirements insert"
  ON public.game_requirements FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.games g WHERE g.id = game_id AND g.developer_id = auth.uid()
  ));

CREATE POLICY "Devs manage requirements update"
  ON public.game_requirements FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g WHERE g.id = game_id AND (g.developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Devs manage requirements delete"
  ON public.game_requirements FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g WHERE g.id = game_id AND (g.developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

-- =========================================================
-- 6. ORDERS (mock checkout)
-- =========================================================
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  price_cents integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'completed',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, game_id)
);

CREATE INDEX idx_orders_user ON public.orders(user_id);
CREATE INDEX idx_orders_game ON public.orders(game_id);

ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view own orders"
  ON public.orders FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users create own orders"
  ON public.orders FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND g.status = 'approved')
  );

-- helper
CREATE OR REPLACE FUNCTION public.user_owns_game(_user uuid, _game uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.orders
    WHERE user_id = _user AND game_id = _game AND status = 'completed'
  );
$$;

-- =========================================================
-- 7. BUILDS
-- =========================================================
CREATE TABLE public.game_builds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id uuid NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  platform text NOT NULL DEFAULT 'windows',
  version text NOT NULL DEFAULT '1.0.0',
  file_path text,
  external_url text,
  file_size bigint,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_builds_game ON public.game_builds(game_id);

ALTER TABLE public.game_builds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners and admins read builds"
  ON public.game_builds FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    OR EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND g.developer_id = auth.uid())
    OR public.user_owns_game(auth.uid(), game_id)
  );

CREATE POLICY "Devs insert builds"
  ON public.game_builds FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.games g WHERE g.id = game_id AND g.developer_id = auth.uid()
  ));

CREATE POLICY "Devs update builds"
  ON public.game_builds FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g WHERE g.id = game_id AND (g.developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

CREATE POLICY "Devs delete builds"
  ON public.game_builds FOR DELETE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.games g WHERE g.id = game_id AND (g.developer_id = auth.uid() OR public.has_role(auth.uid(), 'admin'))
  ));

-- =========================================================
-- 8. STORAGE BUCKETS
-- =========================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('game-media', 'game-media', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('game-builds', 'game-builds', false)
ON CONFLICT (id) DO NOTHING;

-- game-media policies (public read, dev-owned write)
CREATE POLICY "Public reads game-media"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'game-media');

CREATE POLICY "Devs upload game-media"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'game-media'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_role(auth.uid(), 'developer')
  );

CREATE POLICY "Devs update own game-media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'game-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Devs delete own game-media"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'game-media' AND auth.uid()::text = (storage.foldername(name))[1]);

-- game-builds policies (private)
CREATE POLICY "Devs upload game-builds"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'game-builds'
    AND auth.uid()::text = (storage.foldername(name))[1]
    AND public.has_role(auth.uid(), 'developer')
  );

CREATE POLICY "Devs update own game-builds"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'game-builds' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Devs delete own game-builds"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'game-builds' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Owners read game-builds"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'game-builds'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR public.has_role(auth.uid(), 'admin')
      OR EXISTS (
        SELECT 1
        FROM public.game_builds gb
        JOIN public.orders o ON o.game_id = gb.game_id
        WHERE gb.file_path = storage.objects.name
          AND o.user_id = auth.uid()
          AND o.status = 'completed'
      )
    )
  );
