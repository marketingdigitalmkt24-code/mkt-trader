CREATE OR REPLACE FUNCTION public.claim_test_strategy_entry(p_candidate text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE c public.operation_results%ROWTYPE; cfg public.iqoption_config%ROWTYPE; settings public.user_trading_settings%ROWTYPE;
 qid text; amount numeric; strategy text; final_direction text;
 day_start timestamptz := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
 daily_profit numeric; daily_count integer;
BEGIN
 PERFORM pg_advisory_xact_lock(714062,3);
 SELECT * INTO c FROM public.operation_results WHERE signal_id=p_candidate AND timeframe='TEST' AND result='test7_open';
 IF c.id IS NULL OR c.created_at<now()-interval '30 seconds' OR c.created_at>now() OR date_trunc('minute',c.created_at)<>c.created_at OR c.direction NOT IN ('CALL','PUT') THEN RETURN NULL; END IF;
 -- Estrategias reais (21/10/2026): apenas Recuo na media 21 e Retomada; Reversao RSI virou TESTE.
 IF c.entry_strategy='RECUO_EMA21' THEN strategy:='RECUO_EMA21'; final_direction:=c.direction;
 ELSIF c.test_sequence_strategy='TREND_WIN_LOSS_FORCE_LOSS' THEN strategy:='RETOMADA'; final_direction:=c.direction;
 ELSE RETURN NULL; END IF;
 -- Uma operacao por estrategia: Recuo e Retomada podem entrar simultaneas.
 PERFORM pg_advisory_xact_lock(hashtextextended('master:'||strategy,0));
 IF EXISTS(SELECT 1 FROM public.iq_entry_leases WHERE scope='master:'||lower(strategy) AND reserved_until>now())
  OR EXISTS(SELECT 1 FROM public.operation_results WHERE iq_option_id ~ '^[0-9]+$' AND timeframe NOT IN ('TEST','MT5') AND signal_id NOT LIKE 'copy-%' AND result IN ('pending','open') AND entry_strategy=strategy)
  OR EXISTS(SELECT 1 FROM public.trade_queue WHERE status IN ('pending','executing') AND timeframe NOT IN ('TEST','MT5') AND entry_strategy=strategy AND created_at>now()-interval '2 minutes') THEN RETURN NULL; END IF;
 qid:=lower(strategy)||'-'||c.id::text;
 IF EXISTS(SELECT 1 FROM public.trade_queue WHERE signal_id=qid) THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 SELECT * INTO settings FROM public.user_trading_settings WHERE user_id=cfg.user_id LIMIT 1;
 IF cfg.id IS NULL OR settings.id IS NULL OR NOT settings.auto_trading_enabled THEN RETURN NULL; END IF;
 SELECT coalesce(sum(profit),0),count(*) INTO daily_profit,daily_count FROM public.operation_results WHERE created_at>=day_start AND timeframe NOT IN ('TEST','MT5') AND iq_option_id ~ '^[0-9]+$' AND signal_id NOT LIKE 'copy-%';
 IF settings.daily_limit_enabled AND daily_count>=settings.max_daily_trades THEN RETURN NULL; END IF;
 IF settings.profit_target_type IN ('fixed','value') AND settings.profit_target_value>0 AND daily_profit>=settings.profit_target_value THEN RETURN NULL; END IF;
 amount:=settings.trade_amount; IF amount IS NULL OR amount<=0 THEN RETURN NULL; END IF;
 INSERT INTO public.trade_queue(asset,direction,amount,expiration,signal_id,timeframe,status,entry_strategy) VALUES(c.asset,final_direction,amount,1,qid,'M1','executing',strategy);
 RETURN jsonb_build_object('signalId',qid,'asset',c.asset,'direction',lower(final_direction),'amount',amount,'expiration',1,'timeframe','M1','isAutoTrade',true,'isAIAnalyzed',false,'entryStrategy',strategy);
END; $function$;

CREATE OR REPLACE FUNCTION public.reserve_iq_entry(p_client uuid, p_signal text)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE scope_key text; amount numeric; cfg public.iqoption_config%ROWTYPE; client_cfg public.iqoption_config%ROWTYPE; master_strategy text;
BEGIN
 IF p_signal IS NULL OR p_signal='' THEN RETURN NULL; END IF;
 SELECT * INTO cfg FROM public.get_master_iq_config();
 IF cfg.id IS NULL THEN RETURN NULL; END IF;
 IF p_client IS NULL THEN
  -- Trava do principal por estrategia (prefixo do sinal): Recuo e Retomada simultaneas.
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
 END IF;
 IF amount IS NULL OR amount<=0 OR amount::text IN ('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
 IF EXISTS(SELECT 1 FROM public.iq_entry_leases WHERE scope=scope_key AND (reserved_until>now() OR signal_id=p_signal)) THEN RETURN NULL; END IF;
 INSERT INTO public.iq_entry_leases VALUES(scope_key,p_signal,now()+interval '2 minutes') ON CONFLICT(scope) DO UPDATE SET signal_id=p_signal, reserved_until=now()+interval '2 minutes';
 RETURN amount;
END; $function$;