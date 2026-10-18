CREATE OR REPLACE FUNCTION public.claim_test_strategy_entry(p_candidate text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
 c public.operation_results%ROWTYPE;
 cfg public.iqoption_config%ROWTYPE;
 settings public.user_trading_settings%ROWTYPE;
 qid text; amount numeric; strategy text; final_direction text;
 day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
 daily_profit numeric; daily_count integer;
BEGIN
 PERFORM pg_advisory_xact_lock(714062, 3);
 SELECT * INTO c FROM public.operation_results WHERE signal_id=p_candidate AND timeframe='TEST' AND result='test7_open';
 IF c.id IS NULL OR c.created_at < now()-interval '30 seconds' OR c.created_at > now()
   OR date_trunc('minute', c.created_at) <> c.created_at OR c.direction NOT IN ('CALL','PUT') THEN RETURN NULL; END IF;
 IF c.entry_strategy='REVERSAO_RSI' THEN
   strategy := 'REVERSAO_RSI'; final_direction := c.direction;
 ELSIF c.test_sequence_strategy='TREND_WIN_LOSS_FORCE_LOSS' THEN
   strategy := 'RETOMADA'; final_direction := c.direction;
 ELSIF c.test_inverted_strategy='FORCA_INVERTIDA' THEN
   strategy := 'FORCA_INVERTIDA'; final_direction := CASE WHEN c.direction='CALL' THEN 'PUT' ELSE 'CALL' END;
 ELSE RETURN NULL; END IF;
 qid := lower(strategy) || '-' || c.id::text;
 -- Simultaneous entries allowed (user, Oct 18 2026); only block re-claiming the same candidate.
 IF EXISTS(SELECT 1 FROM public.trade_queue WHERE signal_id=qid) THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 SELECT * INTO settings FROM public.user_trading_settings WHERE user_id=cfg.user_id LIMIT 1;
 IF cfg.id IS NULL OR settings.id IS NULL OR NOT settings.auto_trading_enabled THEN RETURN NULL; END IF;
 SELECT coalesce(sum(profit),0),count(*) INTO daily_profit,daily_count FROM public.operation_results WHERE created_at>=day_start AND timeframe NOT IN ('TEST','MT5') AND iq_option_id IS NOT NULL;
 IF settings.daily_limit_enabled AND daily_count>=settings.max_daily_trades THEN RETURN NULL; END IF;
 IF settings.profit_target_type IN ('fixed','value') AND settings.profit_target_value>0 AND daily_profit>=settings.profit_target_value THEN RETURN NULL; END IF;
 amount := settings.trade_amount;
 IF amount IS NULL OR amount<=0 THEN RETURN NULL; END IF;
 INSERT INTO public.trade_queue(asset,direction,amount,expiration,signal_id,timeframe,status,entry_strategy)
 VALUES(c.asset,final_direction,amount,1,qid,'M1','executing',strategy);
 RETURN jsonb_build_object('signalId',qid,'asset',c.asset,'direction',lower(final_direction),'amount',amount,'expiration',1,'timeframe','M1','isAutoTrade',true,'isAIAnalyzed',false,'entryStrategy',strategy);
END;
$function$;