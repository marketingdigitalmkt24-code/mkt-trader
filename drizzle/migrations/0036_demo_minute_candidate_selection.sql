CREATE TABLE public.iq_demo_test_candidates (
 entry_minute timestamptz PRIMARY KEY,
 signal_id text NOT NULL UNIQUE,
 asset text NOT NULL,
 direction text NOT NULL CHECK (direction IN ('CALL','PUT')),
 entry_strategy text NOT NULL,
 score double precision NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.iq_demo_test_candidates TO authenticated;
GRANT ALL ON public.iq_demo_test_candidates TO service_role;
ALTER TABLE public.iq_demo_test_candidates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read Demo minute selection" ON public.iq_demo_test_candidates FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
COMMENT ON TABLE public.iq_demo_test_candidates IS 'Service-only best Demo candidate per minute; separate from principal strategy signals and claims.';