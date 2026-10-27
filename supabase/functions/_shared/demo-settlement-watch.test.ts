import { expect, test } from 'bun:test';
import { watchDemoSettlements } from './demo-settlement-watch';
test('refreshes just-confirmed orders at :01 and retries late broker results without another candidate',async()=>{
  const target=Date.parse('2026-10-27T22:03:00Z');let time=target;
  const times:number[]=[];
  const checks=await watchDemoSettlements(target,async()=>{times.push(time-target);return times.length<3;},()=>time,async ms=>{time+=ms;});
  expect(times).toEqual([1000,3000,6000]);expect(checks).toBe(3);
});
test('stops without further requests when no pending broker orders remain',async()=>{
  let time=0;let requests=0;
  expect(await watchDemoSettlements(0,async()=>{requests++;return false;},()=>time,async ms=>{time+=ms;})).toBe(1);
  expect(requests).toBe(1);
});
test('bounds unresolved retries to :15 and never runs after :20',async()=>{
  let time=0;const times:number[]=[];
  await watchDemoSettlements(0,async()=>{times.push(time);return true;},()=>time,async ms=>{time+=ms;});
  expect(times).toEqual([1000,3000,6000,10000,15000]);
  expect(await watchDemoSettlements(0,async()=>{throw Error('late request');},()=>21000,async()=>{})).toBe(0);
});