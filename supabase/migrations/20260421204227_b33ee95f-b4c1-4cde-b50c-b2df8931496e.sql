-- Profile fields
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS background_url text,
  ADD COLUMN IF NOT EXISTS background_kind text,
  ADD COLUMN IF NOT EXISTS privacy text NOT NULL DEFAULT 'public';

-- Validate enums via trigger (avoids immutable CHECK issues)
CREATE OR REPLACE FUNCTION public.validate_profile_fields()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.privacy NOT IN ('public','friends','private') THEN
    RAISE EXCEPTION 'invalid privacy value: %', NEW.privacy;
  END IF;
  IF NEW.background_kind IS NOT NULL AND NEW.background_kind NOT IN ('image','gif','video') THEN
    RAISE EXCEPTION 'invalid background_kind value: %', NEW.background_kind;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS profiles_validate_fields ON public.profiles;
CREATE TRIGGER profiles_validate_fields
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.validate_profile_fields();

CREATE INDEX IF NOT EXISTS profiles_username_lower_idx ON public.profiles (lower(username));

-- Rubix friendships
CREATE TABLE IF NOT EXISTS public.rubix_friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL,
  user_b uuid NOT NULL,
  requested_by uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rubix_friendships_pair_order CHECK (user_a < user_b),
  CONSTRAINT rubix_friendships_pair_unique UNIQUE (user_a, user_b)
);

CREATE OR REPLACE FUNCTION public.validate_friendship()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.status NOT IN ('pending','accepted','blocked') THEN
    RAISE EXCEPTION 'invalid friendship status: %', NEW.status;
  END IF;
  IF NEW.requested_by <> NEW.user_a AND NEW.requested_by <> NEW.user_b THEN
    RAISE EXCEPTION 'requested_by must be one of the pair';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS rubix_friendships_validate ON public.rubix_friendships;
CREATE TRIGGER rubix_friendships_validate
BEFORE INSERT OR UPDATE ON public.rubix_friendships
FOR EACH ROW EXECUTE FUNCTION public.validate_friendship();

DROP TRIGGER IF EXISTS rubix_friendships_updated_at ON public.rubix_friendships;
CREATE TRIGGER rubix_friendships_updated_at
BEFORE UPDATE ON public.rubix_friendships
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.rubix_friendships ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view own friendships"
ON public.rubix_friendships FOR SELECT
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Members create friendships involving self"
ON public.rubix_friendships FOR INSERT
TO authenticated
WITH CHECK ((auth.uid() = user_a OR auth.uid() = user_b) AND auth.uid() = requested_by);

CREATE POLICY "Members update own friendships"
ON public.rubix_friendships FOR UPDATE
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE POLICY "Members delete own friendships"
ON public.rubix_friendships FOR DELETE
TO authenticated
USING (auth.uid() = user_a OR auth.uid() = user_b);

CREATE OR REPLACE FUNCTION public.are_rubix_friends(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.rubix_friendships
    WHERE status = 'accepted'
      AND ((user_a = LEAST(_a,_b) AND user_b = GREATEST(_a,_b)))
  );
$$;

-- Storage bucket for profile backgrounds (public read, owner-only write)
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-backgrounds', 'profile-backgrounds', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Profile backgrounds public read"
ON storage.objects FOR SELECT
USING (bucket_id = 'profile-backgrounds');

CREATE POLICY "Users upload own background"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'profile-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users update own background"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'profile-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users delete own background"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'profile-backgrounds' AND auth.uid()::text = (storage.foldername(name))[1]);