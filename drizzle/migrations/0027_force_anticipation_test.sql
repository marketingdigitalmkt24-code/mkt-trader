CREATE TABLE public.force_anticipation_tests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 signal_id text NOT NULL UNIQUE,
 asset text NOT NULL,
 direction text NOT NULL DEFAULT 'CALL' CHECK (direction = 'CALL'),
 entry_minute timestamptz NOT NULL,
 created_at timestamptz NOT NULL,
 expiration_time timestamptz NOT NULL,
 entry_price numeric NOT NULL,
 exit_price numeric,
 result text NOT NULL DEFAULT 'open' CHECK (result IN ('open','win','loss','tie','expired')),
 profit numeric NOT NULL DEFAULT 0,
 indicators jsonb NOT NULL,
 settled_at timestamptz
);
GRANT SELECT ON public.force_anticipation_tests TO authenticated;
GRANT ALL ON public.force_anticipation_tests TO service_role;
ALTER TABLE public.force_anticipation_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admin reads anticipation tests" ON public.force_anticipation_tests FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX force_anticipation_tests_recent ON public.force_anticipation_tests (created_at DESC);
COMMENT ON TABLE public.force_anticipation_tests IS 'Prospective TEST-only anticipation, isolated from operation_results, real claims, copy and learning. Profit is simulated at 10 stake and 85 percent payout.';