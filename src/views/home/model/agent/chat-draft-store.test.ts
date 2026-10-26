import { describe, expect, it } from 'vitest';
import { createChatDraftStore } from './chat-draft-store';

const ordinary = { text: 'Explain the checkout flow before changing it.', prefillNonce: null };

describe('chat drafts across map routes', () => {
  it('restores unsent ordinary text after the map dock remounts', () => {
    const folder = { name: 'ontology' };
    createChatDraftStore(folder).write(ordinary);
    expect(createChatDraftStore(folder).read()).toEqual(ordinary);
  });

  it('keeps different folders with the same name separate', () => {
    const folder = { name: 'ontology' };
    createChatDraftStore(folder).write(ordinary);
    expect(createChatDraftStore({ name: 'ontology' }).read().text).toBe('');
  });

  it('does not let a previous folder write into the current folder', () => {
    const first = {};
    const second = {};
    const leaving = createChatDraftStore(first);
    const current = createChatDraftStore(second);
    current.write(ordinary);
    leaving.write({ text: 'An earlier folder', prefillNonce: null });
    expect(createChatDraftStore(second).read()).toEqual(ordinary);
  });

  it('clearing or sending an ordinary draft clears its route recovery', () => {
    const folder = {};
    const store = createChatDraftStore(folder);
    store.write(ordinary);
    store.write({ text: '', prefillNonce: null });
    expect(createChatDraftStore(folder).read().text).toBe('');
  });

  it('keeps prepared requests local to their originating review context', () => {
    const folder = {};
    const store = createChatDraftStore(folder);
    store.write(ordinary);
    const prepared = { text: 'Investigate this source snapshot.\n\nScope:\nevidence', prefillNonce: 7 };
    store.write(prepared);
    expect(store.read()).toEqual(prepared);
    expect(createChatDraftStore(folder).read()).toEqual({ text: '', prefillNonce: null });
  });

  it('does not share drafts when there is no open folder identity', () => {
    createChatDraftStore(null).write(ordinary);
    expect(createChatDraftStore(null).read().text).toBe('');
  });
});
