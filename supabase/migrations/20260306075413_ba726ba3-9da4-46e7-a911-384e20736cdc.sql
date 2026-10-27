
CREATE TABLE public.trade_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset text NOT NULL,
  direction text NOT NULL,
  amount numeric NOT NULL DEFAULT 1,
  expiration integer NOT NULL DEFAULT 1,
  signal_id text NOT NULL,
  timeframe text NOT NULL DEFAULT 'M1',
  confluence_score integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  iq_option_id text,
  result text,
  profit numeric DEFAULT 0,
  error text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  executed_at timestamp with time zone
);

ALTER TABLE public.trade_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read trade_queue" ON public.trade_queue FOR SELECT USING (true);
CREATE POLICY "Allow public insert trade_queue" ON public.trade_queue FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update trade_queue" ON public.trade_queue FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Allow public delete trade_queue" ON public.trade_queue FOR DELETE USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE public.trade_queue;
