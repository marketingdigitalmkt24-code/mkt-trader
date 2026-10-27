-- Add fields to track if trade was from auto-trading and AI analyzed
ALTER TABLE public.operation_results
ADD COLUMN IF NOT EXISTS is_auto_trade boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS is_ai_analyzed boolean DEFAULT false;