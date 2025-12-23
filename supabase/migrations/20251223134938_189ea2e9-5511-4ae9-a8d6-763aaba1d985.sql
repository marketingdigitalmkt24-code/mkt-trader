-- Adiciona coluna para armazenar o timeframe da operação
ALTER TABLE public.operation_results 
ADD COLUMN IF NOT EXISTS timeframe text NOT NULL DEFAULT 'M1';