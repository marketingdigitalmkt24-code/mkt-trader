CREATE OR REPLACE FUNCTION public.claim_after_four_losses(p_candidate text, p_config uuid, p_balance numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE c public.iq_demo_test_candidates%ROWTYPE; cfg public.iqoption_config%ROWTYPE; s public.user_trading_settings%ROWTYPE; qid text; stake numeric; n integer; pnl numeric; losses integer; newest_level integer; scope_key text:='master:apos_4_loss';
 day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
 PERFORM pg_advisory_xact_lock(714062,5);
 SELECT * INTO c FROM public.iq_demo_test_candidates WHERE signal_id=p_candidate FOR UPDATE;
 IF c.signal_id IS NULL OR c.entry_strategy NOT IN ('TAKASHI_BNF_V1','ICHIMOKU_RECUO21','ICHIMOKU','RECUO_EMA21') OR c.direction NOT IN ('CALL','PUT') OR c.entry_minute<>date_trunc('minute',now()) OR now()>=c.entry_minute+interval '30 seconds' THEN RETURN NULL; END IF;
 SELECT count(*) FILTER (WHERE x.result='loss'), (array_agg(x.recovery_level ORDER BY x.entry_minute DESC))[1] INTO losses, newest_level
 FROM (SELECT o.result, o.recovery_level, o.entry_minute FROM public.iq_demo_test_orders o
       WHERE o.status='confirmed' AND o.account_type IN ('PRACTICE','REAL') AND o.entry_strategy IN ('TAKASHI_BNF_V1','ICHIMOKU_RECUO21','ICHIMOKU','RECUO_EMA21') AND o.entry_minute<c.entry_minute
       ORDER BY o.entry_minute DESC LIMIT 4) x;
 IF coalesce(losses,0)<>4 OR newest_level IS DISTINCT FROM 3 THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 SELECT * INTO s FROM public.user_trading_settings WHERE user_id=cfg.user_id;
 IF cfg.id IS NULL OR cfg.id<>p_config OR NOT cfg.is_active OR cfg.last_connected_at IS NULL OR cfg.account_type NOT IN ('PRACTICE','REAL') OR s.id IS NULL OR NOT s.auto_trading_enabled OR s.trade_amount<=0 OR s.trade_amount::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
 qid:='apos-4-loss-v1-'||c.signal_id;
 IF EXISTS(SELECT 1 FROM public.trade_queue WHERE signal_id=qid)
  OR EXISTS(SELECT 1 FROM public.iq_entry_leases WHERE scope LIKE 'master%' AND reserved_until>now())
  OR EXISTS(SELECT 1 FROM public.operation_results WHERE iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND signal_id NOT LIKE 'copy-%' AND result IN ('pending','open') AND (expiration_time IS NULL OR expiration_time>now()))
  OR EXISTS(SELECT 1 FROM public.trade_queue WHERE status IN ('pending','executing') AND timeframe NOT IN ('TEST','MT5') AND created_at>now()-interval '2 minutes') THEN RETURN NULL; END IF;
 SELECT coalesce(sum(profit),0),count(*) INTO pnl,n FROM public.operation_results WHERE created_at>=day_start AND timeframe NOT IN ('TEST','MT5') AND iq_option_id ~ '^[0-9]+$' AND signal_id NOT LIKE 'copy-%' AND signal_id NOT LIKE 'mt5-%';
 IF s.daily_limit_enabled AND n>=s.max_daily_trades THEN RETURN NULL; END IF;
 IF s.profit_target_type IN ('fixed','value') AND s.profit_target_value>0 AND pnl>=s.profit_target_value THEN RETURN NULL; END IF;
 IF s.profit_target_type='percentage' AND s.profit_target_value>0 THEN
  IF p_balance IS NULL OR p_balance<=0 OR p_balance::text IN ('NaN','Infinity','-Infinity') OR p_balance-pnl<=0 OR pnl>=(p_balance-pnl)*s.profit_target_value/100 THEN RETURN NULL; END IF;
 END IF;
 stake:=s.trade_amount;
 INSERT INTO public.iq_entry_leases VALUES(scope_key,qid,now()+interval '2 minutes') ON CONFLICT(scope) DO UPDATE SET signal_id=EXCLUDED.signal_id, reserved_until=EXCLUDED.reserved_until;
 INSERT INTO public.trade_queue(asset,direction,amount,expiration,signal_id,timeframe,status,entry_strategy) VALUES(c.asset,c.direction,stake,1,qid,'M1','executing','APOS_4_LOSS');
 RETURN jsonb_build_object('signalId',qid,'asset',c.asset,'direction',lower(c.direction),'amount',stake,'expiration',1,'timeframe','M1','entryStrategy','APOS_4_LOSS','entryAt',extract(epoch FROM c.entry_minute)*1000,'configId',cfg.id);
END; $function$;

REVOKE ALL ON FUNCTION public.claim_after_four_losses(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_after_four_losses(text, uuid, numeric) TO service_role;

CREATE OR REPLACE FUNCTION public.reserve_iq_entry(p_client uuid, p_signal text)
 RETURNS numeric
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE cfg public.iqoption_config%ROWTYPE; client_cfg public.iqoption_config%ROWTYPE; s public.user_trading_settings%ROWTYPE; scope_key text; principal_signal text; principal_strategy text; amount numeric; pnl numeric; n integer;
 day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
 IF p_client IS NULL OR p_signal IS NULL THEN RETURN NULL; END IF;
 principal_signal := substr(p_signal,length('copy-'||p_client::text||'-')+1);
 IF p_signal <> 'copy-'||p_client::text||'-'||principal_signal THEN RETURN NULL; END IF;
 IF left(principal_signal, length('takashi_apos_226_invertida-v1-')) = 'takashi_apos_226_invertida-v1-' THEN principal_strategy := 'TAKASHI_APOS_226_INVERTIDA';
 ELSIF left(principal_signal, length('nota-consistente-v1-')) = 'nota-consistente-v1-' THEN principal_strategy := 'NOTA_CONSISTENTE';
 ELSIF left(principal_signal, length('apos-4-loss-v1-')) = 'apos-4-loss-v1-' THEN principal_strategy := 'APOS_4_LOSS';
 ELSE RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.operation_results o JOIN public.trade_queue q ON q.signal_id=o.signal_id AND q.iq_option_id=o.iq_option_id WHERE o.signal_id=principal_signal AND o.entry_strategy=principal_strategy AND o.iq_option_id ~ '^[0-9]+$' AND o.timeframe='M1' AND q.status='executed' AND now()>=o.expiration_time-interval '1 minute' AND now()<o.expiration_time-interval '30 seconds') THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 IF cfg.id IS NULL OR p_client=cfg.user_id THEN RETURN NULL; END IF;
 scope_key:='client:'||p_client::text;
 PERFORM pg_advisory_xact_lock(hashtextextended(scope_key,0));
 SELECT * INTO client_cfg FROM public.iqoption_config WHERE user_id=p_client AND is_active AND last_connected_at IS NOT NULL AND account_type IN ('REAL','PRACTICE') ORDER BY created_at,id LIMIT 1;
 SELECT * INTO s FROM public.user_trading_settings WHERE user_id=p_client;
 IF client_cfg.id IS NULL OR s.id IS NULL OR NOT EXISTS(SELECT 1 FROM public.copy_trading_configs WHERE user_id=p_client AND enabled) THEN RETURN NULL; END IF;
 amount:=s.trade_amount;
 IF amount IS NULL OR amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.operation_results WHERE signal_id LIKE 'copy-'||p_client::text||'-%' AND iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND result IN ('pending','open')) OR EXISTS(SELECT 1 FROM public.operation_results WHERE signal_id=p_signal) OR EXISTS(SELECT 1 FROM public.iq_entry_leases WHERE scope=scope_key AND (reserved_until>now() OR signal_id=p_signal)) THEN RETURN NULL; END IF;
 SELECT coalesce(sum(profit),0),count(*) INTO pnl,n FROM public.operation_results WHERE signal_id LIKE 'copy-'||p_client::text||'-%' AND created_at>=day_start AND timeframe NOT IN ('TEST','MT5') AND iq_option_id ~ '^[0-9]+$';
 IF s.daily_limit_enabled AND n>=s.max_daily_trades THEN RETURN NULL; END IF;
 IF s.profit_target_type IN ('fixed','value') AND s.profit_target_value>0 AND pnl>=s.profit_target_value THEN RETURN NULL; END IF;
 INSERT INTO public.iq_entry_leases VALUES(scope_key,p_signal,now()+interval '2 minutes') ON CONFLICT(scope) DO UPDATE SET signal_id=p_signal,reserved_until=now()+interval '2 minutes';
 RETURN amount;
END; $function$;

REVOKE EXECUTE ON FUNCTION public.claim_takashi_after_226(text, uuid, numeric) FROM PUBLIC, anon, authenticated, service_role;
COMMENT ON FUNCTION public.claim_takashi_after_226(text, uuid, numeric) IS 'DEPRECATED: Takashi invertida replaced by Apos 4 LOSS on 2026-11-02; history preserved.';