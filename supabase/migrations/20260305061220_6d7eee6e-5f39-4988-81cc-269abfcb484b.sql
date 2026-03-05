CREATE TABLE public.metaapi_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id text NOT NULL,
  token text NOT NULL,
  account_name text DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  connection_status text DEFAULT 'disconnected',
  volume numeric NOT NULL DEFAULT 0.01,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.metaapi_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read metaapi" ON public.metaapi_config FOR SELECT USING (true);
CREATE POLICY "Allow public insert metaapi" ON public.metaapi_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update metaapi" ON public.metaapi_config FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete metaapi" ON public.metaapi_config FOR DELETE USING (true);