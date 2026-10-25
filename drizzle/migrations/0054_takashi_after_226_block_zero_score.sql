DO $$
DECLARE d text;
BEGIN
 d := pg_get_functiondef('public.claim_takashi_after_226'::regproc);
 d := replace(d, 'c.entry_strategy<>''TAKASHI_BNF_V1'' OR', 'c.entry_strategy<>''TAKASHI_BNF_V1'' OR c.score::text IN (''NaN'',''Infinity'',''-Infinity'') OR round(c.score::numeric,2)=0 OR');
 IF position('round(c.score::numeric,2)=0' in d)=0 THEN RAISE EXCEPTION 'guard not applied'; END IF;
 EXECUTE d;
END $$;