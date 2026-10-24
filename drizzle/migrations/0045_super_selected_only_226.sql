DO $do$
DECLARE src text;
BEGIN
 SELECT pg_get_functiondef('public.claim_super_selected(text,uuid,numeric)'::regprocedure) INTO src;
 src := replace(src, 'NOT ((c.score >= 4.0 AND c.score < 4.5) OR floor(c.score * 100 + 0.5) = 226)', 'floor(c.score * 100 + 0.5) <> 226');
 IF position('floor(c.score * 100 + 0.5) <> 226' in src) = 0 THEN RAISE EXCEPTION 'score gate not found'; END IF;
 EXECUTE src;
END $do$;