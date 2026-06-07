
GRANT SELECT (email) ON public.profiles TO authenticated;
DROP VIEW IF EXISTS public.profiles_public;
DROP FUNCTION IF EXISTS public.get_my_email();
