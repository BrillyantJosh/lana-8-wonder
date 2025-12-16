-- Drop the restrictive update policy
DROP POLICY IF EXISTS "No public updates to app settings" ON public.app_settings;

-- Create a new policy that allows updates (admin check is done in frontend since this app uses custom Nostr auth)
CREATE POLICY "Allow updates to app settings" 
ON public.app_settings 
FOR UPDATE 
USING (true)
WITH CHECK (true);