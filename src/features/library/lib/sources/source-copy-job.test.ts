import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TauriSourceImportResult } from '@/shared/lib/vault-folder/native-vault/tauri-library-sources';
import { readSourceCopy, startSourceCopy, stopSourceCopy, type SourceCopyPlan } from './add-sources';

const bridge = vi.hoisted(() => ({ offered: vi.fn(), stop: vi.fn() }));
vi.mock('@/shared/lib/vault-folder/native-vault/tauri-library-sources', () => ({
  importTauriOfferedSources: bridge.offered,
  stopTauriSourceImport: bridge.stop,
  importTauriSourceFiles: vi.fn(),
  pickTauriSourceFiles: vi.fn(),
}));

const row = (name: string, status: TauriSourceImportResult['status'], reason: string | null = null): TauriSourceImportResult => ({
  pickedName: name,
  status,
  relativePath: status === 'failed' ? null : `sources/${name}`,
  sha256: null,
  size: 3,
  reason,
});

const plan = (names: string[], extra: Partial<SourceCopyPlan> = {}): SourceCopyPlan => ({
  rootPath: '/vault',
  paths: names.map((name) => `/elsewhere/${name}`),
  skipped: [],
  ...extra,
});

beforeEach(() => {
  bridge.offered.mockReset();
  bridge.stop.mockReset();
});

describe('a background copy reports into one job per folder', () => {
  it('counts the same bytes as skipped, streams progress, and keeps the finished job readable', async () => {
    const seen: number[] = [];
    bridge.offered.mockImplementationOnce(async (_root: string, _paths: string[], _id: string, onProgress: (p: { done: number }) => void) => {
      onProgress({ done: 1 });
      seen.push(readSourceCopy('scope-a')!.done);
      return [row('again.txt', 'duplicate'), row('new.txt', 'added')];
    });
    const job = await startSourceCopy('scope-a', plan(['again.txt', 'new.txt'], { skipped: [{ name: 'notes/.env', reason: 'secretName' }] }));
    expect(seen).toEqual([1]);
    expect(job).toMatchObject({ phase: 'done', added: 1, done: 2, total: 2 });
    expect(job?.skipped).toEqual([
      { name: 'notes/.env', reason: 'secretName' },
      { name: 'again.txt', reason: 'same' },
    ]);
    expect(readSourceCopy('scope-a')).toBe(job);
  });

  it('names a refused file and its reason in the job', async () => {
    bridge.offered.mockResolvedValueOnce([row('a.txt', 'added'), row('b.txt', 'failed', 'disk-full')]);
    const job = await startSourceCopy('scope-failed', plan(['a.txt', 'b.txt']));
    expect(job).toMatchObject({ phase: 'done', added: 1, failureReason: 'disk-full' });
    expect(job?.failed).toEqual([{ name: 'b.txt', reason: 'disk-full' }]);
  });

  it('marks a stopped copy, asks Rust to stop that import, and keeps the count that landed', async () => {
    let release: (rows: TauriSourceImportResult[]) => void = () => {};
    bridge.offered.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const running = startSourceCopy('scope-b', plan(['a.txt', 'b.txt', 'c.txt']));
    stopSourceCopy('scope-b');
    release([row('a.txt', 'added')]);
    const job = await running;
    expect(bridge.stop).toHaveBeenCalledWith(job?.id);
    expect(job).toMatchObject({ phase: 'stopped', added: 1, done: 1, total: 3 });
  });

  it('starts no second copy of a folder while the first runs', async () => {
    let release: (rows: TauriSourceImportResult[]) => void = () => {};
    bridge.offered.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }));
    const first = startSourceCopy('scope-c', plan(['a.txt']));
    expect(await startSourceCopy('scope-c', plan(['b.txt']))).toBeNull();
    release([row('a.txt', 'added')]);
    expect((await first)?.added).toBe(1);
    expect(bridge.offered).toHaveBeenCalledTimes(1);
  });
});
