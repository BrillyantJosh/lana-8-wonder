-- Add position column to wallets table to preserve wallet order (1-8)
ALTER TABLE public.wallets ADD COLUMN position INTEGER;

-- Update existing wallets with positions based on created_at order
-- This ensures wallets created earlier get lower positions
WITH ordered_wallets AS (
  SELECT 
    id,
    profile_id,
    ROW_NUMBER() OVER (PARTITION BY profile_id ORDER BY created_at) as row_num
  FROM public.wallets
  WHERE wallet_type = 'annuity'
)
UPDATE public.wallets
SET position = ordered_wallets.row_num
FROM ordered_wallets
WHERE wallets.id = ordered_wallets.id;

-- Add comment explaining the column
COMMENT ON COLUMN public.wallets.position IS 'Order position of wallet in Lana 8 Wonder plan (1-8)';