import { createClient } from 'npm:@supabase/supabase-js@2.95.3';
import { corsHeaders } from 'npm:@supabase/supabase-js@2.95.3/cors';
import { z } from 'npm:zod@3.25.76';
import { DEMO_SCAN_BUCKET, DEMO_LAST_ANALYSIS, latestDemoScan, latestCompletedDemoScan, type DemoScanStatus } from '../_shared/demo-scan-status.ts';
const reply = (data: unknown, status = 200) => Response.json(data,{status,headers:{...corsHeaders,'Cache-Control':'no-store'}});
Deno.serve(async req => {
  if(req.method==='OPTIONS')return new Response('ok',{headers:corsHeaders});
  if(req.method!=='POST')return reply({error:'Method not allowed'},405);
  const url=Deno.env.get('SUPABASE_URL'),key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if(!url||!key)return reply({error:'Unavailable'},503);
  const authorization=req.headers.get('Authorization');
  if(!authorization?.startsWith('Bearer '))return reply({error:'Unauthorized'},401);
  const db=createClient(url,key);
  const {data:auth,error}=await db.auth.getUser(authorization.slice(7));
  if(error||!auth.user)return reply({error:'Unauthorized'},401);
  const role=await db.rpc('has_role',{_user_id:auth.user.id,_role:'admin'});
  if(role.error||role.data!==true)return reply({error:'Forbidden'},403);
  if(!z.object({}).strict().safeParse(await req.json().catch(()=>null)).success)return reply({error:'Invalid parameters'},400);
  try {
    const rows=await Promise.all(['minute-0.json','minute-1.json','minute-2.json',DEMO_LAST_ANALYSIS].map(async path=>{
      const {data,error}=await db.storage.from(DEMO_SCAN_BUCKET).download(path);
      if(error||!data)return null;
      return JSON.parse(await data.text()) as DemoScanStatus;
    }));
    const valid=rows.filter((row): row is DemoScanStatus => row!==null);
    return reply({scan:latestDemoScan(valid),analysis:latestCompletedDemoScan(valid)});
  }catch{return reply({error:'Status unavailable'},503);}
});