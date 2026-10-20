import { beforeEach, describe, expect, it, vi } from 'vitest';

const archive = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock('@/entities/analysis-record', async (original) => ({ ...await original<object>(), readAnalysisHistory: archive.read }));
import { countSavedExplanations } from './count-saved-explanations';

const scope = { projectSlug: 'store', projectUid: null, targetSlugs: [], profileSlug: null };
const run = (surface: string, projectSlug = 'store') => ({ recordType: 'run', mode: 'meaning', scope: { ...scope, projectSlug }, origin: { surface } });
const handle = {} as FileSystemDirectoryHandle;

describe('countSavedExplanations', () => {
  beforeEach(() => archive.read.mockReset());

  it('counts only this surface and exact scope, across pages', async () => {
    archive.read
      .mockResolvedValueOnce({ records: [run('analysis'), run('map'), run('analysis', 'other')], nextCursor: 'next.md' })
      .mockResolvedValueOnce({ records: [run('analysis'), { recordType: 'review' }], nextCursor: null });
    expect(await countSavedExplanations(handle, { mode: 'meaning', scope })).toBe(2);
    expect(archive.read).toHaveBeenLastCalledWith(handle, { limit: 100, cursor: 'next.md' });
  });

  it('reads zero from an empty archive and from an unreadable one', async () => {
    archive.read.mockResolvedValueOnce({ records: [], nextCursor: null });
    expect(await countSavedExplanations(handle, { mode: 'meaning', scope })).toBe(0);
    archive.read.mockRejectedValueOnce(new Error('denied'));
    expect(await countSavedExplanations(handle, { mode: 'meaning', scope })).toBe(0);
  });
});
