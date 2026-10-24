CREATE OR REPLACE FUNCTION public.claim_selected_demo_trend(p_candidate text, p_config uuid, p_balance numeric)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.iq_demo_test_candidates%ROWTYPE; cfg public.iqoption_config%ROWTYPE; s public.user_trading_settings%ROWTYPE; qid text; stake numeric; n integer; pnl numeric; strategy text; entry_direction text;
 day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
 PERFORM pg_advisory_xact_lock(714062,3);
 SELECT * INTO c FROM public.iq_demo_test_candidates WHERE signal_id=p_candidate FOR UPDATE;
 IF c.signal_id IS NULL OR c.direction NOT IN ('CALL','PUT') OR c.entry_minute<>date_trunc('minute',now()) OR now()>=c.entry_minute+interval '30 seconds' THEN RETURN NULL; END IF;
 IF c.entry_strategy='QUEDA_WIN_RETRY_V1' THEN
  IF c.direction<>'CALL' OR c.signal_id NOT LIKE 'queda-win-retry-v1-%' OR NOT EXISTS(SELECT 1 FROM public.iq_demo_test_orders WHERE entry_strategy='QUEDA_WIN_CALL_V1' AND entry_minute=c.entry_minute-interval '1 minute' AND asset=c.asset AND direction='CALL' AND status='confirmed' AND iq_option_id ~ '^[0-9]+$' AND result='loss') THEN RETURN NULL; END IF;
  strategy:='QUEDA_WIN_RETRY_V1'; entry_direction:='CALL'; qid:='queda_win_retry_v1-principal-'||c.signal_id;
 ELSIF c.entry_strategy='TENDENCIA' AND c.signal_id LIKE 't7-%-TENDENCIA-%' THEN
  -- Normal Trend is retired; only the separately authorized inverted sequence may claim.
  IF NOT EXISTS(SELECT 1 FROM public.iq_demo_test_orders WHERE entry_strategy='TENDENCIA' AND entry_minute=c.entry_minute-interval '1 minute' AND status='confirmed' AND iq_option_id ~ '^[0-9]+$' AND result='win') THEN RETURN NULL; END IF;
  strategy:='TENDENCIA_WIN_INVERTIDA'; entry_direction:=CASE c.direction WHEN 'CALL' THEN 'PUT' ELSE 'CALL' END;
  qid:='tendencia_win_invertida-v1-'||c.signal_id;
 ELSE RETURN NULL;
 END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 SELECT * INTO s FROM public.user_trading_settings WHERE user_id=cfg.user_id;
 IF cfg.id IS NULL OR cfg.id<>p_config OR NOT cfg.is_active OR cfg.last_connected_at IS NULL OR cfg.account_type NOT IN ('PRACTICE','REAL') OR s.id IS NULL OR NOT s.auto_trading_enabled OR s.trade_amount<=0 THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.trade_queue WHERE signal_id IN (qid,'tendencia-demo-v1-'||c.signal_id,'tendencia_win_invertida-v1-'||c.signal_id)) THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.iq_entry_leases WHERE scope LIKE 'master%' AND reserved_until>now()) OR EXISTS(SELECT 1 FROM public.operation_results WHERE iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND signal_id NOT LIKE 'copy-%' AND result IN ('pending','open')) OR EXISTS(SELECT 1 FROM public.trade_queue WHERE status IN ('pending','executing') AND timeframe NOT IN ('TEST','MT5') AND created_at>now()-interval '2 minutes') THEN RETURN NULL; END IF;
 SELECT coalesce(sum(profit),0),count(*) INTO pnl,n FROM public.operation_results WHERE created_at>=day_start AND timeframe NOT IN ('TEST','MT5') AND iq_option_id ~ '^[0-9]+$' AND signal_id NOT LIKE 'copy-%';
 IF s.daily_limit_enabled AND n>=s.max_daily_trades THEN RETURN NULL; END IF;
 IF s.profit_target_type IN ('fixed','value') AND s.profit_target_value>0 AND pnl>=s.profit_target_value THEN RETURN NULL; END IF;
 IF s.profit_target_type='percentage' AND s.profit_target_value>0 THEN
  IF p_balance IS NULL OR p_balance<=0 OR p_balance::text IN ('NaN','Infinity','-Infinity') OR p_balance-pnl<=0 OR pnl>=(p_balance-pnl)*s.profit_target_value/100 THEN RETURN NULL; END IF;
 END IF;
 stake:=public.reserve_iq_entry(NULL,qid);
 IF stake IS NULL OR stake<=0 THEN RETURN NULL; END IF;
 INSERT INTO public.trade_queue(asset,direction,amount,expiration,signal_id,timeframe,status,entry_strategy) VALUES(c.asset,entry_direction,stake,1,qid,'M1','executing',strategy);
 RETURN jsonb_build_object('signalId',qid,'asset',c.asset,'direction',lower(entry_direction),'amount',stake,'expiration',1,'timeframe','M1','entryStrategy',strategy,'entryAt',extract(epoch FROM c.entry_minute)*1000,'configId',cfg.id);
END; $$;
REVOKE ALL ON FUNCTION public.claim_selected_demo_trend(text,uuid,numeric) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_selected_demo_trend(text,uuid,numeric) TO service_role;