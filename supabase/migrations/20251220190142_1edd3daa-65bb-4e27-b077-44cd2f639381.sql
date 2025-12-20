-- Add IQ Option credentials table
CREATE TABLE public.iqoption_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  password TEXT NOT NULL,
  account_type TEXT NOT NULL DEFAULT 'PRACTICE', -- 'PRACTICE' or 'REAL'
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_connected_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.iqoption_config ENABLE ROW LEVEL SECURITY;

-- Allow public access (no auth system)
CREATE POLICY "Allow public read iq" ON public.iqoption_config FOR SELECT USING (true);
CREATE POLICY "Allow public insert iq" ON public.iqoption_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update iq" ON public.iqoption_config FOR UPDATE USING (true);
CREATE POLICY "Allow public delete iq" ON public.iqoption_config FOR DELETE USING (true);

-- Trigger for updated_at
CREATE TRIGGER update_iqoption_config_updated_at
  BEFORE UPDATE ON public.iqoption_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Add table for storing operation results from IQ Option
CREATE TABLE public.operation_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  signal_id TEXT NOT NULL,
  asset TEXT NOT NULL,
  direction TEXT NOT NULL,
  entry_price DECIMAL(20, 8),
  exit_price DECIMAL(20, 8),
  result TEXT NOT NULL, -- 'win', 'loss', 'tie'
  profit DECIMAL(10, 2) NOT NULL DEFAULT 0,
  iq_option_id TEXT,
  expiration_time TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.operation_results ENABLE ROW LEVEL SECURITY;

-- Allow public access
CREATE POLICY "Allow public read results" ON public.operation_results FOR SELECT USING (true);
CREATE POLICY "Allow public insert results" ON public.operation_results FOR INSERT WITH CHECK (true);

-- Enable realtime for operation results
ALTER PUBLICATION supabase_realtime ADD TABLE public.operation_results;