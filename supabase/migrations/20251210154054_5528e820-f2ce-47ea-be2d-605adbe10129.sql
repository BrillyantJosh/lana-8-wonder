-- Create admin_users table for multiple admin support
CREATE TABLE public.admin_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nostr_hex_id text NOT NULL UNIQUE,
  description text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Anyone can read (needed for admin check)
CREATE POLICY "Anyone can read admin_users" ON public.admin_users
  FOR SELECT USING (true);

-- No public modifications
CREATE POLICY "No public inserts" ON public.admin_users
  FOR INSERT WITH CHECK (false);
CREATE POLICY "No public updates" ON public.admin_users  
  FOR UPDATE USING (false);
CREATE POLICY "No public deletes" ON public.admin_users
  FOR DELETE USING (false);

-- Add trigger for updated_at
CREATE TRIGGER update_admin_users_updated_at
  BEFORE UPDATE ON public.admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Insert existing admin
INSERT INTO public.admin_users (nostr_hex_id, description) 
VALUES ('56e8670aa65491f8595dc3a71c94aa7445dcdca755ca5f77c07218498a362061', 'Original admin');

-- Insert new admin
INSERT INTO public.admin_users (nostr_hex_id, description) 
VALUES ('4f8735cf707b3980ff2ed284cda7c0fb4150cd1b137fc170a30aafd9d93e84d6', 'New admin');