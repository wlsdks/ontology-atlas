import { describe, expect, it } from 'vitest';

import { OFF_VECTOR_STATUS, type VectorPhase, type VectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { searchableSource } from './use-vector-search';

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
