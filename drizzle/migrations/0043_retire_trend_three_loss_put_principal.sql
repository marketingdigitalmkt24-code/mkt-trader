DROP TRIGGER IF EXISTS trend_three_loss_put_dispatch ON public.operation_results;
CREATE OR REPLACE FUNCTION public.claim_trend_three_loss_put(p_candidate text)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  -- Retired (user, Oct 24 2026): only Super selecionada opens real principal entries.
  SELECT NULL::jsonb
$$;
REVOKE ALL ON FUNCTION public.claim_trend_three_loss_put(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_trend_three_loss_put(text) TO service_role;