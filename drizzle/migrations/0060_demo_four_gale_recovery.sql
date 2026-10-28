ALTER TABLE public.iq_demo_test_orders ADD COLUMN IF NOT EXISTS recovery_level integer NOT NULL DEFAULT 0;
ALTER TABLE public.iq_demo_test_orders ADD COLUMN IF NOT EXISTS recovery_loss numeric NOT NULL DEFAULT 0;
ALTER TABLE public.iq_demo_test_orders ADD COLUMN IF NOT EXISTS recovery_payout numeric;
ALTER TABLE public.iq_demo_test_orders ADD COLUMN IF NOT EXISTS recovery_base numeric;
ALTER TABLE public.iq_demo_test_orders ADD CONSTRAINT iq_demo_test_orders_recovery_level_check CHECK (recovery_level BETWEEN 0 AND 4);
COMMENT ON COLUMN public.iq_demo_test_orders.recovery_level IS 'Demo gale level: 0 base entry, 1-4 recovery after confirmed LOSS';
COMMENT ON COLUMN public.iq_demo_test_orders.recovery_loss IS 'Accumulated confirmed Demo losses this entry tries to recover';