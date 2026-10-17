GRANT SELECT, INSERT, UPDATE ON public.copy_trading_configs TO authenticated;
GRANT ALL ON public.copy_trading_configs TO service_role;
CREATE POLICY "Users insert own copy config" ON public.copy_trading_configs
FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);