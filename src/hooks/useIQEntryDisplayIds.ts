import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Server validates exact candidate score and ownership without exposing admin candidates to clients.
export function useIQEntryDisplayIds(ids: string[]) {
 return useQuery({
  queryKey:['iq-entry-display-ids',ids],refetchInterval:10000,
  queryFn:async()=>{
   const allowed=new Set<string>();
   for(let i=0;i<ids.length;i+=1000){
    const {data,error}=await supabase.rpc('iq_entry_display_ids',{p_ids:ids.slice(i,i+1000)});
    if(error)throw error;
    for(const row of data??[])allowed.add(row.operation_id);
   }
   return allowed;
  },
 });
}