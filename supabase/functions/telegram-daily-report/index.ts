import { createClient } from 'npm:@supabase/supabase-js@2.89.0';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.89.0/cors';
import { dispatchDailyReport } from '../_shared/telegram-daily-dispatch.ts';
Deno.serve(async req => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const url = Deno.env.get('SUPABASE_URL');
  if (!key || !url || req.headers.get('authorization') !== `Bearer ${key}`) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });
  if (req.method !== 'POST') return Response.json({ error: 'Method not allowed' }, { status: 405, headers: corsHeaders });
  try {
    return Response.json({ status: await dispatchDailyReport(createClient(url, key)) }, { headers: corsHeaders });
  } catch (error) {
    console.error('Telegram daily report:', String(error));
    return Response.json({ error: String(error) }, { status: 500, headers: corsHeaders });
  }
});
