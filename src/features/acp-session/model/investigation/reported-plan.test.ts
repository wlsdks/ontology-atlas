import { expect, it } from 'vitest';
import { readReportedPlan } from './reported-plan';

const entry=(status='pending')=>({content:'Read a condition.',priority:'high',status});
it('replaces the full plan and marks a changed denominator instead of adding old completed work',()=>{
  const first=readReportedPlan(null,[entry('completed'),entry(),entry('in_progress')]);
  expect(first).toEqual({total:3,done:1,replanned:false});
  const next=readReportedPlan(first,[entry('completed'),entry('completed')]);
  expect(next).toEqual({total:2,done:2,replanned:true});
  expect(readReportedPlan(next,[entry(),entry()])).toEqual({total:2,done:0,replanned:true});
});
it('does not invent a denominator for absent, malformed or oversized reports',()=>{
  for(const input of [null,[],[{}],[entry('accepted')],Array.from({length:101},()=>entry())]) {
    expect(readReportedPlan(null,input)).toBeNull();
  }
});
