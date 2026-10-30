CREATE TABLE public.iq_broker_sessions (
  config_id uuid PRIMARY KEY,
  ssid text NOT NULL,
  obtained_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON public.iq_broker_sessions FROM anon, authenticated;
GRANT ALL ON public.iq_broker_sessions TO service_role;
ALTER TABLE public.iq_broker_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service role only broker sessions" ON public.iq_broker_sessions
  FOR ALL TO service_role USING (true) WITH CHECK (true);