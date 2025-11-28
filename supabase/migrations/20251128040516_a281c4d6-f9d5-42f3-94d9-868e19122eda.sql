-- Add currency and payment_amount columns to buy_lana table
ALTER TABLE public.buy_lana 
ADD COLUMN IF NOT EXISTS currency text,
ADD COLUMN IF NOT EXISTS payment_amount numeric;