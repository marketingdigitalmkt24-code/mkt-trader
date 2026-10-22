CREATE OR REPLACE FUNCTION public.reserve_iq_entry(p_client uuid, p_signal text)
 RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE scope_key text; amount numeric; cfg public.iqoption_config%ROWTYPE; client_cfg public.iqoption_config%ROWTYPE; master_strategy text;
BEGIN
 IF p_signal IS NULL OR p_signal='' THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 IF cfg.id IS NULL THEN RETURN NULL; END IF;
 IF p_client IS NULL THEN
  master_strategy := upper(split_part(p_signal,'-',1));
  scope_key := 'master:'||lower(master_strategy);
  PERFORM pg_advisory_xact_lock(hashtextextended(scope_key,0));
  SELECT trade_amount INTO amount FROM public.user_trading_settings WHERE user_id=cfg.user_id AND auto_trading_enabled;
  IF EXISTS(SELECT 1 FROM public.operation_results WHERE iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND signal_id NOT LIKE 'copy-%' AND result IN ('pending','open') AND entry_strategy=master_strategy) THEN RETURN NULL; END IF;
  IF EXISTS(SELECT 1 FROM public.trade_queue WHERE signal_id<>p_signal AND status IN ('pending','executing') AND timeframe NOT IN ('TEST','MT5') AND entry_strategy=master_strategy AND created_at>now()-interval '2 minutes') THEN RETURN NULL; END IF;
 ELSE
  scope_key := 'client:'||p_client::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(scope_key,0));
  IF p_client=cfg.user_id THEN RETURN NULL; END IF;
  SELECT * INTO client_cfg FROM public.iqoption_config WHERE user_id=p_client AND is_active AND last_connected_at IS NOT NULL AND account_type IN ('REAL','PRACTICE') ORDER BY created_at,id LIMIT 1;
  IF client_cfg.id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.copy_trading_configs WHERE user_id=p_client AND enabled) THEN RETURN NULL; END IF;
  SELECT trade_amount INTO amount FROM public.user_trading_settings WHERE user_id=p_client;
  IF EXISTS(SELECT 1 FROM public.operation_results WHERE signal_id LIKE 'copy-'||p_client::text||'-%' AND iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND result IN ('pending','open')) THEN RETURN NULL; END IF;
  -- A copy is only sent after the principal is confirmed. If the principal order failed
  -- and no copy order was saved, the held lease is released instead of blocking forever.
  UPDATE public.iq_entry_leases l SET reserved_until=now()
   WHERE l.scope=scope_key AND l.reserved_until>now() AND l.signal_id<>p_signal
     AND EXISTS(SELECT 1 FROM public.trade_queue q WHERE q.status='failed'
        AND q.signal_id=substr(l.signal_id, length('copy-'||p_client::text||'-')+1))
     AND NOT EXISTS(SELECT 1 FROM public.operation_results o WHERE o.signal_id=l.signal_id);
 END IF;
 IF amount IS NULL OR amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.iq_entry_leases WHERE scope=scope_key AND (reserved_until>now() OR signal_id=p_signal)) THEN RETURN NULL; END IF;
 INSERT INTO public.iq_entry_leases VALUES(scope_key,p_signal,now()+interval '2 minutes') ON CONFLICT(scope) DO UPDATE SET signal_id=p_signal, reserved_until=now()+interval '2 minutes';
 RETURN amount;
END; $function$;

UPDATE public.iq_entry_leases l SET reserved_until=now()
 WHERE l.scope LIKE 'client:%' AND l.reserved_until='infinity'
   AND EXISTS(SELECT 1 FROM public.trade_queue q WHERE q.status='failed' AND l.signal_id LIKE '%'||q.signal_id)
   AND NOT EXISTS(SELECT 1 FROM public.operation_results o WHERE o.signal_id=l.signal_id);