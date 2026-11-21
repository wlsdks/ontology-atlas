import { describe, expect, it } from 'vitest';

import { OFF_VECTOR_STATUS, type VectorStatus } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { runStage } from './run-stage';

const status = (fields: Partial<VectorStatus>): VectorStatus => ({ ...OFF_VECTOR_STATUS, ...fields });
const builtin = { kind: 'builtin' } as const;
const runner = { kind: 'runner', baseUrl: 'http://localhost:11434', model: 'bge-m3:latest' } as const;

describe('the stage of a folder preparing for search by meaning', () => {
  it('walks the built-in model through download, fit and read, with what each has done', () => {
    const downloading = runStage(status({ phase: 'modelDownloading', model: { doneBytes: 600, totalBytes: 2400 } }), builtin);
    expect(downloading?.steps.map((step) => step.state)).toEqual(['now', 'next', 'next']);
    expect(downloading?.fraction).toBe(0.25);

    const fitting = runStage(status({ phase: 'modelConverting' }), builtin);
    expect(fitting?.steps.map((step) => step.state)).toEqual(['done', 'now', 'next']);
    expect(fitting?.fraction).toBeNull();

    const reading = runStage(status({ phase: 'preparing', filesDone: 30, filesTotal: 120, passagesDone: 412, currentPath: 'wiki/trust.md' }), builtin);
    expect(reading?.steps.map((step) => step.state)).toEqual(['done', 'done', 'now']);
    expect(reading).toMatchObject({ step: 'read', fraction: 0.25, readingPath: 'wiki/trust.md', passagesDone: 412 });
  });

  it('counts nothing before the download knows its size', () => {
    expect(runStage(status({ phase: 'modelDownloading', model: { doneBytes: 0, totalBytes: 0 } }), builtin)?.fraction).toBeNull();
  });

  it("shows only the reading for a runner's model, which Ollama already holds", () => {
    expect(runStage(status({ phase: 'preparing', filesDone: 1, filesTotal: 20 }), runner)?.steps).toEqual([{ step: 'read', state: 'now' }]);
  });

  it('waits with every step ahead, and leaves a small update and a finished folder to the line', () => {
    expect(runStage(status({ phase: 'waitingTurn' }), builtin)?.steps.every((step) => step.state === 'next')).toBe(true);
    expect(runStage(status({ phase: 'preparing', updating: true, filesDone: 1, filesTotal: 3 }), builtin)).toBeNull();
    expect(runStage(status({ phase: 'preparing', updating: true, filesDone: 1, filesTotal: 30 }), builtin)?.step).toBe('read');
    expect(runStage(status({ phase: 'ready' }), builtin)).toBeNull();
  });
});
