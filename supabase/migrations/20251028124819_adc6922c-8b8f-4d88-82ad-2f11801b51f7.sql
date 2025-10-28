-- Create app_settings table for storing application configuration
CREATE TABLE IF NOT EXISTS public.app_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT NOT NULL UNIQUE,
  setting_value TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Create policy to allow reading settings (public read access)
CREATE POLICY "Anyone can read app settings"
ON public.app_settings
FOR SELECT
USING (true);

-- Create policy to prevent modifications (only admin can modify via SQL)
CREATE POLICY "No public modifications to app settings"
ON public.app_settings
FOR INSERT
WITH CHECK (false);

CREATE POLICY "No public updates to app settings"
ON public.app_settings
FOR UPDATE
USING (false);

CREATE POLICY "No public deletes to app settings"
ON public.app_settings
FOR DELETE
USING (false);

-- Insert the main publisher private key
INSERT INTO public.app_settings (setting_key, setting_value, description)
VALUES (
  'main_publisher_private_key',
  '6vAxsEYRr1X8VNNcPgURifVcUQT25yGQaLFVBkUKrHpqLr8gc86',
  'Main publisher private key for signing Lana8Wonder plan events (KIND 88888)'
);

-- Create trigger for automatic timestamp updates
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_app_settings_updated_at
BEFORE UPDATE ON public.app_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();