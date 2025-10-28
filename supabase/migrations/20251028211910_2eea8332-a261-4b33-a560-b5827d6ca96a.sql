-- Drop the foreign key constraint and change selected_wallet to TEXT
ALTER TABLE public.profiles 
DROP CONSTRAINT IF EXISTS profiles_selected_wallet_fkey;

ALTER TABLE public.profiles 
ALTER COLUMN selected_wallet TYPE text USING selected_wallet::text;

-- Delete the incorrectly inserted wallet
DELETE FROM public.wallets 
WHERE wallet_address = 'LhHhMUs2sumuYW5MGkwZfrfJERdFbfE4te' 
AND wallet_type = 'annuity';

-- Update profiles to store the wallet address directly
UPDATE public.profiles 
SET selected_wallet = 'LhHhMUs2sumuYW5MGkwZfrfJERdFbfE4te' 
WHERE nostr_hex_id = '258e6135825fea3bd77ea00c6bcc56d943e5adc58bc6f68755c9946c1760b812';