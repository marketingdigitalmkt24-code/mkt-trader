// Admin-only proxy: reads open Demo operations from demo-operations-feed server-side,
// so the feed secret never reaches the browser.
import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.95.3/cors';

const reply = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { ...corsHeaders, 'Cache-Control': 'no-store' } });

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return reply({ error: 'Method not allowed' }, 405);
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const feedSecret = Deno.env.get('DEMO_FEED_SECRET');
  if (!url || !key || !feedSecret) return reply({ error: 'Unavailable' }, 503);

  const authorization = req.headers.get('Authorization');
  if (!authorization?.startsWith('Bearer ')) return reply({ error: 'Unauthorized' }, 401);
  const db = createClient(url, key);
  const { data: auth, error } = await db.auth.getUser(authorization.slice(7));
  if (error || !auth.user) return reply({ error: 'Unauthorized' }, 401);
  const role = await db.rpc('has_role', { _user_id: auth.user.id, _role: 'admin' });
  if (role.error || role.data !== true) return reply({ error: 'Forbidden' }, 403);

  const res = await fetch(`${url}/functions/v1/demo-operations-feed?limit=1&include_open=true`, {
    headers: { 'x-feed-key': feedSecret },
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`demo-operations-feed failed [${res.status}]: ${body}`);
    return reply({ error: 'Feed request failed', status: res.status }, 502);
  }
  const data = await res.json();
  return reply({ open_operations: Array.isArray(data.open_operations) ? data.open_operations : [] });
});
