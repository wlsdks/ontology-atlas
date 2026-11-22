import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OFF_VECTOR_STATUS, searchVectors, type VectorFound, type VectorPhase, type VectorStatus } from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';
import { askAndFollowFailure, searchableSource } from './use-vector-search';
import { readStatusAgain } from './vector-store';

vi.mock('@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors', async (original) => ({
  ...(await original<typeof import('@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors')>()),
  searchVectors: vi.fn(),
}));
vi.mock('./vector-store', () => ({ readStatusAgain: vi.fn(async () => undefined), useVectorStatus: vi.fn() }));

const status = (phase: VectorPhase, filesDone = 0): VectorStatus => ({ ...OFF_VECTOR_STATUS, phase, filesDone, filesTotal: 40 });
const choice = { source: { kind: 'builtin' } as const, paused: false };

describe('searchableSource', () => {
  it('asks by meaning in a ready or preparing folder, and a stopped one after its first file', () => {
    for (const ready of [status('ready', 40), status('preparing', 0), status('stopped', 1)]) {
      expect(searchableSource(ready, choice, true, true)).toEqual({ kind: 'builtin' });
    }
  });

  it('asks by words alone on the web, without a choice, with the index off, or before vectors hold anything', () => {
    expect(searchableSource(status('ready', 40), choice, false, true)).toBeNull();
    expect(searchableSource(status('ready', 40), null, true, true)).toBeNull();
    expect(searchableSource(status('ready', 40), choice, true, false)).toBeNull();
    expect(searchableSource(null, choice, true, true)).toBeNull();
    expect(searchableSource(status('stopped', 0), choice, true, true)).toBeNull();
    for (const phase of ['off', 'notSetUp', 'waitingTurn', 'modelDownloading', 'modelConverting', 'failed'] as const) {
      expect(searchableSource(status(phase, 12), choice, true, true)).toBeNull();
    }
  });
});

describe('askAndFollowFailure', () => {
  const found = (state: VectorFound['state']): VectorFound => ({
    state, failure: state === 'failed' ? 'modelGone' : null, hits: [], staleDropped: 0, filesReady: 40, filesTotal: 40, busy: false,
  });
  beforeEach(() => vi.mocked(readStatusAgain).mockClear());

  it('reads the folder status again once after a failed search, before the results return', async () => {
    let reread = false;
    vi.mocked(readStatusAgain).mockImplementationOnce(async () => { reread = true; });
    vi.mocked(searchVectors).mockResolvedValueOnce(found('failed'));
    const answer = await askAndFollowFailure('/vault', { kind: 'builtin' }, 'why');
    expect(answer.failure).toBe('modelGone');
    expect(reread).toBe(true);
    expect(readStatusAgain).toHaveBeenCalledExactlyOnceWith('/vault');
  });

  it('leaves the status alone when the search answered or was not ready', async () => {
    for (const state of ['ok', 'notReady'] as const) {
      vi.mocked(searchVectors).mockResolvedValueOnce(found(state));
      await askAndFollowFailure('/vault', { kind: 'builtin' }, 'why');
    }
    expect(readStatusAgain).not.toHaveBeenCalled();
  });
});
