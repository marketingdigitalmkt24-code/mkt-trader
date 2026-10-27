CREATE TABLE public.iq_demo_test_orders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 signal_id text NOT NULL UNIQUE,
 entry_minute timestamptz NOT NULL UNIQUE,
 asset text NOT NULL,
 direction text NOT NULL,
 entry_strategy text NOT NULL,
 amount numeric NOT NULL DEFAULT 1 CHECK (amount = 1),
 account_type text NOT NULL DEFAULT 'PRACTICE' CHECK (account_type = 'PRACTICE'),
 status text NOT NULL DEFAULT 'reserved',
 iq_option_id text,
 result text NOT NULL DEFAULT 'pending',
 profit numeric NOT NULL DEFAULT 0,
 expiration_time timestamptz NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 settled_at timestamptz,
 error text
);
GRANT SELECT ON public.iq_demo_test_orders TO authenticated;
GRANT ALL ON public.iq_demo_test_orders TO service_role;
ALTER TABLE public.iq_demo_test_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read demo test orders" ON public.iq_demo_test_orders FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE INDEX iq_demo_test_pending ON public.iq_demo_test_orders (created_at) WHERE result = 'pending';