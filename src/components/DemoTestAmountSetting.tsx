import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { DollarSign, Save } from 'lucide-react';

export function DemoTestAmountSetting() {
 const client = useQueryClient();
 const [value, setValue] = useState('1');
 const [dirty, setDirty] = useState(false);
 const [saving, setSaving] = useState(false);
 const [message, setMessage] = useState('');
 const query = useQuery({queryKey:['demo-test-settings'],queryFn:async()=>{
  const {data,error}=await supabase.from('iq_demo_test_settings').select('amount').eq('id',1).maybeSingle();
  if(error)throw error;return Number(data?.amount ?? 1);
 }});
 useEffect(()=>{if(!dirty && query.data != null)setValue(String(query.data));},[query.data,dirty]);
 const amount = Number(value);
 const valid = Number.isFinite(amount) && amount >= 1 && Math.abs(amount*100-Math.round(amount*100)) < .000001;
 const save = async()=>{
  if(!valid || saving)return;
  setSaving(true);setMessage('');
  try {
   const {data,error}=await supabase.from('iq_demo_test_settings').upsert({id:1,amount,updated_at:new Date().toISOString()}).select('amount').single();
   if(error || !data)throw error || new Error('Not saved');
   client.setQueryData(['demo-test-settings'],Number(data.amount));setDirty(false);setMessage('Valor de teste salvo.');
  } catch {setMessage('Não foi possível salvar o valor de teste.');}
  finally {setSaving(false);}
 };
 return <div className="space-y-2 border-t border-border pt-4">
  <Label htmlFor="demo-test-amount" className="flex items-center gap-2"><DollarSign className="h-4 w-4 text-muted-foreground"/>Valor entrada de teste <Badge variant="outline">Demo</Badge></Label>
  <div className="flex flex-wrap items-center gap-2"><span className="text-sm text-muted-foreground">US$</span><Input id="demo-test-amount" type="number" min={1} step={0.01} value={value} disabled={query.isLoading || query.isError || saving} onChange={e=>{setValue(e.target.value);setDirty(true);setMessage('');}} className="w-28"/>
   <Button type="button" size="sm" variant="outline" disabled={!dirty || !valid || saving || query.isError} onClick={save}><Save className="mr-2 h-4 w-4"/>{saving?'Salvando…':'Salvar teste'}</Button>
  </div>
  {dirty && !valid && <p role="alert" className="text-xs text-destructive">Valor mínimo US$1, com até duas casas decimais.</p>}
  {query.isError && <p role="alert" className="text-xs text-destructive">Não foi possível carregar o valor de teste.</p>}
  {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
 </div>;
}