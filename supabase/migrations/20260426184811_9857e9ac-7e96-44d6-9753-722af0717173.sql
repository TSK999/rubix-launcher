ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS pronouns text,
ADD COLUMN IF NOT EXISTS location text,
ADD COLUMN IF NOT EXISTS status_emoji text,
ADD COLUMN IF NOT EXISTS status_text text,
ADD COLUMN IF NOT EXISTS customization jsonb NOT NULL DEFAULT '{}'::jsonb;