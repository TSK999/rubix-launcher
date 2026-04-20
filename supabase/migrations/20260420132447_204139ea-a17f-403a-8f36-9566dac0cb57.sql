-- Table for per-user Spotify OAuth connections
CREATE TABLE public.spotify_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  spotify_id TEXT NOT NULL,
  spotify_username TEXT,
  display_name TEXT,
  avatar_url TEXT,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  scope TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_spotify_connections_user_id ON public.spotify_connections(user_id);

ALTER TABLE public.spotify_connections ENABLE ROW LEVEL SECURITY;

-- Public can see WHO has linked Spotify (used for friend badges) but NOT tokens.
-- We expose a public view that excludes token columns; the table itself is owner-only.
CREATE POLICY "Owner can read own connection"
ON public.spotify_connections
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Owner can insert own connection"
ON public.spotify_connections
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can update own connection"
ON public.spotify_connections
FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Owner can delete own connection"
ON public.spotify_connections
FOR DELETE
TO authenticated
USING (auth.uid() = user_id);

-- Public-safe view (no tokens) so anyone can see which friends have Spotify linked
CREATE VIEW public.spotify_public_profiles
WITH (security_invoker = true)
AS
SELECT
  user_id,
  spotify_id,
  spotify_username,
  display_name,
  avatar_url,
  updated_at
FROM public.spotify_connections;

GRANT SELECT ON public.spotify_public_profiles TO anon, authenticated;

-- Allow public SELECT on the view by adding a public-readable policy on a non-token column subset.
-- Since RLS only applies to the table, we add a permissive SELECT policy that exposes only via the view path.
-- The view uses security_invoker so we need policy access. Add a public-read policy but the view excludes tokens.
CREATE POLICY "Public can see linked status"
ON public.spotify_connections
FOR SELECT
TO anon, authenticated
USING (true);

-- Drop the owner-only SELECT since the public one supersedes; tokens are still safe because the view excludes them
-- and direct table reads of tokens require the user (frontend uses anon key with RLS).
-- Actually we need owner-only access to tokens. Replace strategy: keep restrictive by removing public policy and
-- instead grant the view to public via SECURITY DEFINER function for friend lookups.
DROP POLICY "Public can see linked status" ON public.spotify_connections;
DROP VIEW public.spotify_public_profiles;

-- Better approach: SECURITY DEFINER function returning safe columns
CREATE OR REPLACE FUNCTION public.get_spotify_linked_users(_user_ids UUID[])
RETURNS TABLE (
  user_id UUID,
  spotify_id TEXT,
  spotify_username TEXT,
  display_name TEXT,
  avatar_url TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id, spotify_id, spotify_username, display_name, avatar_url
  FROM public.spotify_connections
  WHERE user_id = ANY(_user_ids);
$$;

GRANT EXECUTE ON FUNCTION public.get_spotify_linked_users(UUID[]) TO anon, authenticated;

-- Auto-update updated_at
CREATE TRIGGER update_spotify_connections_updated_at
BEFORE UPDATE ON public.spotify_connections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();