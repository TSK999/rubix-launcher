
-- 1) communities: hide invite_code column from non-admins via column GRANTs
REVOKE SELECT ON public.communities FROM authenticated;
REVOKE SELECT ON public.communities FROM anon;
GRANT SELECT (id, name, icon_url, banner_url, owner_id, created_at, updated_at)
  ON public.communities TO authenticated;
-- service role retains full access
GRANT ALL ON public.communities TO service_role;

-- 2) orders: drop insert policy, add server-validated RPC
DROP POLICY IF EXISTS "Users create own orders" ON public.orders;

CREATE OR REPLACE FUNCTION public.create_order(_game_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _price int;
  _status text;
  _order_id uuid;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT price_cents, status INTO _price, _status
  FROM public.games WHERE id = _game_id;

  IF _price IS NULL THEN RAISE EXCEPTION 'Game not found'; END IF;
  IF _status <> 'approved' THEN RAISE EXCEPTION 'Game not available'; END IF;

  -- For paid games, real payment integration is required server-side.
  -- Reject self-checkout for non-free games until payment is wired in.
  IF _price > 0 THEN
    RAISE EXCEPTION 'Paid checkout must go through the payment provider';
  END IF;

  -- Avoid duplicates
  SELECT id INTO _order_id FROM public.orders
   WHERE user_id = _me AND game_id = _game_id AND status = 'completed' LIMIT 1;
  IF _order_id IS NOT NULL THEN RETURN _order_id; END IF;

  INSERT INTO public.orders(user_id, game_id, price_cents, status)
  VALUES (_me, _game_id, _price, 'completed')
  RETURNING id INTO _order_id;

  RETURN _order_id;
END $$;

REVOKE ALL ON FUNCTION public.create_order(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order(uuid) TO authenticated;

-- 3) user_passport_stamps: drop self-insert policy, add server-validated RPC
DROP POLICY IF EXISTS "Users insert own earned stamps" ON public.user_passport_stamps;

CREATE OR REPLACE FUNCTION public.claim_passport_stamp(
  _stamp_id uuid,
  _game_key text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _me uuid := auth.uid();
  _stamp public.passport_stamps%ROWTYPE;
  _ok boolean := false;
  _val numeric;
  _effective_key text;
BEGIN
  IF _me IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  SELECT * INTO _stamp FROM public.passport_stamps WHERE id = _stamp_id;
  IF _stamp.id IS NULL THEN RETURN false; END IF;

  _effective_key := COALESCE(_stamp.game_key, _game_key);

  -- Validate criteria server-side from authoritative DB state
  IF _stamp.criteria_type = 'signup' THEN
    _ok := true;
  ELSIF _stamp.criteria_type = 'first_launch' THEN
    _ok := _effective_key IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.user_game_playtime
      WHERE user_id = _me AND game_key = _effective_key);
  ELSIF _stamp.criteria_type = 'playtime_hours' THEN
    SELECT total_seconds INTO _val FROM public.user_game_playtime
      WHERE user_id = _me AND game_key = _effective_key;
    _ok := COALESCE(_val,0) >= _stamp.criteria_value * 3600;
  ELSIF _stamp.criteria_type = 'launches_count' THEN
    SELECT launch_count INTO _val FROM public.user_game_playtime
      WHERE user_id = _me AND game_key = _effective_key;
    _ok := COALESCE(_val,0) >= _stamp.criteria_value;
  ELSIF _stamp.criteria_type = 'games_owned' THEN
    SELECT count(*) INTO _val FROM public.orders
      WHERE user_id = _me AND status = 'completed';
    _ok := _val >= _stamp.criteria_value;
  ELSIF _stamp.criteria_type = 'friends_added' THEN
    SELECT count(*) INTO _val FROM public.rubix_friendships
      WHERE status = 'accepted' AND (user_a = _me OR user_b = _me);
    _ok := _val >= _stamp.criteria_value;
  ELSE
    -- 'source_games' and 'manual' depend on launcher data not visible to the
    -- database and cannot be self-claimed; require a trusted server award.
    _ok := false;
  END IF;

  IF NOT _ok THEN RETURN false; END IF;

  INSERT INTO public.user_passport_stamps(user_id, stamp_id, game_key)
  VALUES (_me, _stamp_id, _effective_key)
  ON CONFLICT DO NOTHING;

  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.claim_passport_stamp(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_passport_stamp(uuid, text) TO authenticated;

-- 4) game_clips_user: prevent ownership reassignment via UPDATE
DROP POLICY IF EXISTS "Users update own clips" ON public.game_clips_user;
CREATE POLICY "Users update own clips"
  ON public.game_clips_user
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 5) profiles: tighten privacy — community co-member exception only for public
DROP POLICY IF EXISTS "Profiles readable by privacy rules" ON public.profiles;
CREATE POLICY "Profiles readable by privacy rules"
  ON public.profiles
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR privacy = 'public'
    OR (privacy = 'friends' AND public.are_rubix_friends(auth.uid(), user_id))
  );
