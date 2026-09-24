import { describe, expect, it } from 'vitest';
import type { VaultDoc } from '@/entities/docs-vault';
import { addGrowthEntry, EMPTY_GROWTH, growthProgress, growthProjectKey, growthTargets, parseCompanionGrowth, type GrowthEntry } from './companion-growth';
const uid = '442d74e4-ea20-4229-8fe3-2b8a98743aa4';
const secondUid = '542d74e4-ea20-4229-8fe3-2b8a98743aa4';
const target = {uid,slug:'capabilities/checkout',title:'Checkout'};
const explored: GrowthEntry = {kind:'explored',target,at:1};
const reflected: GrowthEntry = {kind:'reflected',target,at:2,note:'The retry condition still needs evidence.',reflection:'uncertain'};
const doc = (id = uid, kind = 'capability', slug = target.slug) => ({slug,title:'Checkout',frontmatter:{uid:id,kind,display_ko:'결제'}} as unknown as VaultDoc);
describe('companion project experience', () => {
  it('earns experience once per identity and action, including uncertainty; rename and replay cannot farm XP', () => {
    const first = addGrowthEntry(EMPTY_GROWTH, explored)!;
    expect(growthProgress(first).xp).toBe(5);
    expect(addGrowthEntry(first, {...explored,target:{...target,slug:'capabilities/renamed'},at:50})).toBe(first);
    const next = addGrowthEntry(first,reflected)!;
    expect(growthProgress(next).xp).toBe(20);
    expect(addGrowthEntry(next,{...reflected,reflection:'learned',note:'Now understood.'})).toBe(next);
    expect(next.entries[0].reflection).toBe('uncertain');
  });
  it('rejects corrupt or invented reward fields instead of replacing saved history', () => {
    expect(parseCompanionGrowth(null)).toEqual(EMPTY_GROWTH);
    for(const value of ['broken',JSON.stringify({version:1,entries:[{...explored,kind:'approved'}]}),JSON.stringify({version:1,entries:[explored,explored]}),JSON.stringify({version:1,entries:[{...reflected,note:' '}]}),JSON.stringify({version:1,entries:[{...explored,at:-1}]})]) expect(parseCompanionGrowth(value)).toBeNull();
    expect(addGrowthEntry(EMPTY_GROWTH, {...explored,target:{...target,uid:'missing'}})).toBeNull();
  });
  it('only uses unique persisted project and concept identities; folder display names never scope XP', () => {
    const project = doc(secondUid,'project','project');
    expect(growthProjectKey([project,doc()])).toBe(secondUid);
    expect(growthProjectKey([doc()])).toBeNull();
    expect(growthProjectKey([project,{...project,slug:'another'}])).toBeNull();
    expect(growthTargets([doc(),doc()], 'ko')).toEqual([]);
    expect(growthTargets([doc('not-a-uid')], 'en')).toEqual([]);
    expect(growthTargets([project,doc()], 'ko')).toEqual([{...target,title:'결제'}]);
  });
  it('grows at exact thresholds, stays bounded within its next level, and keeps later levels useful', () => {
    for(const [xp,level,stage] of [[0,1,1],[25,1,1],[30,2,2],[80,3,3],[160,4,4],[280,5,5],[440,6,5]]) {
      const entries=Array.from({length:xp/5},(_,i)=>({...explored,target:{...target,uid:String(i)}}));
      const result=growthProgress({version:1,entries});
      expect(result).toMatchObject({xp,level,stage});
      expect(result.earned).toBeGreaterThanOrEqual(0);expect(result.earned).toBeLessThan(result.needed);
    }
  });
});
