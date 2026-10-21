CREATE OR REPLACE FUNCTION public.claim_force_anticipation_entry(p_signal text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.force_anticipation_tests%ROWTYPE; cfg public.iqoption_config%ROWTYPE; s public.user_trading_settings%ROWTYPE; qid text; daily_profit numeric; daily_count integer;
 day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
 PERFORM pg_advisory_xact_lock(714062,3);
 PERFORM pg_advisory_xact_lock(hashtextextended('master:forca_antecipada',0));
 SELECT * INTO c FROM public.force_anticipation_tests WHERE signal_id=p_signal FOR UPDATE;
 IF c.id IS NULL OR c.result<>'open' OR c.direction NOT IN ('CALL','PUT') OR c.entry_price<=0 OR c.entry_minute<>date_trunc('minute',now()) OR c.created_at<c.entry_minute OR c.created_at>now() OR now()>=c.entry_minute+interval '30 seconds' OR c.expiration_time<>c.entry_minute+interval '1 minute' THEN RETURN NULL; END IF;
 qid:='forca_antecipada-'||c.id::text;
 IF EXISTS(SELECT 1 FROM public.trade_queue WHERE signal_id=qid) OR EXISTS(SELECT 1 FROM public.iq_entry_leases WHERE scope LIKE 'master%' AND reserved_until>now()) OR EXISTS(SELECT 1 FROM public.operation_results WHERE iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND signal_id NOT LIKE 'copy-%' AND result IN ('pending','open')) OR EXISTS(SELECT 1 FROM public.trade_queue WHERE status IN ('pending','executing') AND timeframe NOT IN ('TEST','MT5') AND created_at>now()-interval '2 minutes') THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 SELECT * INTO s FROM public.user_trading_settings WHERE user_id=cfg.user_id LIMIT 1;
 IF cfg.id IS NULL OR cfg.account_type NOT IN ('PRACTICE','REAL') OR s.id IS NULL OR NOT s.auto_trading_enabled OR s.trade_amount<=0 THEN RETURN NULL; END IF;
 SELECT coalesce(sum(profit),0),count(*) INTO daily_profit,daily_count FROM public.operation_results WHERE created_at>=day_start AND timeframe NOT IN ('TEST','MT5') AND iq_option_id ~ '^[0-9]+$' AND signal_id NOT LIKE 'copy-%';
 IF s.daily_limit_enabled AND daily_count>=s.max_daily_trades THEN RETURN NULL; END IF;
 IF s.profit_target_type IN ('fixed','value') AND s.profit_target_value>0 AND daily_profit>=s.profit_target_value THEN RETURN NULL; END IF;
 -- Percentage targets need a verified account balance; do not bypass them.
 IF s.profit_target_type='percentage' AND s.profit_target_value>0 THEN RETURN NULL; END IF;
 INSERT INTO public.trade_queue(asset,direction,amount,expiration,signal_id,timeframe,status,entry_strategy) VALUES(c.asset,c.direction,s.trade_amount,1,qid,'M1','executing','FORCA_ANTECIPADA');
 RETURN jsonb_build_object('signalId',qid,'asset',c.asset,'direction',lower(c.direction),'amount',s.trade_amount,'expiration',1,'timeframe','M1','isAutoTrade',true,'isAIAnalyzed',false,'entryStrategy','FORCA_ANTECIPADA','entryAt',extract(epoch FROM c.entry_minute)*1000);
END; $$;
REVOKE ALL ON FUNCTION public.claim_force_anticipation_entry(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_force_anticipation_entry(text) TO service_role;
COMMENT ON FUNCTION public.claim_force_anticipation_entry(text) IS 'Fresh server-observed anticipation only, current minute, principal settings and single principal exclusion; no historical promotion.';