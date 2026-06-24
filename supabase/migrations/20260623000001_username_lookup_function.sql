-- Create a security definer function so the anon role can look up
-- a user's email by username without needing direct table access.
-- This runs with the privileges of the function owner (postgres/service role),
-- so RLS on the profiles table is bypassed safely for this narrow query only.

CREATE OR REPLACE FUNCTION public.get_email_by_username(p_username TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email TEXT;
BEGIN
  SELECT email INTO v_email
  FROM public.profiles
  WHERE username = lower(trim(p_username))
  LIMIT 1;

  RETURN v_email;
END;
$$;

-- Allow the anon and authenticated roles to call this function
GRANT EXECUTE ON FUNCTION public.get_email_by_username(TEXT) TO anon, authenticated;
