CREATE OR REPLACE FUNCTION public.claim_trend_three_loss_put(p_candidate text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.operation_results%ROWTYPE; cfg public.iqoption_config%ROWTYPE; s public.user_trading_settings%ROWTYPE; qid text; stake numeric; n integer; pnl numeric;
 day_start timestamptz := date_trunc('day',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
BEGIN
 PERFORM pg_advisory_xact_lock(714062,3);
 SELECT * INTO c FROM public.operation_results WHERE signal_id=p_candidate AND signal_id LIKE 't7-%' AND timeframe='TEST' AND result='test7_open' FOR UPDATE;
 IF c.id IS NULL OR c.created_at<>date_trunc('minute',now()) OR now()>=c.created_at+interval '30 seconds' THEN RETURN NULL; END IF;
 -- Exactly one selected original signal in each of the three preceding minutes, all closed Trend losses.
 IF (SELECT count(*) FROM public.operation_results WHERE timeframe='TEST' AND signal_id LIKE 't7-%' AND created_at>=c.created_at-interval '3 minutes' AND created_at<c.created_at)<>3 THEN RETURN NULL; END IF;
 FOR n IN 1..3 LOOP
  IF (SELECT count(*) FROM public.operation_results WHERE timeframe='TEST' AND signal_id LIKE 't7-%' AND created_at=c.created_at-n*interval '1 minute' AND entry_strategy='TENDENCIA' AND result='loss' AND expiration_time<=now())<>1 THEN RETURN NULL; END IF;
 END LOOP;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 SELECT * INTO s FROM public.user_trading_settings WHERE user_id=cfg.user_id;
 IF cfg.id IS NULL OR NOT cfg.is_active OR cfg.last_connected_at IS NULL OR cfg.account_type NOT IN ('PRACTICE','REAL') OR s.id IS NULL OR NOT s.auto_trading_enabled OR s.trade_amount<=0 THEN RETURN NULL; END IF;
 qid:='tendencia_3_loss_put-'||c.id::text;
 IF EXISTS(SELECT 1 FROM public.trade_queue WHERE signal_id=qid) THEN RETURN NULL; END IF;
 -- Do not introduce extra simultaneous principal orders.
 IF EXISTS(SELECT 1 FROM public.iq_entry_leases WHERE scope LIKE 'master%' AND reserved_until>now()) OR EXISTS(SELECT 1 FROM public.operation_results WHERE iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND signal_id NOT LIKE 'copy-%' AND result IN ('pending','open')) OR EXISTS(SELECT 1 FROM public.trade_queue WHERE status IN ('pending','executing') AND timeframe NOT IN ('TEST','MT5') AND created_at>now()-interval '2 minutes') THEN RETURN NULL; END IF;
 SELECT coalesce(sum(profit),0),count(*) INTO pnl,n FROM public.operation_results WHERE created_at>=day_start AND timeframe NOT IN ('TEST','MT5') AND iq_option_id ~ '^[0-9]+$' AND signal_id NOT LIKE 'copy-%';
 IF s.daily_limit_enabled AND n>=s.max_daily_trades THEN RETURN NULL; END IF;
 IF s.profit_target_type IN ('fixed','value') AND s.profit_target_value>0 AND pnl>=s.profit_target_value THEN RETURN NULL; END IF;
 IF s.profit_target_type='percentage' AND s.profit_target_value>0 THEN RETURN NULL; END IF;
 stake:=public.reserve_iq_entry(NULL,qid);
 IF stake IS NULL OR stake<=0 THEN RETURN NULL; END IF;
 INSERT INTO public.trade_queue(asset,direction,amount,expiration,signal_id,timeframe,status,entry_strategy) VALUES(c.asset,'PUT',stake,1,qid,'M1','executing','TENDENCIA_3_LOSS_PUT');
 RETURN jsonb_build_object('signalId',qid,'asset',c.asset,'direction','put','amount',stake,'expiration',1,'timeframe','M1','entryStrategy','TENDENCIA_3_LOSS_PUT','entryAt',extract(epoch FROM c.created_at)*1000,'configId',cfg.id);
END; $$;
REVOKE ALL ON FUNCTION public.claim_trend_three_loss_put(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trend_three_loss_put(text) TO service_role;

CREATE OR REPLACE FUNCTION public.schedule_trend_three_loss_put()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE candidate text; credential text;
BEGIN
 IF NEW.timeframe IS DISTINCT FROM 'TEST' OR NEW.signal_id NOT LIKE 't7-%' THEN RETURN NEW; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.result<>'test7_open' OR NEW.created_at<>date_trunc('minute',now()) THEN RETURN NEW; END IF;
  candidate:=NEW.signal_id;
 ELSE
  IF NEW.entry_strategy<>'TENDENCIA' OR NEW.result<>'loss' OR OLD.result IS NOT DISTINCT FROM NEW.result OR NEW.created_at<>date_trunc('minute',now())-interval '1 minute' THEN RETURN NEW; END IF;
  SELECT signal_id INTO candidate FROM public.operation_results WHERE timeframe='TEST' AND signal_id LIKE 't7-%' AND created_at=date_trunc('minute',now()) AND result='test7_open' ORDER BY signal_id LIMIT 1;
 END IF;
 IF candidate IS NULL OR now()>=date_trunc('minute',now())+interval '30 seconds' THEN RETURN NEW; END IF;
 SELECT token INTO credential FROM public.anticipation_scheduler_auth WHERE id=1;
 IF credential IS NOT NULL THEN
  PERFORM net.http_post(url:='https://dkxgwmlycugsibvtbpsg.supabase.co/functions/v1/trend-three-loss-put',headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-token',credential),body:=jsonb_build_object('candidate',candidate),timeout_milliseconds:=45000);
 END IF;
 RETURN NEW;
END; $$;
REVOKE ALL ON FUNCTION public.schedule_trend_three_loss_put() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER trend_three_loss_put_dispatch AFTER INSERT OR UPDATE OF result ON public.operation_results FOR EACH ROW EXECUTE FUNCTION public.schedule_trend_three_loss_put();