import { describe, expect, it } from 'vitest';
import type { VectorProbe } from '@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors';
import { choiceIdOf, choiceTag, isDeletable, isDiskShort, isSwitching, modelChoices, offeredRunnerModels, primaryPress, recommendedChoiceId, type ModelChoice } from './model-choices';

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

describe('the recommended choice', () => {
  it('is Ollama bge-m3 while the built-in model is not downloaded', () => {
    expect(recommendedChoiceId(modelChoices(probe(['nomic-embed-text', 'bge-m3:latest'], 'reachable', { onDisk: false, modelBytes: 0 }), null))).toBe('runner:bge-m3:latest');
  });

  it('is the built-in model once its download has begun, or when Ollama has no bge-m3', () => {
    expect(recommendedChoiceId(modelChoices(probe(['bge-m3:latest']), null))).toBe('builtin');
    expect(recommendedChoiceId(modelChoices(probe(['bge-m3:latest'], 'reachable', { onDisk: false, modelBytes: 412_000_000 }), null))).toBe('builtin');
    expect(recommendedChoiceId(modelChoices(probe(['nomic-embed-text'], 'reachable', { onDisk: false, modelBytes: 0 }), null))).toBe('builtin');
  });
});

describe('what the dialog says and offers for a choice', () => {
  const builtin = (holding: 'ready' | 'partial' | 'none', inUse = false): ModelChoice => ({ id: 'builtin', kind: 'builtin', holding, inUse });
  const runner = (reachable: boolean, inUse = false): ModelChoice => ({ id: 'runner:bge-m3', kind: 'runner', model: 'bge-m3', baseUrl: 'http://127.0.0.1:11434', reachable, inUse });
  const builtinSource = { kind: 'builtin' } as const;

  it('tags the running job first, then the model the folder searches with, then what the model holds', () => {
    expect(choiceTag(builtin('ready', true), true)).toBe('tagWorking');
    expect(choiceTag(builtin('ready', true), false)).toBe('tagInUse');
    expect(choiceTag(builtin('partial', true), false)).toBe('tagPartial');
    expect(choiceTag(builtin('none'), false)).toBe('tagNone');
    expect(choiceTag(builtin('ready'), true)).toBe('tagReady');
    expect(choiceTag(runner(true, true), false)).toBe('tagInUse');
    expect(choiceTag(runner(false, true), false)).toBe('tagRunnerOff');
    expect(choiceTag(runner(true), false)).toBe('tagRunner');
  });

  it('offers no start while a job runs or the choice already searches, and holds a start that cannot run', () => {
    expect(primaryPress(builtin('none'), true, false)).toBeNull();
    expect(primaryPress(builtin('ready', true), false, false)).toBeNull();
    expect(primaryPress(builtin('ready'), false, false)).toEqual({ label: 'prepare', disabled: false });
    expect(primaryPress(builtin('partial'), false, false)).toEqual({ label: 'resumeDownload', disabled: false });
    expect(primaryPress(builtin('none'), false, true)).toEqual({ label: 'downloadAndPrepare', disabled: true });
    expect(primaryPress(runner(false), false, true)).toEqual({ label: 'prepare', disabled: true });
    expect(primaryPress(runner(true), false, true)).toEqual({ label: 'prepare', disabled: false });
  });

  it('deletes only kept built-in files that no job of the built-in model is using', () => {
    expect(isDeletable(builtin('ready'), builtinSource, false)).toBe(true);
    expect(isDeletable(builtin('partial'), null, true)).toBe(true);
    expect(isDeletable(builtin('ready'), builtinSource, true)).toBe(false);
    expect(isDeletable(builtin('none'), null, false)).toBe(false);
    expect(isDeletable(runner(true), null, false)).toBe(false);
  });

  it('warns of a switch only when the folder has another model and nothing runs', () => {
    expect(isSwitching(runner(true), builtinSource, false)).toBe(true);
    expect(isSwitching(runner(true), null, false)).toBe(false);
    expect(isSwitching(runner(true), builtinSource, true)).toBe(false);
    expect(isSwitching(builtin('ready', true), builtinSource, false)).toBe(false);
  });

  it('is short of room when the free space is under what the download needs', () => {
    expect(isDiskShort(probe([], 'reachable', { freeBytes: 9, neededFreeBytes: 10 }))).toBe(true);
    expect(isDiskShort(probe([], 'reachable', { freeBytes: 10, neededFreeBytes: 10 }))).toBe(false);
  });
});
