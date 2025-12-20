-- Add UPDATE policy to operation_results table
CREATE POLICY "Allow public update results" 
ON public.operation_results 
FOR UPDATE 
USING (true)
WITH CHECK (true);

-- Add DELETE policy to operation_results table  
CREATE POLICY "Allow public delete results" 
ON public.operation_results 
FOR DELETE 
USING (true);