DO $$
DECLARE def text;
BEGIN
 SELECT pg_get_functiondef(p.oid) INTO def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='claim_after_four_losses';
 def := replace(def, '''TAKASHI_BNF_V1'',''ICHIMOKU_RECUO21'',''ICHIMOKU'',''RECUO_EMA21''', '''TAKASHI_BNF_V1'',''ICHIMOKU_RECUO21'',''ICHIMOKU'',''RECUO_EMA21'',''TENDENCIA_FORCA_RECUO''');
 EXECUTE def;
END $$;
REVOKE ALL ON FUNCTION public.claim_after_four_losses(text, uuid, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_after_four_losses(text, uuid, numeric) TO service_role;