-- Add user_id column to iqoption_config table
ALTER TABLE public.iqoption_config ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Update existing records to associate with the first admin user (if any exist)
-- This is just to handle existing data, new records will require user_id

-- Drop existing policies
DROP POLICY IF EXISTS "Allow all operations on iqoption_config" ON public.iqoption_config;

-- Create new RLS policies for user-specific access
CREATE POLICY "Users can view their own iqoption config"
ON public.iqoption_config
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own iqoption config"
ON public.iqoption_config
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own iqoption config"
ON public.iqoption_config
FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own iqoption config"
ON public.iqoption_config
FOR DELETE
USING (auth.uid() = user_id);

-- Allow admins to view all configs
CREATE POLICY "Admins can view all iqoption configs"
ON public.iqoption_config
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);