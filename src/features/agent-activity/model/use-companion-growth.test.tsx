import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { COMPANION_STORAGE_KEY } from './companion-journal';
import { GROWTH_PREFIX, growthProgress, type GrowthEntry } from './companion-growth';
import { useCompanionGrowth } from './use-companion-growth';
const entry:GrowthEntry={kind:'explored',target:{uid:'442d74e4-ea20-4229-8fe3-2b8a98743aa4',slug:'capabilities/checkout',title:'Checkout'},at:1};
beforeEach(()=>localStorage.clear());afterEach(()=>vi.restoreAllMocks());
it('keeps projects isolated, reopens earned progress, and does not convert old personal memories',()=>{
  localStorage.setItem(COMPANION_STORAGE_KEY,'{"version":1,"memories":[]}');
  const h=renderHook(({project})=>useCompanionGrowth(project),{initialProps:{project:'first'}});
  act(()=>expect(h.result.current.record(entry)).toBe(true));
  expect(localStorage.getItem('ontology-atlas:companion-growth:v1:first')).not.toBeNull();
  h.rerender({project:'second'});expect(h.result.current.growth.entries).toHaveLength(0);
  h.rerender({project:'first'});expect(growthProgress(h.result.current.growth).xp).toBe(5);
  act(()=>h.result.current.record(entry));expect(growthProgress(h.result.current.growth).xp).toBe(5);
  expect(localStorage.getItem(COMPANION_STORAGE_KEY)).toBe('{"version":1,"memories":[]}');
});
it('fails closed for unreadable history, no project, and failed writes',()=>{
  const h=renderHook(()=>useCompanionGrowth('first'));
  vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw Error('quota');});
  act(()=>expect(h.result.current.record(entry)).toBe(false));expect(h.result.current.failed).toBe(true);expect(h.result.current.growth.entries).toHaveLength(0);
  vi.restoreAllMocks();localStorage.setItem(GROWTH_PREFIX+'first','broken');
  act(()=>window.dispatchEvent(new StorageEvent('storage')));expect(h.result.current.unreadable).toBe(true);
  act(()=>expect(h.result.current.record(entry)).toBe(false));expect(localStorage.getItem(GROWTH_PREFIX+'first')).toBe('broken');
  const empty=renderHook(()=>useCompanionGrowth(null));act(()=>expect(empty.result.current.record(entry)).toBe(false));
});
