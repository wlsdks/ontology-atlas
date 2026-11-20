import { describe, expect, it } from 'vitest';
import type { VectorProbe } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { offeredRunnerModel } from './MeaningSetupDialog';

const probe = (models: string[], state: 'reachable' | 'unreachable' = 'reachable'): VectorProbe => ({
  files: 1,
  builtin: { onDisk: true, modelBytes: 1, downloadBytes: 1, keptBytes: 1, neededFreeBytes: 1, freeBytes: 1, memoryBytes: 1, accelerated: true },
  runner: { state, address: 'http://127.0.0.1:11434', models },
});

describe('the Ollama model the setup dialog offers', () => {
  it('prefers bge-m3 under any tag', () => {
    expect(offeredRunnerModel(probe(['nomic-embed-text:latest', 'bge-m3:567m']))).toBe('bge-m3:567m');
  });

  it('never offers the models the spec rules out, even when nothing else is there', () => {
    expect(offeredRunnerModel(probe(['embeddinggemma:300m', 'jina-embeddings-v3', 'nomic-embed-text']))).toBe('nomic-embed-text');
    expect(offeredRunnerModel(probe(['embeddinggemma:latest', 'library/jina-embeddings-v3:q8']))).toBeNull();
  });

  it('offers nothing when Ollama does not answer', () => {
    expect(offeredRunnerModel(probe(['bge-m3'], 'unreachable'))).toBeNull();
  });
});
