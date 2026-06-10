ALTER TABLE public.statuses
  ADD COLUMN IF NOT EXISTS music_url text,
  ADD COLUMN IF NOT EXISTS music_title text,
  ADD COLUMN IF NOT EXISTS music_artist text,
  ADD COLUMN IF NOT EXISTS music_artwork text;