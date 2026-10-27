CREATE TABLE public.chart_study (
  symbol text NOT NULL,
  direction text NOT NULL,
  hour_brt integer NOT NULL,
  n integer NOT NULL DEFAULT 0,
  wins integer NOT NULL DEFAULT 0,
  candles integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (symbol, direction, hour_brt)
);
GRANT SELECT ON public.chart_study TO authenticated;
GRANT ALL ON public.chart_study TO service_role;
ALTER TABLE public.chart_study ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read chart study" ON public.chart_study FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));