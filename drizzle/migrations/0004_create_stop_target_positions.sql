CREATE TABLE public.stop_target_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol text NOT NULL,
  direction text NOT NULL,
  entry_price numeric NOT NULL,
  stop_price numeric NOT NULL,
  target_price numeric NOT NULL,
  risk_distance numeric NOT NULL,
  risk_usd numeric NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'open',
  result_kind text,
  result_r numeric,
  close_price numeric,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_stp_status ON public.stop_target_positions (status, opened_at);
GRANT SELECT ON public.stop_target_positions TO authenticated;
GRANT ALL ON public.stop_target_positions TO service_role;
ALTER TABLE public.stop_target_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view stop target positions" ON public.stop_target_positions FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
