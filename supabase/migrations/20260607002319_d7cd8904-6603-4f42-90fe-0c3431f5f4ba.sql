
-- Avatars: drop broad listing policies, keep owner-only listing
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Avatars readable by authenticated" ON storage.objects;

CREATE POLICY "Users can list their own avatars"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- Status media: drop broad listing policy, keep owner-only listing
DROP POLICY IF EXISTS "Public can view status media" ON storage.objects;

CREATE POLICY "Users can list their own status media"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'status-media'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
