CREATE OR REPLACE FUNCTION public.iq_entry_display_ids(p_ids uuid[])
RETURNS TABLE(operation_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
 SELECT o.id FROM public.operation_results o
 JOIN public.iq_demo_test_candidates c ON
   CASE WHEN o.signal_id LIKE 'copy-%' THEN substring(o.signal_id FROM 43) ELSE o.signal_id END = 'super_selecionada-v1-' || c.signal_id
 WHERE auth.uid() IS NOT NULL AND cardinality(p_ids) <= 1000 AND o.id = ANY(p_ids)
 AND ((o.signal_id NOT LIKE 'copy-%' AND public.has_role(auth.uid(), 'admin'))
   OR o.signal_id LIKE 'copy-' || auth.uid()::text || '-%')
 AND o.timeframe NOT IN ('TEST','MT5') AND o.iq_option_id ~ '^[0-9]+$'
 AND c.score::text NOT IN ('NaN','Infinity','-Infinity') AND floor(c.score * 100 + 0.5) = 226
$$;
REVOKE ALL ON FUNCTION public.iq_entry_display_ids(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.iq_entry_display_ids(uuid[]) TO authenticated, service_role;