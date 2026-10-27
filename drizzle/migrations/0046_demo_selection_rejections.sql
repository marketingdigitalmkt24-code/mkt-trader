CREATE TABLE public.demo_selection_rejections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 signal_id text NOT NULL,
 entry_minute timestamptz NOT NULL,
 asset text NOT NULL,
 direction text NOT NULL,
 entry_strategy text NOT NULL,
 score double precision,
 reason_code text NOT NULL,
 reason_details jsonb NOT NULL DEFAULT '{}'::jsonb,
 candles jsonb NOT NULL DEFAULT '[]'::jsonb,
 rule_version text NOT NULL DEFAULT 'score-pattern-v1',
 recorded_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE (entry_minute, signal_id, rule_version)
);
GRANT SELECT ON public.demo_selection_rejections TO authenticated;
GRANT ALL ON public.demo_selection_rejections TO service_role;
ALTER TABLE public.demo_selection_rejections ENABLE ROW LEVEL SECURITY;
CREATE POLICY demo_rejections_admin_read ON public.demo_selection_rejections FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE INDEX demo_rejections_minute_idx ON public.demo_selection_rejections (entry_minute DESC, id);
CREATE INDEX demo_rejections_score_idx ON public.demo_selection_rejections ((round(score::numeric,2)), entry_minute DESC);