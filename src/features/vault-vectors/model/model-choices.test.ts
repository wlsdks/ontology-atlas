import { describe, expect, it } from 'vitest';
import type { VectorProbe } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { choiceIdOf, modelChoices, offeredRunnerModels } from './model-choices';

const probe = (models: string[], state: 'reachable' | 'unreachable' = 'reachable', builtin: Partial<VectorProbe['builtin']> = {}): VectorProbe => ({
  files: 1,
  builtin: { onDisk: true, modelBytes: 1, downloadBytes: 1, keptBytes: 1, neededFreeBytes: 1, freeBytes: 1, memoryBytes: 1, accelerated: true, modelDir: '/models/bge-m3', ...builtin },
  runner: { state, address: 'http://127.0.0.1:11434', models },
});

describe('the Ollama models the model dialog offers', () => {
  it('puts bge-m3 under any tag first', () => {
    expect(offeredRunnerModels(probe(['nomic-embed-text:latest', 'bge-m3:567m']))).toEqual(['bge-m3:567m', 'nomic-embed-text:latest']);
  });

  it('never offers the models the spec rules out', () => {
    expect(offeredRunnerModels(probe(['embeddinggemma:300m', 'library/jina-embeddings-v3:q8', 'nomic-embed-text']))).toEqual(['nomic-embed-text']);
  });

  it('offers nothing when Ollama does not answer', () => {
    expect(offeredRunnerModels(probe(['bge-m3'], 'unreachable'))).toEqual([]);
  });
});

describe('the model choices', () => {
  it('lists the built-in model first and marks what the folder uses', () => {
    const choices = modelChoices(probe(['bge-m3:latest']), { kind: 'runner', baseUrl: 'http://127.0.0.1:11434', model: 'bge-m3:latest' });
    expect(choices.map((choice) => [choice.id, choice.inUse])).toEqual([['builtin', false], ['runner:bge-m3:latest', true]]);
  });

  it('keeps the folder runner model listed as unreachable while Ollama is off', () => {
    const choices = modelChoices(probe([], 'unreachable'), { kind: 'runner', baseUrl: 'http://localhost:11434', model: 'bge-m3:latest' });
    expect(choices[1]).toMatchObject({ model: 'bge-m3:latest', reachable: false, inUse: true, baseUrl: 'http://localhost:11434' });
  });

  it.each([
    [{ onDisk: true, modelBytes: 9 }, 'ready'],
    [{ onDisk: false, modelBytes: 9 }, 'partial'],
    [{ onDisk: false, modelBytes: 0 }, 'none'],
  ] as const)('reads the built-in model holding from the probe (%o)', (builtin, holding) => {
    expect(modelChoices(probe([], 'reachable', builtin), null)[0]).toMatchObject({ holding });
  });

  it('selects the folder source, or the built-in model without one', () => {
    expect(choiceIdOf(null)).toBe('builtin');
    expect(choiceIdOf({ kind: 'runner', baseUrl: 'x', model: 'm:1' })).toBe('runner:m:1');
  });
});
