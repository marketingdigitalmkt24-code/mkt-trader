CREATE OR REPLACE FUNCTION public.claim_force_anticipation_entry(p_signal text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.force_anticipation_tests%ROWTYPE; cfg public.iqoption_config%ROWTYPE; s public.user_trading_settings%ROWTYPE; qid text; daily_profit numeric; daily_count integer; queued_count integer;
 day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
 -- Serialize budget checks, not the lifetime of distinct orders.
 PERFORM pg_advisory_xact_lock(714062,3);
 SELECT * INTO c FROM public.force_anticipation_tests WHERE signal_id=p_signal FOR UPDATE;
 IF c.id IS NULL OR c.signal_id NOT LIKE 'anticipation-v3-%' OR c.result<>'open' OR c.direction NOT IN ('CALL','PUT') OR c.entry_price<=0 OR c.entry_minute<>date_trunc('minute',now()) OR c.created_at<c.entry_minute OR c.created_at>now() OR now()>=c.entry_minute+interval '30 seconds' OR c.expiration_time<>c.entry_minute+interval '1 minute' THEN RETURN NULL; END IF;
 qid:='forca_antecipada-'||c.id::text;
 IF EXISTS(SELECT 1 FROM public.trade_queue WHERE signal_id=qid) OR EXISTS(SELECT 1 FROM public.operation_results WHERE signal_id=qid) THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 SELECT * INTO s FROM public.user_trading_settings WHERE user_id=cfg.user_id LIMIT 1;
 IF cfg.id IS NULL OR cfg.account_type NOT IN ('PRACTICE','REAL') OR s.id IS NULL OR NOT s.auto_trading_enabled OR s.trade_amount<=0 OR s.trade_amount::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
 SELECT coalesce(sum(profit),0),count(*) INTO daily_profit,daily_count FROM public.operation_results WHERE created_at>=day_start AND timeframe NOT IN ('TEST','MT5') AND iq_option_id ~ '^[0-9]+$' AND signal_id NOT LIKE 'copy-%';
 -- Include unconfirmed reservations so simultaneous claims cannot exceed daily slots.
 SELECT count(*) INTO queued_count FROM public.trade_queue q WHERE q.created_at>=day_start AND q.timeframe NOT IN ('TEST','MT5') AND q.signal_id NOT LIKE 'copy-%' AND q.status IN ('pending','executing') AND NOT EXISTS(SELECT 1 FROM public.operation_results o WHERE o.signal_id=q.signal_id AND o.iq_option_id ~ '^[0-9]+$');
 IF s.daily_limit_enabled AND daily_count+queued_count>=s.max_daily_trades THEN RETURN NULL; END IF;
 IF s.profit_target_type IN ('fixed','value') AND s.profit_target_value>0 AND daily_profit>=s.profit_target_value THEN RETURN NULL; END IF;
 IF s.profit_target_type='percentage' AND s.profit_target_value>0 THEN RETURN NULL; END IF;
 INSERT INTO public.trade_queue(asset,direction,amount,expiration,signal_id,timeframe,status,entry_strategy) VALUES(c.asset,c.direction,s.trade_amount,1,qid,'M1','executing','FORCA_ANTECIPADA');
 RETURN jsonb_build_object('signalId',qid,'asset',c.asset,'direction',lower(c.direction),'amount',s.trade_amount,'expiration',1,'timeframe','M1','isAutoTrade',true,'isAIAnalyzed',false,'entryStrategy','FORCA_ANTECIPADA','entryAt',extract(epoch FROM c.entry_minute)*1000);
END; $$;
REVOKE ALL ON FUNCTION public.claim_force_anticipation_entry(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_force_anticipation_entry(text) TO service_role;
COMMENT ON FUNCTION public.claim_force_anticipation_entry(text) IS 'Distinct fresh v3 anticipation signals may execute concurrently; serialized BRT daily budget, exact signal deduplication, current principal stake, no historical promotion or copy.';
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
  IF master_strategy='FORCA_ANTECIPADA' THEN
   scope_key := scope_key||':'||p_signal;
   -- Only the service-claimed exact fresh order can use this concurrency exception.
   IF NOT EXISTS(SELECT 1 FROM public.trade_queue q JOIN public.force_anticipation_tests c ON q.signal_id='forca_antecipada-'||c.id::text WHERE q.signal_id=p_signal AND q.entry_strategy='FORCA_ANTECIPADA' AND q.status='executing' AND q.error='placement_claimed' AND c.signal_id LIKE 'anticipation-v3-%' AND c.entry_minute=date_trunc('minute',now()) AND now()<c.entry_minute+interval '30 seconds') THEN RETURN NULL; END IF;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(scope_key,0));
  SELECT trade_amount INTO amount FROM public.user_trading_settings WHERE user_id=cfg.user_id AND auto_trading_enabled;
  IF master_strategy='FORCA_ANTECIPADA' THEN
   IF EXISTS(SELECT 1 FROM public.operation_results WHERE signal_id=p_signal) THEN RETURN NULL; END IF;
  ELSE
   IF EXISTS(SELECT 1 FROM public.operation_results WHERE iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND signal_id NOT LIKE 'copy-%' AND result IN ('pending','open') AND entry_strategy=master_strategy) THEN RETURN NULL; END IF;
   IF EXISTS(SELECT 1 FROM public.trade_queue WHERE signal_id<>p_signal AND status IN ('pending','executing') AND timeframe NOT IN ('TEST','MT5') AND entry_strategy=master_strategy AND created_at>now()-interval '2 minutes') THEN RETURN NULL; END IF;
  END IF;
 ELSE
  scope_key := 'client:'||p_client::text;
  PERFORM pg_advisory_xact_lock(hashtextextended(scope_key,0));
  IF p_client=cfg.user_id THEN RETURN NULL; END IF;
  SELECT * INTO client_cfg FROM public.iqoption_config WHERE user_id=p_client AND is_active AND last_connected_at IS NOT NULL AND account_type IN ('REAL','PRACTICE') ORDER BY created_at,id LIMIT 1;
  IF client_cfg.id IS NULL THEN RETURN NULL; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.copy_trading_configs WHERE user_id=p_client AND enabled) THEN RETURN NULL; END IF;
  SELECT trade_amount INTO amount FROM public.user_trading_settings WHERE user_id=p_client;
  IF EXISTS(SELECT 1 FROM public.operation_results WHERE signal_id LIKE 'copy-'||p_client::text||'-%' AND iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND result IN ('pending','open')) THEN RETURN NULL; END IF;
  UPDATE public.iq_entry_leases l SET reserved_until=now()
   WHERE l.scope=scope_key AND l.reserved_until>now() AND l.signal_id<>p_signal
     AND EXISTS(SELECT 1 FROM public.trade_queue q WHERE q.status='failed' AND q.signal_id=substr(l.signal_id, length('copy-'||p_client::text||'-')+1))
     AND NOT EXISTS(SELECT 1 FROM public.operation_results o WHERE o.signal_id=l.signal_id);
 END IF;
 IF amount IS NULL OR amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.iq_entry_leases WHERE scope=scope_key AND (reserved_until>now() OR signal_id=p_signal)) THEN RETURN NULL; END IF;
 INSERT INTO public.iq_entry_leases VALUES(scope_key,p_signal,now()+interval '2 minutes') ON CONFLICT(scope) DO UPDATE SET signal_id=p_signal, reserved_until=now()+interval '2 minutes';
 RETURN amount;
END; $function$;
REVOKE ALL ON FUNCTION public.reserve_iq_entry(uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_iq_entry(uuid,text) TO service_role;