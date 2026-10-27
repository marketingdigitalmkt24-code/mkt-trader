CREATE TABLE public.copy_trading_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  enabled boolean NOT NULL DEFAULT false,
  account_type text NOT NULL DEFAULT 'PRACTICE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.copy_trading_configs TO authenticated;
GRANT ALL ON public.copy_trading_configs TO service_role;
ALTER TABLE public.copy_trading_configs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage copy configs" ON public.copy_trading_configs FOR ALL TO authenticated USING (has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Users view own copy config" ON public.copy_trading_configs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users update own copy config" ON public.copy_trading_configs FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER update_copy_trading_configs_updated_at BEFORE UPDATE ON public.copy_trading_configs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();