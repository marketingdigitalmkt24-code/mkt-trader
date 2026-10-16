CREATE OR REPLACE FUNCTION public.claim_four_win_reversal(p_candidate text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
 s public.iq_four_win_state%ROWTYPE;
 c public.operation_results%ROWTYPE;
 cfg public.iqoption_config%ROWTYPE;
 settings public.user_trading_settings%ROWTYPE;
 recent text[];
 paused text[];
 last_loss timestamptz;
 qid text;
 amount numeric;
 day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
 daily_profit numeric;
 daily_count integer;
BEGIN
 PERFORM pg_advisory_xact_lock(714062, 1);
 SELECT * INTO s FROM public.iq_four_win_state WHERE id=1 FOR UPDATE;
 SELECT * INTO c FROM public.operation_results WHERE signal_id=p_candidate AND timeframe='TEST' AND result='test7_open';
 IF s.id IS NULL OR c.id IS NULL OR c.created_at <= s.consumed_through OR c.created_at < now()-interval '60 seconds' OR c.direction NOT IN ('CALL','PUT') THEN RETURN NULL; END IF;
 SELECT array_agg(result ORDER BY created_at DESC) INTO recent FROM (
  SELECT result,created_at FROM public.operation_results WHERE timeframe='TEST' AND created_at>s.consumed_through AND created_at<c.created_at ORDER BY created_at DESC,id DESC LIMIT 4
 ) r;
 IF cardinality(recent) IS DISTINCT FROM 4 OR recent <> ARRAY['win','win','win','win'] THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.trade_queue WHERE status IN ('pending','executing')) OR EXISTS(SELECT 1 FROM public.operation_results WHERE timeframe NOT IN ('TEST','MT5') AND result IN ('pending','open') AND iq_option_id IS NOT NULL) THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.iqoption_config WHERE is_active AND user_id IS NOT NULL ORDER BY last_connected_at DESC NULLS LAST LIMIT 1;
 SELECT * INTO settings FROM public.user_trading_settings WHERE user_id=cfg.user_id LIMIT 1;
 IF cfg.id IS NULL OR settings.id IS NULL OR NOT settings.auto_trading_enabled THEN RETURN NULL; END IF;
 -- Fail closed rather than ignore balance-dependent limits or silently change a dynamic stake.
 IF settings.use_dynamic_stake OR (settings.profit_target_type='percentage' AND settings.profit_target_value>0) THEN RETURN NULL; END IF;
 SELECT coalesce(sum(profit),0),count(*) INTO daily_profit,daily_count FROM public.operation_results WHERE created_at>=day_start AND timeframe NOT IN ('TEST','MT5') AND iq_option_id IS NOT NULL;
 IF settings.daily_limit_enabled AND daily_count>=settings.max_daily_trades THEN RETURN NULL; END IF;
 IF settings.profit_target_type IN ('fixed','value') AND settings.profit_target_value>0 AND daily_profit>=settings.profit_target_value THEN RETURN NULL; END IF;
 SELECT array_agg(result ORDER BY created_at DESC),max(created_at) INTO paused,last_loss FROM (
  SELECT result,created_at FROM public.operation_results WHERE asset=c.asset AND timeframe NOT IN ('TEST','MT5') AND iq_option_id IS NOT NULL AND result IN ('win','loss','tie') ORDER BY created_at DESC LIMIT 2
 ) r;
 IF paused=ARRAY['loss','loss'] AND last_loss>now()-interval '30 minutes' THEN RETURN NULL; END IF;
 amount := settings.trade_amount;
 IF amount IS NULL OR amount<=0 THEN RETURN NULL; END IF;
 qid := 'fourwin-' || c.id::text;
 INSERT INTO public.trade_queue(asset,direction,amount,expiration,signal_id,timeframe,status,entry_strategy)
 VALUES(c.asset,CASE WHEN c.direction='CALL' THEN 'PUT' ELSE 'CALL' END,amount,1,qid,'M1','executing','FOUR_WIN_REVERSAL');
 UPDATE public.iq_four_win_state SET consumed_through=c.created_at WHERE id=1;
 RETURN jsonb_build_object('signalId',qid,'asset',c.asset,'direction',CASE WHEN c.direction='CALL' THEN 'put' ELSE 'call' END,'amount',amount,'expiration',1,'timeframe','M1','isAutoTrade',true,'isAIAnalyzed',false,'entryStrategy','FOUR_WIN_REVERSAL');
END;
$$;
REVOKE ALL ON FUNCTION public.claim_four_win_reversal(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_four_win_reversal(text) TO service_role;