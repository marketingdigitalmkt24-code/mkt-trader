-- Create function to update timestamps (if not exists)
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create table for WhatsApp notification numbers
CREATE TABLE public.whatsapp_numbers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  phone_number TEXT NOT NULL,
  name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.whatsapp_numbers ENABLE ROW LEVEL SECURITY;

-- Allow public access (no auth system)
CREATE POLICY "Allow public read" ON public.whatsapp_numbers FOR SELECT USING (true);
CREATE POLICY "Allow public insert" ON public.whatsapp_numbers FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update" ON public.whatsapp_numbers FOR UPDATE USING (true);
CREATE POLICY "Allow public delete" ON public.whatsapp_numbers FOR DELETE USING (true);

-- Create table for Z-API configuration
CREATE TABLE public.zapi_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  instance_id TEXT NOT NULL,
  token TEXT NOT NULL,
  client_token TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.zapi_config ENABLE ROW LEVEL SECURITY;

-- Allow public access
CREATE POLICY "Allow public read zapi" ON public.zapi_config FOR SELECT USING (true);
CREATE POLICY "Allow public insert zapi" ON public.zapi_config FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update zapi" ON public.zapi_config FOR UPDATE USING (true);
CREATE POLICY "Allow public delete zapi" ON public.zapi_config FOR DELETE USING (true);

-- Triggers for updated_at
CREATE TRIGGER update_whatsapp_numbers_updated_at
  BEFORE UPDATE ON public.whatsapp_numbers
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_zapi_config_updated_at
  BEFORE UPDATE ON public.zapi_config
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();