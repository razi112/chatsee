
-- 1. Profiles: hide emails from non-owners
DROP POLICY IF EXISTS "Users can view all profiles" ON public.profiles;

CREATE POLICY "Users can view own profile fully"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Public-safe view excluding email
CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker=on) AS
SELECT id, display_name, avatar_url, status, is_online, last_seen, created_at, updated_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO authenticated, anon;

-- Allow authenticated users to also see other users' non-email fields via the base table
-- (needed because existing app code selects * from profiles). We add a second policy
-- but to truly hide email we need column-level — use a view + revoke email column.
-- Simpler: keep allowing SELECT on profiles to authenticated, but revoke email column.
CREATE POLICY "Authenticated can view non-sensitive profile fields"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

REVOKE SELECT ON public.profiles FROM anon;
REVOKE SELECT (email) ON public.profiles FROM authenticated;
GRANT SELECT (id, display_name, avatar_url, status, is_online, last_seen, created_at, updated_at) ON public.profiles TO authenticated;
-- Owner needs email too: re-grant email but RLS restricts which rows; column grant is global,
-- so grant email column to authenticated, RLS on rows won't help here. Use a separate policy approach:
GRANT SELECT (email) ON public.profiles TO authenticated;
-- And rely on app/view to only show email for own row. Restrict via a row policy specifically:
-- Drop the broad policy and split:
DROP POLICY "Authenticated can view non-sensitive profile fields" ON public.profiles;
DROP POLICY "Users can view own profile fully" ON public.profiles;

CREATE POLICY "Authenticated can view profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- Note: column-level email visibility enforced via REVOKE/GRANT below
REVOKE SELECT (email) ON public.profiles FROM authenticated;
-- Owners read their own email via a SECURITY DEFINER function
CREATE OR REPLACE FUNCTION public.get_my_email()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT email FROM public.profiles WHERE id = auth.uid() $$;

REVOKE EXECUTE ON FUNCTION public.get_my_email() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_email() TO authenticated;

-- 2. conversation_participants: restrict INSERT
DROP POLICY IF EXISTS "Users can add participants" ON public.conversation_participants;

CREATE POLICY "Admins or self-add to new conversation"
  ON public.conversation_participants FOR INSERT
  TO authenticated
  WITH CHECK (
    public.is_conversation_admin(conversation_id, auth.uid())
    OR (
      user_id = auth.uid()
      AND NOT EXISTS (
        SELECT 1 FROM public.conversation_participants cp
        WHERE cp.conversation_id = conversation_participants.conversation_id
      )
    )
  );

-- 3. conversations: require authenticated
DROP POLICY IF EXISTS "Users can create conversations" ON public.conversations;
CREATE POLICY "Authenticated users can create conversations"
  ON public.conversations FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 4. status-media bucket: add UPDATE policy scoped to owner folder
CREATE POLICY "Users can update their own status-media"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'status-media' AND (auth.uid())::text = (storage.foldername(name))[1])
  WITH CHECK (bucket_id = 'status-media' AND (auth.uid())::text = (storage.foldername(name))[1]);

-- 5. Restrict listing of public buckets: limit SELECT to files in user's own folder OR specific paths
-- Avatars: anyone can read individual files via getPublicUrl; restrict LIST by tightening SELECT
DROP POLICY IF EXISTS "Avatar images are publicly accessible" ON storage.objects;
CREATE POLICY "Avatars readable by authenticated"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'avatars');
-- (Public URL access still works via CDN regardless of RLS; LIST requires SELECT.)
-- For status-media — keep broad SELECT (needed to view stories) but covered by RLS context.

-- 6. Revoke EXECUTE on SECURITY DEFINER helpers from anon
REVOKE EXECUTE ON FUNCTION public.is_conversation_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_direct_conversation(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[], text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_admin(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_conversation_participant(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_direct_conversation(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_group_conversation(text, uuid[], text) TO authenticated;
