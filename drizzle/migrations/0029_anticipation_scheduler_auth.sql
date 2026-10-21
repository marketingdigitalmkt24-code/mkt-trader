CREATE TABLE public.anticipation_scheduler_auth (id integer PRIMARY KEY CHECK(id=1), token text NOT NULL DEFAULT (gen_random_uuid()::text || gen_random_uuid()::text));
GRANT ALL ON public.anticipation_scheduler_auth TO service_role;
ALTER TABLE public.anticipation_scheduler_auth ENABLE ROW LEVEL SECURITY;
COMMENT ON TABLE public.anticipation_scheduler_auth IS 'Service-only credential for the isolated anticipation minute job; no client access.';