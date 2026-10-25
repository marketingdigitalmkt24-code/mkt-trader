CREATE OR REPLACE FUNCTION public.clear_iq_today_entries()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_start timestamptz := date_trunc('day', v_now AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo';
  v_count integer;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'Admin authorization required' USING ERRCODE = '42501';
  END IF;
  DELETE FROM public.operation_results
    WHERE timeframe NOT IN ('TEST', 'MT5')
      AND signal_id NOT LIKE 'mt5-%'
      AND created_at >= v_start AND created_at <= v_now;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
REVOKE ALL ON FUNCTION public.clear_iq_today_entries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_iq_today_entries() TO authenticated;
COMMENT ON FUNCTION public.clear_iq_today_entries() IS 'Admin-only permanent deletion of today BRT principal and client IQ entries; daily results derive from the same rows; TEST/MT5 and separate Demo remain untouched.';