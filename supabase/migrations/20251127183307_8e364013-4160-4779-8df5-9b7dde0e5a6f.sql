-- Create buy_lana table for purchase records
CREATE TABLE public.buy_lana (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  lana_wallet_id TEXT NOT NULL,
  lana_amount NUMERIC NOT NULL,
  payee TEXT NOT NULL,
  reference TEXT,
  payment_method TEXT NOT NULL
);

-- Enable Row Level Security
ALTER TABLE public.buy_lana ENABLE ROW LEVEL SECURITY;

-- Create policies for buy_lana
CREATE POLICY "Anyone can insert buy_lana records"
ON public.buy_lana
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Anyone can view buy_lana records"
ON public.buy_lana
FOR SELECT
USING (true);

-- Add trigger for automatic timestamp updates
CREATE TRIGGER update_buy_lana_updated_at
BEFORE UPDATE ON public.buy_lana
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();