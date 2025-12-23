-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Admins can manage client profiles" ON public.client_profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.client_profiles;

-- Create permissive policies instead
CREATE POLICY "Admins can manage client profiles" 
ON public.client_profiles 
FOR ALL 
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own profile" 
ON public.client_profiles 
FOR SELECT 
TO authenticated
USING (auth.uid() = user_id);