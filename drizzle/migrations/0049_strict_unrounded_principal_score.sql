DO $do$
DECLARE src text;
BEGIN
 SELECT pg_get_functiondef('public.claim_super_selected(text,uuid,numeric)'::regprocedure) INTO src;
 IF position('floor(c.score * 100 + 0.5) <> 226' in src) = 0 THEN RAISE EXCEPTION 'Existing principal score gate not found'; END IF;
 src := replace(src, 'floor(c.score * 100 + 0.5) <> 226', 'c.score <> 2.26::double precision');
 EXECUTE src;
END $do$;
COMMENT ON FUNCTION public.claim_super_selected(text,uuid,numeric) IS 'Service-only fresh principal claim: raw calculated score must equal exactly 2.26, never rounded; original limits and reservations preserved.';