CREATE OR REPLACE FUNCTION public.claim_after_signal_sequence(p_candidate text, p_config uuid, p_balance numeric)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE c public.iq_demo_test_candidates%ROWTYPE; cfg public.iqoption_config%ROWTYPE; s public.user_trading_settings%ROWTYPE; qid text; stake numeric; n integer; pnl numeric; seq text; cnt integer; act text; dir text;
 day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
 scope_key text := 'master:sequencia_3_sinais';
BEGIN
 PERFORM pg_advisory_xact_lock(714062,5);
 SELECT * INTO c FROM public.iq_demo_test_candidates WHERE signal_id=p_candidate FOR UPDATE;
 IF c.signal_id IS NULL OR c.entry_strategy NOT IN ('TAKASHI_BNF_V1','ICHIMOKU_RECUO21','ICHIMOKU','RECUO_EMA21','TENDENCIA_FORCA_RECUO','TENDENCIA','VELA_FORCA','ROMPIMENTO','REVERSAO_RSI','KDJ') OR c.direction NOT IN ('CALL','PUT') OR c.entry_minute<>date_trunc('minute',now()) OR now()>=c.entry_minute+interval '30 seconds' THEN RETURN NULL; END IF;
 SELECT count(*), string_agg(x.entry_strategy||':'||upper(x.direction)||':'||lower(x.result),'|' ORDER BY x.entry_minute ASC) INTO cnt, seq
 FROM (SELECT o.entry_strategy,o.direction,o.result,o.entry_minute FROM public.iq_demo_test_orders o
  WHERE o.status='confirmed' AND o.account_type IN ('PRACTICE','REAL') AND o.entry_strategy IN ('TAKASHI_BNF_V1','ICHIMOKU_RECUO21','ICHIMOKU','RECUO_EMA21','TENDENCIA_FORCA_RECUO','TENDENCIA','VELA_FORCA','ROMPIMENTO','REVERSAO_RSI','KDJ') AND o.entry_minute<c.entry_minute
  ORDER BY o.entry_minute DESC LIMIT 3) x;
 IF cnt<>3 THEN RETURN NULL; END IF;
 act := CASE seq
  WHEN 'RECUO_EMA21:CALL:loss|TENDENCIA_FORCA_RECUO:PUT:win|RECUO_EMA21:CALL:loss' THEN 'inverted'
  WHEN 'RECUO_EMA21:PUT:loss|TENDENCIA_FORCA_RECUO:PUT:loss|RECUO_EMA21:CALL:win' THEN 'follow'
  WHEN 'ICHIMOKU_RECUO21:PUT:win|TENDENCIA_FORCA_RECUO:CALL:loss|ICHIMOKU_RECUO21:PUT:win' THEN 'follow'
  WHEN 'RECUO_EMA21:CALL:win|TENDENCIA_FORCA_RECUO:CALL:win|RECUO_EMA21:CALL:loss' THEN 'inverted'
  WHEN 'RECUO_EMA21:CALL:loss|TENDENCIA_FORCA_RECUO:PUT:loss|RECUO_EMA21:CALL:win' THEN 'follow'
  WHEN 'RECUO_EMA21:CALL:win|TENDENCIA_FORCA_RECUO:CALL:loss|RECUO_EMA21:CALL:win' THEN 'follow'
  WHEN 'RECUO_EMA21:CALL:win|TENDENCIA_FORCA_RECUO:PUT:win|RECUO_EMA21:PUT:loss' THEN 'inverted'
  WHEN 'RECUO_EMA21:PUT:win|TENDENCIA_FORCA_RECUO:CALL:loss|RECUO_EMA21:PUT:win' THEN 'follow'
  WHEN 'RECUO_EMA21:CALL:win|TENDENCIA_FORCA_RECUO:PUT:loss|ICHIMOKU_RECUO21:CALL:win' THEN 'follow'
  WHEN 'RECUO_EMA21:PUT:win|TENDENCIA_FORCA_RECUO:PUT:win|RECUO_EMA21:PUT:loss' THEN 'inverted'
  WHEN 'RECUO_EMA21:CALL:win|TENDENCIA_FORCA_RECUO:PUT:win|ICHIMOKU_RECUO21:PUT:loss' THEN 'inverted'
  ELSE NULL END;
 IF act IS NULL THEN RETURN NULL; END IF;
 dir := CASE WHEN act='follow' THEN c.direction WHEN c.direction='CALL' THEN 'PUT' ELSE 'CALL' END;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 SELECT * INTO s FROM public.user_trading_settings WHERE user_id=cfg.user_id;
 IF cfg.id IS NULL OR cfg.id<>p_config OR NOT cfg.is_active OR cfg.last_connected_at IS NULL OR cfg.account_type NOT IN ('PRACTICE','REAL') OR s.id IS NULL OR NOT s.auto_trading_enabled OR s.trade_amount<=0 OR s.trade_amount::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
 qid:='sequencia-3-v1-'||c.signal_id;
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
 INSERT INTO public.trade_queue(asset,direction,amount,expiration,signal_id,timeframe,status,entry_strategy) VALUES(c.asset,dir,stake,1,qid,'M1','executing','SEQUENCIA_3_SINAIS');
 RETURN jsonb_build_object('signalId',qid,'asset',c.asset,'direction',lower(dir),'amount',stake,'expiration',1,'timeframe','M1','entryStrategy','SEQUENCIA_3_SINAIS','entryAt',extract(epoch FROM c.entry_minute)*1000,'configId',cfg.id);
END; $function$;
REVOKE ALL ON FUNCTION public.claim_after_signal_sequence(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_after_signal_sequence(text, uuid, numeric) TO service_role;

DO $$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='reserve_iq_entry';
 IF position('principal_strategy := ''APOS_4_LOSS'';' in def)=0 THEN RAISE EXCEPTION 'reserve_iq_entry text not found'; END IF;
 def := replace(def,'principal_strategy := ''APOS_4_LOSS'';','principal_strategy := ''APOS_4_LOSS''; ELSIF left(principal_signal, length(''sequencia-3-v1-'')) = ''sequencia-3-v1-'' THEN principal_strategy := ''SEQUENCIA_3_SINAIS'';');
 EXECUTE def;
END $$;