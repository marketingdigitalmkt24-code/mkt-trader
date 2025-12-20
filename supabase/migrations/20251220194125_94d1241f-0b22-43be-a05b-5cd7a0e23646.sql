-- Enable realtime for operation_results table
ALTER TABLE public.operation_results REPLICA IDENTITY FULL;

-- Add the table to realtime publication if not already added
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND schemaname = 'public' 
    AND tablename = 'operation_results'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.operation_results;
  END IF;
END $$;