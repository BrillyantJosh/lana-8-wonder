-- Add paid_on_account timestamp column to track when admin confirms payment
ALTER TABLE public.buy_lana 
ADD COLUMN paid_on_account timestamp with time zone;

-- Add tx text column to store transaction ID
ALTER TABLE public.buy_lana 
ADD COLUMN tx text;

-- Create policy to allow updates for admin operations
CREATE POLICY "Allow updates to buy_lana records"
ON public.buy_lana FOR UPDATE
USING (true)
WITH CHECK (true);