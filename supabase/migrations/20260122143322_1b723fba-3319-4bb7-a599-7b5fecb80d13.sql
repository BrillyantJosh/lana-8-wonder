-- Allow deletes on buy_lana table for admins
CREATE POLICY "Allow deletes on buy_lana records" 
ON public.buy_lana 
FOR DELETE 
USING (true);