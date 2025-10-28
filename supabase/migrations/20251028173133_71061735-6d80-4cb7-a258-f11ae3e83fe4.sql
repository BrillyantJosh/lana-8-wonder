-- Add new fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN wallet_registered BOOLEAN DEFAULT FALSE,
ADD COLUMN tx TEXT DEFAULT NULL,
ADD COLUMN published_plan BOOLEAN DEFAULT FALSE;