CREATE OR REPLACE FUNCTION public.admin_winning_strategy_score_chart(p_period text DEFAULT 'all'::text)
 RETURNS TABLE(strategy text, score text, demo_wins bigint, rejected_wins bigint, losses bigint, first_win_at timestamp with time zone, last_win_at timestamp with time zone, history_first_win_at timestamp with time zone)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
 IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
  RAISE EXCEPTION 'Admin access required' USING ERRCODE = '42501';
 END IF;
 IF p_period NOT IN ('all', 'today', '7d') THEN RAISE EXCEPTION 'Invalid period'; END IF;
 RETURN QUERY
 WITH observations AS (
  SELECT DISTINCT o.signal_id, o.entry_strategy AS strategy, round(c.score::numeric, 2) AS score,
   o.entry_minute, lower(o.result) AS result
  FROM public.iq_demo_test_orders o
  JOIN public.iq_demo_test_candidates c ON c.signal_id = o.signal_id
  WHERE o.status = 'confirmed' AND o.account_type = 'PRACTICE' AND o.iq_option_id ~ '^[0-9]+$'
   AND lower(o.result) IN ('win', 'loss') AND c.score IS NOT NULL AND c.score::text NOT IN ('NaN','Infinity','-Infinity')
 ), scoped AS (
  SELECT v.*, (p_period = 'all' OR (p_period = 'today' AND (v.entry_minute AT TIME ZONE 'America/Sao_Paulo')::date = (now() AT TIME ZONE 'America/Sao_Paulo')::date) OR (p_period = '7d' AND v.entry_minute >= now() - interval '7 days')) AS in_period
  FROM observations v
 ), counted AS (
  SELECT v.strategy, v.score,
   count(*) FILTER (WHERE v.result = 'loss') AS losses,
   count(*) FILTER (WHERE v.result = 'win' AND v.in_period) AS demo_wins,
   0::bigint AS rejected_wins,
   min(v.entry_minute) FILTER (WHERE v.result = 'win' AND v.in_period) AS first_win_at,
   max(v.entry_minute) FILTER (WHERE v.result = 'win' AND v.in_period) AS last_win_at,
   min(v.entry_minute) FILTER (WHERE v.result = 'win') AS history_first_win_at
  FROM scoped v GROUP BY v.strategy, v.score
 )
 SELECT g.strategy, g.score::text, g.demo_wins, 0::bigint AS rejected_wins, g.losses, g.first_win_at, g.last_win_at, g.history_first_win_at
 FROM counted g WHERE g.losses = 0 AND g.demo_wins > 0
 ORDER BY g.demo_wins DESC, g.strategy, g.score;
END;
$function$;