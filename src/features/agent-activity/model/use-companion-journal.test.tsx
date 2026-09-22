import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { COMPANION_STORAGE_KEY, type CompanionMemory } from './companion-journal';
import { useCompanionJournal } from './use-companion-journal';
const memory = (id: string): CompanionMemory => ({id,kind:'uncertain',keepsake:'plant',note:'Evidence still missing.',folder:'',createdAt:1});
beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());
describe('companion persistence', () => {
  it('shares explicit memories across mounted homes and reads latest before writing', () => {
    const first = renderHook(useCompanionJournal);
    const second = renderHook(useCompanionJournal);
    act(() => { expect(first.result.current.save(memory('one'))).toBe(true); expect(second.result.current.save(memory('two'))).toBe(true); });
    expect(first.result.current.journal.memories.map(m=>m.id)).toEqual(['two','one']);
    first.unmount(); second.unmount();
    const reopened = renderHook(useCompanionJournal);
    expect(reopened.result.current.journal.memories).toHaveLength(2);
    act(()=> { reopened.result.current.remove('one'); });
    expect(reopened.result.current.journal.memories.map(m=>m.id)).toEqual(['two']);
    act(()=> { reopened.result.current.reset(); });
    expect(reopened.result.current.journal.memories).toEqual([]);
  });
  it('does not report storage failures as saved memories', () => {
    const hook = renderHook(useCompanionJournal);
    vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('quota');});
    act(()=>expect(hook.result.current.save(memory('one'))).toBe(false));
    expect(hook.result.current.journal.memories).toEqual([]);
  });
  it('requires an explicit reset to replace corrupt stored data', () => {
    localStorage.setItem(COMPANION_STORAGE_KEY,'broken');
    const hook = renderHook(useCompanionJournal);
    expect(hook.result.current.unreadable).toBe(true);
    act(()=>expect(hook.result.current.save(memory('one'))).toBe(false));
    expect(localStorage.getItem(COMPANION_STORAGE_KEY)).toBe('broken');
    act(()=>expect(hook.result.current.reset()).toBe(true));
    expect(hook.result.current.unreadable).toBe(false);
  });
});
