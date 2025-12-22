-- Remove old public policies
DROP POLICY IF EXISTS "Allow public delete iq" ON public.iqoption_config;
DROP POLICY IF EXISTS "Allow public insert iq" ON public.iqoption_config;
DROP POLICY IF EXISTS "Allow public read iq" ON public.iqoption_config;
DROP POLICY IF EXISTS "Allow public update iq" ON public.iqoption_config;