CREATE OR REPLACE FUNCTION public.claim_force_loss_win(p_candidate text) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$ SELECT NULL::jsonb $$;
REVOKE ALL ON FUNCTION public.claim_force_loss_win(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_force_loss_win(text) TO service_role;
COMMENT ON FUNCTION public.claim_force_loss_win(text) IS 'DEPRECATED: Forca LOSS WIN removed; always returns null, never authorizes orders.';
COMMENT ON TABLE public.iq_force_loss_win_state IS 'DEPRECATED: retired strategy state retained for historical integrity.';