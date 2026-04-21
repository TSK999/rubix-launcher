-- Drop the broad public read on custom-emojis and replace with: allow direct fetch only via signed/public URL pattern (still public bucket so URLs work),
-- but require authenticated session for SELECT via API. Public URLs continue to work because they bypass the API.
DROP POLICY IF EXISTS "Anyone reads custom emojis" ON storage.objects;

CREATE POLICY "Authenticated reads custom emojis"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'custom-emojis');