CREATE TABLE public.telegram_daily_reports (
 report_date date PRIMARY KEY,
 status text NOT NULL DEFAULT 'preparing',
 claimed_at timestamptz NOT NULL DEFAULT now(),
 message_id bigint,
 message_text text,
 sent_at timestamptz,
 error text
);
GRANT ALL ON public.telegram_daily_reports TO service_role;
ALTER TABLE public.telegram_daily_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manages daily reports" ON public.telegram_daily_reports FOR ALL TO service_role USING (true) WITH CHECK (true);