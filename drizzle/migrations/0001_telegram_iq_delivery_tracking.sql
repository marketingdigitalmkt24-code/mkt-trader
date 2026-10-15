CREATE TABLE public.telegram_iq_deliveries (
 signal_id text PRIMARY KEY,
 chat_id text NOT NULL,
 signal_message_id bigint NOT NULL,
 strategy text,
 result_status text NOT NULL DEFAULT 'pending' CHECK (result_status IN ('pending','sending','sent')),
 result_message_id bigint,
 claimed_at timestamptz,
 result_sent_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_iq_deliveries TO service_role;
ALTER TABLE public.telegram_iq_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manages Telegram deliveries" ON public.telegram_iq_deliveries FOR ALL TO service_role USING (true) WITH CHECK (true);