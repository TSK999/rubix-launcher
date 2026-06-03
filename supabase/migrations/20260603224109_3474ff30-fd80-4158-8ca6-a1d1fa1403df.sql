
CREATE OR REPLACE FUNCTION public.validate_passport_stamp()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.rarity NOT IN ('common','rare','epic','legendary') THEN
    RAISE EXCEPTION 'invalid rarity: %', NEW.rarity;
  END IF;
  IF NEW.criteria_type NOT IN (
    'first_launch','playtime_hours','launches_count',
    'games_owned','friends_added','signup','manual','source_games'
  ) THEN
    RAISE EXCEPTION 'invalid criteria_type: %', NEW.criteria_type;
  END IF;
  RETURN NEW;
END $function$;
