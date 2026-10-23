import { createClient } from 'npm:@supabase/supabase-js@2.49.4';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { readMasterIQConfig } from '../_shared/master-iq-config.ts';
import { iqMarketOpen } from '../_shared/iq-market-open.ts';
import { DEMO_TEST_AMOUNT, demoBalance, freshDemoTest } from './policy.ts';
const schema = z.object({ candidate: z.string().max(200).optional() }).strict();
const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: corsHeaders });
const symbol = (raw: string) => {
 let s = raw.toUpperCase().replace('FRONT.', '').replace('-OP', '');
 const otc = s.includes('-OTC'); s = s.replace('-OTC', '');
 if (/^[A-Z]{6}$/.test(s)) s = `${s.slice(0,3)}/${s.slice(3)}`;
 return otc ? `${s}-OTC` : s;
};
Deno.serve(async req => {
 if (req.method === 'OPTIONS') return reply({});
 if (req.method !== 'POST') return reply({ error: 'Method not allowed' },405);
 try {
 const url = Deno.env.get('SUPABASE_URL'), key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
 if (!url || !key) return reply({ error: 'Service unavailable' },503);
 const db = createClient(url,key);
 const scheduler = req.headers.get('x-scheduler-token');
 let authorized = req.headers.get('Authorization') === `Bearer ${key}`;
 if (!authorized && scheduler) {
 const { data } = await db.from('anticipation_scheduler_auth').select('token').eq('id',1).maybeSingle();
 authorized = !!data?.token && data.token === scheduler;
 }
 if (!authorized) return reply({ error: 'Unauthorized' },401);
 const parsed = schema.safeParse(await req.json().catch(() => null));
 if (!parsed.success) return reply({ error: 'Invalid parameters' },400);
 const { data: cfg } = await readMasterIQConfig(db);
 if (!cfg) return reply({ error: 'Principal connection unavailable' },409);
 let ssid: string | null = null;
 for (const endpoint of ['https://auth.iqoption.com/api/v2/login','https://api.iqoption.com/api/v2/login']) {
 try {
 const response = await fetch(endpoint,{ method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0'},body:new URLSearchParams({identifier:cfg.email,password:cfg.password}),signal:AbortSignal.timeout(8000)});
 const data = await response.json(); if (data.code === 'success' && typeof data.ssid === 'string') { ssid=data.ssid;break; }
 } catch { /* bounded alternate */ }
 }
 if (!ssid) return reply({ error: 'Broker login failed' },502);
 const { data: pending } = await db.from('iq_demo_test_orders').select('id,iq_option_id').eq('status','confirmed').eq('result','pending').order('created_at').limit(1000);
 let candidate: any = null;
 if (parsed.data.candidate) {
 const { data } = await db.from('operation_results').select('signal_id,asset,direction,created_at,timeframe,entry_strategy').eq('signal_id',parsed.data.candidate).maybeSingle();
 if (data && freshDemoTest(data,Date.now())) candidate=data;
 }
 let reserved: string | null = null;
 if (candidate) {
 const { data, error } = await db.from('iq_demo_test_orders').insert({ signal_id:candidate.signal_id,entry_minute:candidate.created_at,asset:candidate.asset,direction:candidate.direction,entry_strategy:candidate.entry_strategy || 'UNKNOWN',expiration_time:new Date(Date.parse(candidate.created_at)+60000).toISOString() }).select('id').single();
 if (!error && data) reserved=data.id;
 }
 let placed = false, confirmed = false, updated = 0;
 const writes: Promise<unknown>[]=[];
 await new Promise<void>(resolve => {
 const ws = new WebSocket('wss://iqoption.com/echo/websocket');
 let balanceId=0, finished=false, initialized=false, histories=0;
 const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);ws.close();resolve();};
 const timer=setTimeout(finish,25000);
 const send=(name:string,version:string,body:unknown,request_id?:string)=>ws.send(JSON.stringify({name:'sendMessage',request_id,msg:{name,version,body}}));
 ws.onopen=()=>ws.send(JSON.stringify({name:'ssid',msg:ssid}));
 ws.onerror=finish;
 ws.onmessage=async ev=>{
 try {
 const d=JSON.parse(ev.data);
 if(d.name==='profile') {
 const balance=demoBalance(d.msg?.balances || []);
 if(!balance){finish();return;} balanceId=balance.id;
 if(pending?.length) for(const offset of [0,300,600]) send('portfolio.get-history-positions','2.0',{user_balance_id:balanceId,instrument_types:['binary-option','turbo-option','digital-option'],limit:300,offset},`h${offset}`);
 if(reserved) send('get-initialization-data','3.0',{});
 else if(!pending?.length) finish();
 }
 if(d.name==='initialization-data' && !initialized && reserved && candidate) {
 initialized=true;
 const expiry=Date.parse(candidate.created_at)/1000+60;
 const found=Object.entries<any>(d.msg?.turbo?.actives || {}).find(([,a])=>symbol(a.name || '')===candidate.asset && iqMarketOpen(a,Math.floor(Date.now()/1000),expiry));
 if(!found || !freshDemoTest(candidate,Date.now())) {
 writes.push(db.from('iq_demo_test_orders').update({status:'failed',error:'Asset closed or candidate expired'}).eq('id',reserved).then(()=>{}));
 if(!pending?.length) finish();return;
 }
 // PRACTICE-only balance ID, fixed USD1; never touch the primary queue, ledger or copies.
 placed=true;
 send('binary-options.open-option','1.0',{price:DEMO_TEST_AMOUNT,active_id:Number(found[0]),expired:expiry,direction:candidate.direction.toLowerCase(),option_type_id:3,user_balance_id:balanceId},'demo-test');
 }
 if(d.name==='option' && placed && !confirmed && reserved && /^\d+$/.test(String(d.msg?.id || ''))) {
 confirmed=true;
 writes.push(db.from('iq_demo_test_orders').update({status:'confirmed',iq_option_id:String(d.msg.id),created_at:new Date().toISOString()}).eq('id',reserved).then(()=>{}));
 if(!pending?.length || histories>=3) finish();
 }
 if((d.name==='error' || d.name==='result') && d.request_id==='demo-test' && !confirmed && reserved) {
 writes.push(db.from('iq_demo_test_orders').update({status:'failed',error:'Broker refused demo order'}).eq('id',reserved).then(()=>{}));
 if(!pending?.length || histories>=3) finish();
 }
 if(d.name==='history-positions' || d.name==='portfolio.get-history-positions') {
 histories++;
 for(const pos of d.msg?.positions || d.msg?.history || (Array.isArray(d.msg)?d.msg:[])) {
 if(!(pos.status==='closed' || pos.close_time || pos.close_at))continue;
 const ids=[pos.id,pos.order_id,...(pos.order_ids || [])].map(String);
 const match=pending?.find(p=>p.iq_option_id && ids.includes(p.iq_option_id));if(!match)continue;
 let profit=Number(pos.pnl_net ?? pos.pnl ?? pos.close_profit ?? pos.profit ?? pos.close_profit_amount ?? pos.net_profit);
 if(!Number.isFinite(profit) && pos.win_amount != null)profit=Number(pos.win_amount)-Number(pos.amount ?? pos.invest ?? pos.investment ?? pos.buy_amount ?? pos.open_amount);
 if(!Number.isFinite(profit))continue;
 const raw=pos.raw_event?.binary_options_option_changed1?.result || pos.result;
 const result=raw==='win'?'win':['loose','loss'].includes(raw)?'loss':['equal','tie'].includes(raw)?'tie':profit>0?'win':profit<0?'loss':'tie';
 writes.push(db.from('iq_demo_test_orders').update({result,profit,settled_at:new Date().toISOString()}).eq('id',match.id).eq('result','pending').then(({error})=>{if(!error)updated++;}));
 }
 if(histories>=3 && (!reserved || confirmed)) finish();
 }
 } catch { /* ignore unrelated broker message */ }
 };
 });
 await Promise.all(writes);
 if(reserved && !confirmed) await db.from('iq_demo_test_orders').update({status:placed?'unknown':'failed',error:placed?'No broker confirmation; never retry ambiguous order':'Demo balance unavailable or order not sent'}).eq('id',reserved).eq('status','reserved');
 return reply({success:true,confirmed,updated});
 } catch {return reply({error:'Demo test unavailable'},502);}
});
