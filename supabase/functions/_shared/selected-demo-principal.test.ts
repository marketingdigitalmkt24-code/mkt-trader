import {test,expect} from 'bun:test';
import {selectedDemoPrincipal} from './selected-demo-principal';
const at=Date.parse('2026-10-24T03:26:00Z');
const c={signal_id:'queda-win-retry-v1-APPLE-OTC-1',entry_strategy:'QUEDA_WIN_RETRY_V1',entry_minute:new Date(at).toISOString(),direction:'CALL'};
test('only fresh selected Queda win +1 CALL permits principal dispatch',()=>{
 expect(selectedDemoPrincipal(c,at+1000)).toBe(true);
 expect(selectedDemoPrincipal({...c,direction:'PUT'},at)).toBe(false);
 expect(selectedDemoPrincipal({...c,entry_strategy:'QUEDA_WIN_CALL_V1',signal_id:'queda-win-call-v1-APPLE-OTC-1'},at)).toBe(false);
 expect(selectedDemoPrincipal(c,at+30000)).toBe(false);
 expect(selectedDemoPrincipal(c,at-1)).toBe(false);
});