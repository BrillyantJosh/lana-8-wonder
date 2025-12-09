-- Add allowed_upgrade column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN allowed_upgrade boolean NOT NULL DEFAULT false;