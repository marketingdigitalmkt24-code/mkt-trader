import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3';
import { readMasterIQConfig } from '../_shared/master-iq-config.ts';
import { iqMarketOpen } from '../_shared/iq-market-open.ts';
import { DEMO_TEST_AMOUNT, demoBalance, freshDemoCandidate, validDemoTestAmount } from './policy.ts';
import { demoHistoryOutcome } from '../_shared/demo-history.ts';
import { reusableDemoSession } from '../_shared/demo-session.ts';
import { verifyDemoWinScore } from '../_shared/demo-win-scores.ts';
import { verifyDemoWinningPattern } from '../_shared/demo-entry-authorization.ts';
import { DEMO_MID_CANDLE, midCandleSignal, midCandleTime, freshMidCandle, midCandleExpiry } from '../_shared/demo-mid-candle.ts';
const schema = z.object({ candidate: z.string().max(200).optional(), mode:z.literal('mid').optional(), inspect: z.enum(['ALIBABA','MSFT']).optional(), brokerSession: z.object({configId:z.string().uuid(),ssid:z.string().min(1).max(4096)}).strict().optional() }).strict();
const reply = (body: unknown, status = 200) => {
 console.log('Demo test response:', JSON.stringify({ status, ...body as Record<string, unknown> }));
 return Response.json(body, { status, headers: corsHeaders });
};
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
 const winScoreEvidence=(score:unknown)=>verifyDemoWinScore(score,async(value,from,to)=>{
   const {data,error}=await db.from('iq_demo_test_candidates').select('signal_id,score')
     .neq('entry_strategy',DEMO_MID_CANDLE).eq('score',value).order('signal_id').range(from,to);
   if(error)throw error;return data||[];
 },async ids=>{
   const {data,error}=await db.from('iq_demo_test_orders').select('signal_id,status,account_type,iq_option_id,result')
     .in('signal_id',ids).eq('status','confirmed').eq('account_type','PRACTICE')
     .eq('result','win').not('iq_option_id','is',null);
   if(error)throw error;return data||[];
 });
 const scheduler = req.headers.get('x-scheduler-token');
 const serviceAuthorized = req.headers.get('Authorization') === `Bearer ${key}`;
 let authorized = serviceAuthorized;
 if (!authorized && scheduler) {
 const { data } = await db.from('anticipation_scheduler_auth').select('token').eq('id',1).maybeSingle();
 authorized = !!data?.token && data.token === scheduler;
 }
 if (!authorized) return reply({ error: 'Unauthorized' },401);
 const parsed = schema.safeParse(await req.json().catch(() => null));
 if (!parsed.success) return reply({ error: 'Invalid parameters' },400);
 const mid=parsed.data.mode==='mid';
 if(mid && (!serviceAuthorized || !parsed.data.candidate || parsed.data.inspect))return reply({error:'Invalid mid-candle dispatch'},400);
 const isFresh=(row:any)=>mid?freshMidCandle(row,Date.now()):freshDemoCandidate(row,Date.now());
 // Start independent ledger/settings reads before broker authentication.
 const pendingRead = db.from('iq_demo_test_orders').select('id,iq_option_id').eq('status','confirmed').eq('result','pending').order('created_at').limit(1000).then(r=>r);
 const settingRead = parsed.data.candidate ? db.from('iq_demo_test_settings').select('amount').eq('id',1).maybeSingle().then(r=>r) : null;
 const selectedRead = parsed.data.candidate ? db.from('iq_demo_test_candidates').select('signal_id,asset,direction,entry_minute,entry_strategy,score,candles,pattern_match')
   .eq('entry_minute',new Date(Math.floor(Date.now()/60000)*60000).toISOString()).maybeSingle().then(r=>r) : null;
 const { data: cfg } = await readMasterIQConfig(db);
 if (!cfg) return reply({ error: 'Principal connection unavailable' },409);
 let ssid = reusableDemoSession(serviceAuthorized,cfg.id,parsed.data.brokerSession);
 for (const endpoint of ssid ? [] : ['https://auth.iqoption.com/api/v2/login','https://api.iqoption.com/api/v2/login']) {
 try {
 const response = await fetch(endpoint,{ method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','User-Agent':'Mozilla/5.0'},body:new URLSearchParams({identifier:cfg.email,password:cfg.password}),signal:AbortSignal.timeout(8000)});
 const data = await response.json(); if (data.code === 'success' && typeof data.ssid === 'string') { ssid=data.ssid;break; }
 } catch { /* bounded alternate */ }
 }
 if (!ssid) return reply({ error: 'Broker login failed' },502);
 let candidate: any = null;
 if (parsed.data.candidate) {
 // Scheduler delivery can lag one minute. Never roll the old candidate forward:
 // independently read this minute's newly selected signal, then enforce its own freshness.
 const selectedResult = await selectedRead;
 const selected = selectedResult?.data;
 const error = selectedResult?.error;
 const data = selected ? {...selected,created_at:selected.entry_minute,timeframe:'TEST'} : null;
 if (data && freshDemoCandidate(data,Date.now())) {
   const patternEvidence=await verifyDemoWinningPattern(data,async id=>{
     const {data:reference,error}=await db.from('iq_demo_test_candidates').select('signal_id,entry_minute,direction,candles,score').eq('signal_id',id).maybeSingle();
     if(error)throw error;return reference;
   },async ids=>{
     const {data:orders,error}=await db.from('iq_demo_test_orders').select('signal_id,status,account_type,iq_option_id,result').in('signal_id',ids);
     if(error)throw error;return orders||[];
   });
   if(mid ? patternEvidence && data.signal_id===parsed.data.candidate : patternEvidence || await winScoreEvidence(data.score)) candidate=data;
 }
 else console.log('Demo candidate skipped:', JSON.stringify({error:error?.code,found:!!data,created_at:data?.created_at,timeframe:data?.timeframe,direction:data?.direction,now:new Date().toISOString()}));
 }
 let reserved: string | null = null;
 let testAmount = DEMO_TEST_AMOUNT;
 if(mid && candidate){
   const source=candidate,target=midCandleTime(source.entry_minute);
   if(Date.now()>target+2000)return reply({error:'Mid-candle window expired'},409);
   candidate={...source,signal_id:midCandleSignal(source.signal_id),entry_strategy:DEMO_MID_CANDLE,entry_minute:new Date(target).toISOString(),created_at:new Date(target).toISOString(),pattern_match:{...source.pattern_match,source_signal_id:source.signal_id,source_strategy:source.entry_strategy,entry_offset_seconds:30}};
   const {error}=await db.from('iq_demo_test_candidates').insert({signal_id:candidate.signal_id,entry_minute:candidate.entry_minute,asset:candidate.asset,direction:candidate.direction,entry_strategy:candidate.entry_strategy,score:candidate.score,candles:candidate.candles,pattern_match:candidate.pattern_match});
   if(error)return reply({error:'Mid-candle slot already reserved'},409);
 }

 if (candidate) {
 const setting = await settingRead;
 if(!setting)return reply({error:'Demo test amount unavailable'},503);
 if(setting.error)return reply({error:'Demo test amount unavailable'},503);
 testAmount = Number(setting.data?.amount ?? DEMO_TEST_AMOUNT);
 if(!validDemoTestAmount(testAmount))return reply({error:'Invalid demo test amount'},409);
 const { data, error } = await db.from('iq_demo_test_orders').insert({ signal_id:candidate.signal_id,entry_minute:candidate.created_at,asset:candidate.asset,direction:candidate.direction,amount:testAmount,entry_strategy:candidate.entry_strategy || 'UNKNOWN',expiration_time:new Date(mid?midCandleExpiry(candidate.created_at)*1000:Date.parse(candidate.created_at)+60000).toISOString() }).select('id').single();
 if (!error && data) reserved=data.id;
 else console.log('Demo reservation rejected:',error?.code);
 }
 const {data:pending} = await pendingRead;
 let placed = false, confirmed = false, updated = 0;
 let availability: unknown[] = [];
 const writes: Promise<unknown>[]=[];
 await new Promise<void>(resolve => {
 const ws = new WebSocket('wss://iqoption.com/echo/websocket');
 let balanceId=0, finished=false, initialized=false, histories=0, profileReceived=false;
 const historyResponses = new Set<string>();
 const finish=()=>{if(finished)return;finished=true;clearTimeout(timer);ws.close();resolve();};
 const timer=setTimeout(finish,mid?55000:25000);
 const send=(name:string,version:string,body:unknown,request_id?:string)=>ws.send(JSON.stringify({name:'sendMessage',request_id,msg:{name,version,body}}));
 let historyRequested=false;
 const requestHistory=()=>{
 if(historyRequested)return;historyRequested=true;
 if(pending?.length) for(const offset of [0,300,600]) {
 send('portfolio.get-history-positions','2.0',{user_balance_id:balanceId,instrument_types:['binary-option','turbo-option','digital-option'],limit:300,offset},`portfolio-${offset}`);
 send('get-history-positions','1.0',{user_balance_id:balanceId,instrument_types:['turbo'],limit:300,offset},`legacy-${offset}`);
 }
 };
 ws.onopen=()=>ws.send(JSON.stringify({name:'ssid',msg:ssid}));
 ws.onerror=finish;
 ws.onmessage=async ev=>{
 try {
 const d=JSON.parse(ev.data);
 if(d.name==='profile' && !profileReceived) {
 profileReceived=true;
 const balance=demoBalance(d.msg?.balances || []);
 if(!balance){finish();return;} balanceId=balance.id;
 // Ask for placement availability first; history must not queue ahead of the order.
 if(reserved || parsed.data.inspect) send('get-initialization-data','3.0',{});
 if(!reserved) requestHistory();
 if(!reserved && !parsed.data.inspect && !pending?.length) finish();
 }
 if(d.name==='initialization-data' && parsed.data.inspect) {
 const now=Math.floor(Date.now()/1000), expiry=Math.floor(now/60)*60+60;
 availability=['turbo','binary'].flatMap(market=>Object.entries<any>(d.msg?.[market]?.actives || {})
  .filter(([,a])=>symbol(a.name || '')===parsed.data.inspect)
  .map(([id,a])=>({market,id,name:a.name,enabled:a.enabled,suspended:a.is_suspended,schedule:a.schedule,expiration_times:a.option?.expiration_times,now,expiry,eligible:iqMarketOpen(a,now,expiry)})));
 console.log('Demo asset inspection:',JSON.stringify({asset:parsed.data.inspect,availability}));
 if(!reserved)finish();
 }
 if(d.name==='initialization-data' && !initialized && reserved && candidate) {
 initialized=true;
 if(mid)await new Promise(resolve=>setTimeout(resolve,Math.max(0,Date.parse(candidate.created_at)-Date.now())));
 if(finished)return;
 const expiry=mid?midCandleExpiry(candidate.created_at):Date.parse(candidate.created_at)/1000+60;
 const found=Object.entries<any>(d.msg?.turbo?.actives || {}).find(([,a])=>symbol(a.name || '')===candidate.asset && iqMarketOpen(a,Math.floor(Date.now()/1000),expiry));
 // Exact WIN score or recomputed confirmed winning pattern checked before reservation; recheck freshness.
 if(!found || !isFresh(candidate)) {
 requestHistory();
 writes.push(db.from('iq_demo_test_orders').update({status:'failed',error:'Asset closed or candidate expired'}).eq('id',reserved).then(()=>{}));
 if(!pending?.length) finish();return;
 }
 // PRACTICE-only balance ID, separately configured snapshot; never touch the primary queue or copies.
 placed=true;
 console.log('Demo timing order submitted:',new Date().toISOString(),candidate.signal_id);
 send('binary-options.open-option','1.0',{price:testAmount,active_id:Number(found[0]),expired:expiry,direction:candidate.direction.toLowerCase(),option_type_id:3,user_balance_id:balanceId},'demo-test');
 requestHistory();
 }
 if(d.name==='option' && placed && !confirmed && reserved && /^\d+$/.test(String(d.msg?.id || ''))) {
 confirmed=true;
 console.log('Demo timing order confirmed:',new Date().toISOString(),candidate?.signal_id);
 writes.push(db.from('iq_demo_test_orders').update({status:'confirmed',iq_option_id:String(d.msg.id),created_at:new Date().toISOString()}).eq('id',reserved).then(()=>{}));
 if(!pending?.length || histories>=6) finish();
 }
 if((d.name==='error' || d.name==='result') && d.request_id==='demo-test' && !confirmed && reserved) {
 writes.push(db.from('iq_demo_test_orders').update({status:'failed',error:'Broker refused demo order'}).eq('id',reserved).then(()=>{}));
 if(!pending?.length || histories>=6) finish();
 }
 if(['history-positions','portfolio.get-history-positions','get-history-positions'].includes(d.name)) {
 const responseId = d.request_id || `${d.name}-${histories}`;
 if(historyResponses.has(responseId)) return;
 historyResponses.add(responseId); histories++;
 const positions = d.msg?.positions || d.msg?.history || (Array.isArray(d.msg)?d.msg:[]);
 console.log('Demo history page:',JSON.stringify({request:responseId,count:positions.length,pending:pending?.length || 0}));
 for(const pos of positions) {
 const outcome=demoHistoryOutcome(pos);if(!outcome)continue;
 const match=pending?.find(p=>p.iq_option_id && outcome.ids.includes(p.iq_option_id));if(!match)continue;
 writes.push(db.from('iq_demo_test_orders').update({result:outcome.result,profit:outcome.profit,settled_at:new Date().toISOString()}).eq('id',match.id).eq('result','pending').select('id').then(({data,error})=>{if(error)console.error('Demo settlement write failed:',error.code);else updated+=data?.length || 0;}));
 }
 if(histories>=6 && (!reserved || confirmed)) finish();
 }
 } catch { /* ignore unrelated broker message */ }
 };
 });
 await Promise.all(writes);
 if(reserved && !confirmed) await db.from('iq_demo_test_orders').update({status:placed?'unknown':'failed',error:placed?'No broker confirmation; never retry ambiguous order':'Demo balance unavailable or order not sent'}).eq('id',reserved).eq('status','reserved');
 return reply({success:true,confirmed,updated,...(parsed.data.inspect?{availability}: {})});
 } catch {return reply({error:'Demo test unavailable'},502);}
});
