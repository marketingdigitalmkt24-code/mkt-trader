CREATE TABLE public.forex_practice_balance (id integer PRIMARY KEY DEFAULT 1, amount numeric NOT NULL DEFAULT 0, currency text NOT NULL DEFAULT 'USD', updated_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.forex_practice_balance TO authenticated;
GRANT ALL ON public.forex_practice_balance TO service_role;
ALTER TABLE public.forex_practice_balance ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read practice balance" ON public.forex_practice_balance FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));