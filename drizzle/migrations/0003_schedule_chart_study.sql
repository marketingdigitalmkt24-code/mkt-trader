SELECT cron.schedule('iqoption-chart-study-hourly', '7 * * * *', $$
  SELECT net.http_post(
    url:='https://dkxgwmlycugsibvtbpsg.supabase.co/functions/v1/iqoption-chart-study',
    headers:='{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRreGd3bWx5Y3Vnc2lidnRicHNnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxOTIxNDYsImV4cCI6MjA4MTc2ODE0Nn0.URdTtY29Iq1pN8MJlgYFaoOgx1OzioidFPputShQGKg"}'::jsonb,
    body:='{}'::jsonb
  );
$$);