CREATE UNIQUE INDEX iq_demo_test_broker_id ON public.iq_demo_test_orders(iq_option_id) WHERE iq_option_id IS NOT NULL;
CREATE OR REPLACE FUNCTION public.schedule_iq_demo_test()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,net AS $$
DECLARE credential text;
BEGIN
 IF NEW.timeframe <> 'TEST' OR NEW.signal_id NOT LIKE 't7-%' THEN RETURN NEW; END IF;
 IF TG_OP = 'INSERT' AND (NEW.created_at < now()-interval '25 seconds' OR NEW.created_at > now()) THEN RETURN NEW; END IF;
 IF TG_OP = 'UPDATE' AND NEW.result IS NOT DISTINCT FROM OLD.result THEN RETURN NEW; END IF;
 SELECT token INTO credential FROM public.anticipation_scheduler_auth WHERE id=1;
 IF credential IS NOT NULL THEN
 PERFORM net.http_post(url:='https://dkxgwmlycugsibvtbpsg.supabase.co/functions/v1/iqoption-demo-tests',headers:=jsonb_build_object('Content-Type','application/json','x-scheduler-token',credential),body:=CASE WHEN TG_OP='INSERT' THEN jsonb_build_object('candidate',NEW.signal_id) ELSE '{}'::jsonb END,timeout_milliseconds:=45000);
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.schedule_iq_demo_test() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER iq_demo_test_dispatch AFTER INSERT OR UPDATE OF result ON public.operation_results FOR EACH ROW EXECUTE FUNCTION public.schedule_iq_demo_test();