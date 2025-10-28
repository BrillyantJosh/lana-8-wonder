-- Add selected_wallet column to profiles table
ALTER TABLE public.profiles 
ADD COLUMN selected_wallet uuid REFERENCES public.wallets(id) ON DELETE SET NULL;