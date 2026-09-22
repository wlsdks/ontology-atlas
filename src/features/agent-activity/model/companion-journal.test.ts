import { describe, expect, it } from 'vitest';
import { EMPTY_JOURNAL, MEMORY_LIMIT, appendCompanionMemory, parseCompanionJournal, type CompanionMemory } from './companion-journal';
const memory = (id: string, kind: CompanionMemory['kind'] = 'uncertain'): CompanionMemory => ({ id, kind, keepsake: 'star', note: 'Need to inspect the relation evidence.', folder: 'Atlas', createdAt: 1 });

describe('personal companion memories', () => {
  it('starts empty and accepts uncertainty without approval or agent evidence', () => {
    expect(parseCompanionJournal(null)).toEqual(EMPTY_JOURNAL);
    const next = appendCompanionMemory(EMPTY_JOURNAL, memory('one'));
    expect(parseCompanionJournal(JSON.stringify(next))?.memories[0]).toEqual(memory('one'));
  });
  it('rejects corrupt or future data instead of silently overwriting it', () => {
    for (const raw of ['{', '{"version":2,"memories":[]}', JSON.stringify({ version: 1, memories: [{ ...memory('x'), kind: 'approved' }] }), JSON.stringify({version:1,memories:[memory('x'),memory('x')]})]) {
      expect(parseCompanionJournal(raw)).toBeNull();
    }
  });
  it('keeps old memories when the journal is full', () => {
    const full = { version: 1 as const, memories: Array.from({length: MEMORY_LIMIT}, (_, i) => memory(String(i))) };
    expect(appendCompanionMemory(full, memory('new'))).toBeNull();
    expect(full.memories).toHaveLength(MEMORY_LIMIT);
  });
  it('rejects empty or oversized notes and invalid dates', () => {
    for (const patch of [{note:' '},{note:'x'.repeat(241)},{createdAt:-1},{folder:'x'.repeat(161)}]) {
      expect(appendCompanionMemory(EMPTY_JOURNAL, {...memory('one'),...patch})).toBeNull();
    }
  });
});
