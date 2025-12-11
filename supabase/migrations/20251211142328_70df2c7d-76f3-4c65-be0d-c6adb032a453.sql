-- Add DELETE policy for waiting_list table
CREATE POLICY "Anyone can delete from waiting_list" 
ON public.waiting_list 
FOR DELETE 
USING (true);