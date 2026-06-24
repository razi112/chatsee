-- Add username column to profiles table
ALTER TABLE public.profiles
  ADD COLUMN username TEXT UNIQUE;

-- Backfill existing profiles using email prefix as username
UPDATE public.profiles
SET username = split_part(email, '@', 1)
WHERE username IS NULL;

-- Now make it not null
ALTER TABLE public.profiles
  ALTER COLUMN username SET NOT NULL;

-- Update the handle_new_user trigger to also store username
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name, username)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    COALESCE(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1))
  );
  RETURN new;
END;
$$;
