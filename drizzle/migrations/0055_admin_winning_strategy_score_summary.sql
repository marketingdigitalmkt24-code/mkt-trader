CREATE INDEX IF NOT EXISTS demo_rejections_signal_score_idx ON public.demo_selection_rejections (signal_id) INCLUDE (entry_strategy, entry_minute, score);
CREATE OR REPLACE FUNCTION public.admin_winning_strategy_scores(p_period text DEFAULT 'all')
RETURNS TABLE(strategy text, score text, demo_wins bigint, rejected_wins bigint, losses bigint)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = public
AS $$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
  RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
 END IF;
 IF p_period NOT IN ('all', 'today', '7d') THEN
  RAISE EXCEPTION 'Invalid period';
 END IF;
 RETURN QUERY
 WITH observations AS (
  SELECT DISTINCT o.signal_id, o.entry_strategy AS strategy, round(c.score::numeric, 2) AS score,
   o.entry_minute, lower(o.result) AS result, 'demo'::text AS source
  FROM public.iq_demo_test_orders o
  JOIN public.iq_demo_test_candidates c ON c.signal_id = o.signal_id
  WHERE o.status = 'confirmed' AND o.account_type = 'PRACTICE' AND o.iq_option_id ~ '^[0-9]+$'
   AND lower(o.result) IN ('win', 'loss') AND c.score IS NOT NULL AND c.score::text NOT IN ('NaN','Infinity','-Infinity')
  UNION ALL
  SELECT DISTINCT r.signal_id, r.entry_strategy, round(r.score::numeric, 2), r.entry_minute, lower(t.result), 'rejected'::text
  FROM public.demo_selection_rejections r
  JOIN public.operation_results t ON t.signal_id = r.signal_id AND t.timeframe = 'TEST'
  WHERE lower(t.result) IN ('win', 'loss') AND r.score IS NOT NULL AND r.score::text NOT IN ('NaN','Infinity','-Infinity')
 ), counted AS (
  SELECT v.strategy, v.score,
   count(*) FILTER (WHERE v.result = 'loss') AS losses,
   count(*) FILTER (WHERE v.result = 'win' AND v.source = 'demo' AND
    (p_period = 'all' OR (p_period = 'today' AND (v.entry_minute AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date) OR (p_period = '7d' AND v.entry_minute >= now() - interval '7 days'))) AS demo_wins,
   count(*) FILTER (WHERE v.result = 'win' AND v.source = 'rejected' AND
    (p_period = 'all' OR (p_period = 'today' AND (v.entry_minute AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date) OR (p_period = '7d' AND v.entry_minute >= now() - interval '7 days'))) AS rejected_wins
  FROM observations v GROUP BY v.strategy, v.score
 )
 SELECT g.strategy, g.score::text, g.demo_wins, g.rejected_wins, g.losses FROM counted g
 WHERE g.losses = 0 AND g.demo_wins + g.rejected_wins > 0
 ORDER BY g.demo_wins + g.rejected_wins DESC, g.strategy, g.score;
END;
$$;
REVOKE ALL ON FUNCTION public.admin_winning_strategy_scores(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_winning_strategy_scores(text) TO authenticated;
COMMENT ON FUNCTION public.admin_winning_strategy_scores(text) IS 'Read-only admin summary. Any historical Demo or rejected TEST LOSS excludes the strategy/displayed-score cohort. No trading authorization or data deletion.';