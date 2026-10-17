CREATE TABLE public.iq_three_force_state (id integer PRIMARY KEY DEFAULT 1 CHECK(id=1), activated_at timestamptz NOT NULL DEFAULT now(), consumed_through timestamptz NOT NULL DEFAULT now());
GRANT ALL ON public.iq_three_force_state TO service_role;
ALTER TABLE public.iq_three_force_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service manages three force state" ON public.iq_three_force_state FOR ALL TO service_role USING(true) WITH CHECK(true);
CREATE OR REPLACE FUNCTION public.claim_three_force(p_candidate text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $function$
DECLARE s public.iq_three_force_state%ROWTYPE; c public.operation_results%ROWTYPE; cfg public.iqoption_config%ROWTYPE; settings public.user_trading_settings%ROWTYPE; recent public.operation_results%ROWTYPE; i integer:=0; paused text[]; last_loss timestamptz; daily_profit numeric; daily_count integer; qid text; amount numeric; day_start timestamptz:=date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
 PERFORM pg_advisory_xact_lock(714062,1);
 INSERT INTO public.iq_three_force_state(id) VALUES(1) ON CONFLICT DO NOTHING;
 SELECT * INTO s FROM public.iq_three_force_state WHERE id=1 FOR UPDATE;
 SELECT * INTO c FROM public.operation_results WHERE signal_id=p_candidate AND timeframe='TEST' AND result='test7_open';
 IF c.id IS NULL OR c.created_at<=s.consumed_through OR c.created_at<now()-interval '30 seconds' OR c.created_at>now() OR date_trunc('minute',c.created_at)<>c.created_at OR c.direction NOT IN ('CALL','PUT') THEN RETURN NULL; END IF;
 FOR recent IN SELECT * FROM public.operation_results WHERE timeframe='TEST' AND created_at<c.created_at ORDER BY created_at DESC,id DESC LIMIT 3 LOOP
  i:=i+1;
  IF recent.entry_strategy IS DISTINCT FROM 'VELA_FORCA' OR recent.created_at<>c.created_at-make_interval(mins=>i) OR recent.created_at<=s.activated_at OR recent.created_at<=s.consumed_through THEN RETURN NULL; END IF;
 END LOOP;
 IF i<>3 THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.trade_queue WHERE status IN ('pending','executing')) OR EXISTS(SELECT 1 FROM public.operation_results WHERE timeframe NOT IN ('TEST','MT5') AND result IN ('pending','open') AND iq_option_id IS NOT NULL) THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 SELECT * INTO settings FROM public.user_trading_settings WHERE user_id=cfg.user_id LIMIT 1;
 IF cfg.id IS NULL OR settings.id IS NULL OR NOT settings.auto_trading_enabled THEN RETURN NULL; END IF;
 IF settings.use_dynamic_stake OR (settings.profit_target_type='percentage' AND settings.profit_target_value>0) THEN RETURN NULL; END IF;
 SELECT coalesce(sum(profit),0),count(*) INTO daily_profit,daily_count FROM public.operation_results WHERE created_at>=day_start AND timeframe NOT IN ('TEST','MT5') AND iq_option_id IS NOT NULL;
 IF settings.daily_limit_enabled AND daily_count>=settings.max_daily_trades THEN RETURN NULL; END IF;
 IF settings.profit_target_type IN ('fixed','value') AND settings.profit_target_value>0 AND daily_profit>=settings.profit_target_value THEN RETURN NULL; END IF;
 SELECT array_agg(result ORDER BY created_at DESC),max(created_at) INTO paused,last_loss FROM (SELECT result,created_at FROM public.operation_results WHERE asset=c.asset AND timeframe NOT IN ('TEST','MT5') AND iq_option_id IS NOT NULL AND result IN ('win','loss','tie') ORDER BY created_at DESC LIMIT 2) r;
 IF paused=ARRAY['loss','loss'] AND last_loss>now()-interval '30 minutes' THEN RETURN NULL; END IF;
 amount:=settings.trade_amount; IF amount IS NULL OR amount<=0 THEN RETURN NULL; END IF;
 qid:='threeforce-'||c.id::text;
 INSERT INTO public.trade_queue(asset,direction,amount,expiration,signal_id,timeframe,status,entry_strategy) VALUES(c.asset,c.direction,amount,1,qid,'M1','executing','THREE_FORCE');
 UPDATE public.iq_three_force_state SET consumed_through=c.created_at WHERE id=1;
 RETURN jsonb_build_object('signalId',qid,'asset',c.asset,'direction',lower(c.direction),'amount',amount,'expiration',1,'timeframe','M1','isAutoTrade',true,'isAIAnalyzed',false,'entryStrategy','THREE_FORCE');
END;$function$;
REVOKE ALL ON FUNCTION public.claim_three_force(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_three_force(text) TO service_role;