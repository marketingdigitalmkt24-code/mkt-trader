CREATE OR REPLACE FUNCTION public.reserve_iq_entry(p_client uuid, p_signal text) RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE scope_key text; amount numeric; cfg public.iqoption_config%ROWTYPE; client_cfg public.iqoption_config%ROWTYPE;
BEGIN
 scope_key := CASE WHEN p_client IS NULL THEN 'master' ELSE 'client:'||p_client::text END;
 PERFORM pg_advisory_xact_lock(hashtextextended(scope_key,0));
 IF p_signal IS NULL OR p_signal='' THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 IF cfg.id IS NULL THEN RETURN NULL; END IF;
 IF p_client IS NULL THEN
  SELECT trade_amount INTO amount FROM public.user_trading_settings WHERE user_id=cfg.user_id AND auto_trading_enabled;
  IF EXISTS(SELECT 1 FROM public.operation_results WHERE iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND signal_id NOT LIKE 'copy-%' AND result IN ('pending','open')) THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.trade_queue WHERE signal_id<>p_signal AND status IN ('pending','executing') AND timeframe NOT IN ('TEST','MT5') AND created_at>now()-interval '2 minutes') THEN RETURN NULL; END IF;
 ELSE
  IF p_client=cfg.user_id THEN RETURN NULL; END IF;
  SELECT * INTO client_cfg FROM public.iqoption_config WHERE user_id=p_client AND is_active AND last_connected_at IS NOT NULL AND account_type IN ('REAL','PRACTICE') ORDER BY created_at,id LIMIT 1;
  IF client_cfg.id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.copy_trading_configs WHERE user_id=p_client AND enabled) THEN RETURN NULL; END IF;
  SELECT trade_amount INTO amount FROM public.user_trading_settings WHERE user_id=p_client;
  IF EXISTS(SELECT 1 FROM public.operation_results WHERE signal_id LIKE 'copy-'||p_client::text||'-%' AND iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND result IN ('pending','open')) THEN RETURN NULL; END IF;
 END IF;
 IF amount IS NULL OR amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.iq_entry_leases WHERE scope=scope_key AND (reserved_until>now() OR signal_id=p_signal)) THEN RETURN NULL; END IF;
 INSERT INTO public.iq_entry_leases VALUES(scope_key,p_signal,now()+interval '2 minutes') ON CONFLICT(scope) DO UPDATE SET signal_id=excluded.signal_id,reserved_until=excluded.reserved_until;
 RETURN amount;
END; $$;
REVOKE ALL ON FUNCTION public.reserve_iq_entry(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_iq_entry(uuid,text) TO service_role;