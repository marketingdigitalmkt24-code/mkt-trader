
-- Delete duplicate pending operation_results (keep only the one WITH iq_option_id)
DELETE FROM operation_results
WHERE id IN (
  SELECT id FROM (
    SELECT id, signal_id, iq_option_id,
      ROW_NUMBER() OVER (PARTITION BY signal_id ORDER BY iq_option_id DESC NULLS LAST) as rn
    FROM operation_results
    WHERE result = 'pending'
  ) sub
  WHERE rn > 1
);

-- Also clean the stuck pending without iq_option_id older than 5 min
DELETE FROM operation_results 
WHERE result = 'pending' 
  AND iq_option_id IS NULL 
  AND created_at < NOW() - INTERVAL '5 minutes';
