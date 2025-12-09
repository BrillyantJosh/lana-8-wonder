-- Create waiting_list table for users who want to be notified when slots become available
CREATE TABLE public.waiting_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Contact information (required for both paths)
  email TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  
  -- For users WITHOUT a wallet (new registration)
  first_name TEXT,
  last_name TEXT,
  address TEXT,
  
  -- For users WITH a wallet (existing users)
  nostr_hex_id TEXT,
  wallet_id TEXT,
  
  -- Status tracking
  has_wallet BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending',
  notified_at TIMESTAMP WITH TIME ZONE
);

-- Enable Row Level Security
ALTER TABLE public.waiting_list ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (anyone can join waiting list)
CREATE POLICY "Anyone can insert into waiting_list" 
ON public.waiting_list 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Anyone can view waiting_list records" 
ON public.waiting_list 
FOR SELECT 
USING (true);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_waiting_list_updated_at
BEFORE UPDATE ON public.waiting_list
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();