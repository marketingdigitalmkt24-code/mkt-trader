CREATE TABLE public.iq_demo_test_settings (
 id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
 amount numeric NOT NULL DEFAULT 1 CHECK (amount >= 1 AND amount = round(amount, 2)),
 updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.iq_demo_test_settings TO authenticated;
GRANT ALL ON public.iq_demo_test_settings TO service_role;
ALTER TABLE public.iq_demo_test_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read demo test settings" ON public.iq_demo_test_settings FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins insert demo test settings" ON public.iq_demo_test_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins update demo test settings" ON public.iq_demo_test_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
ALTER TABLE public.iq_demo_test_orders DROP CONSTRAINT iq_demo_test_orders_amount_check;
ALTER TABLE public.iq_demo_test_orders ADD CONSTRAINT iq_demo_test_orders_amount_check CHECK (amount >= 1 AND amount = round(amount, 2));