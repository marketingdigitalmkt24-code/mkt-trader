DO $$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='claim_after_four_losses';
 IF position('LIMIT 4) x;' in def)=0 OR position('coalesce(losses,0)<>4 OR newest_level IS DISTINCT FROM 3' in def)=0 THEN RAISE EXCEPTION 'claim_after_four_losses streak text not found'; END IF;
 def := replace(def,'LIMIT 4) x;','LIMIT 5) x;');
 def := replace(def,'coalesce(losses,0)<>4 OR newest_level IS DISTINCT FROM 3','coalesce(losses,0)<>5 OR newest_level IS DISTINCT FROM 4');
 EXECUTE def;
END $$;
REVOKE ALL ON FUNCTION public.claim_after_four_losses(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_after_four_losses(text, uuid, numeric) TO service_role;