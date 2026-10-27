-- Create client_profiles table to store client user information
CREATE TABLE public.client_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  email text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true
);

-- Enable RLS
ALTER TABLE public.client_profiles ENABLE ROW LEVEL SECURITY;

-- Allow admins to manage client profiles
CREATE POLICY "Admins can manage client profiles"
ON public.client_profiles
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Allow users to view their own profile
CREATE POLICY "Users can view own profile"
ON public.client_profiles
FOR SELECT
USING (auth.uid() = user_id);