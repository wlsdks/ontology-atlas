import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { gitNodeRevisionContent, gitNodeRevisions, type GitNodeRevisionRef } from '@/shared/lib/tauri-git';
import { readSummaryFreshness } from './use-summary-freshness';

vi.mock('@/shared/lib/tauri-git', () => ({ gitNodeRevisions: vi.fn(), gitNodeRevisionContent: vi.fn() }));

const references: GitNodeRevisionRef[] = [3, 2, 1, 0].map((day) => ({
  slug: 'domains/probe', revision: String(day).padStart(40, '0'), isoTime: `2026-09-0${day + 1}T00:00:00Z`,
}));
const text = (body: string, children = 'a') => `---\nkind: domain\ncontains: [${children}]\n---\n${body}`;
const bodies = [text('new', 'a, b'), text('new'), text('old'), text('older')];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gitNodeRevisions).mockResolvedValue(references);
  vi.mocked(gitNodeRevisionContent).mockImplementation(async (_path, ref) => bodies[references.indexOf(ref)]);
});
afterEach(() => vi.restoreAllMocks());

describe('incremental summary history', () => {
  it('stops requesting history when the traversal budget expires', async () => {
    const now = vi.spyOn(performance, 'now').mockReturnValue(0);
    vi.mocked(gitNodeRevisionContent).mockImplementationOnce(async () => { now.mockReturnValue(30_000); return bodies[0]; });
    const result = await readSummaryFreshness('/vault', ['domains/probe', 'domains/other'], () => true);
    expect(result?.verdicts.size).toBe(0);
    expect([...result!.unavailable]).toEqual(['domains/probe', 'domains/other']);
    expect(gitNodeRevisions).toHaveBeenCalledTimes(1);
    expect(gitNodeRevisionContent).toHaveBeenCalledTimes(1);
  });
  it('stops body reads once both latest change dates are established', async () => {
    const result = await readSummaryFreshness('/vault', ['domains/probe'], () => true);
    expect(result?.verdicts.get('domains/probe')).toMatchObject({
      bodyChangedAt: '2026-09-03T00:00:00.000Z', membershipChangedAt: '2026-09-04T00:00:00.000Z', behindByMs: 86_400_000,
    });
    expect(gitNodeRevisionContent).toHaveBeenCalledTimes(3);
    expect(gitNodeRevisionContent).toHaveBeenNthCalledWith(3, '/vault', references[2]);
  });

  it('uses the oldest completed revision when one clock never moved', async () => {
    vi.mocked(gitNodeRevisionContent).mockImplementation(async (_path, ref) => text('same', ref === references[0] ? 'a, b' : 'a'));
    const result = await readSummaryFreshness('/vault', ['domains/probe'], () => true);
    expect(gitNodeRevisionContent).toHaveBeenCalledTimes(4);
    expect(result?.verdicts.get('domains/probe')?.behindByMs).toBe(3 * 86_400_000);
  });

  it('does not turn an incomplete comparison into an oldest-date verdict', async () => {
    vi.mocked(gitNodeRevisionContent).mockResolvedValueOnce(bodies[0]).mockResolvedValueOnce(bodies[1]).mockRejectedValueOnce('git-history-too-large');
    const result = await readSummaryFreshness('/vault', ['domains/probe'], () => true);
    expect(result?.verdicts.size).toBe(0);
    expect(result?.unavailable.has('domains/probe')).toBe(true);
  });

  it('drops a superseded scan and makes no subsequent body request', async () => {
    let current = true;
    vi.mocked(gitNodeRevisionContent).mockImplementationOnce(async () => { current = false; return bodies[0]; });
    expect(await readSummaryFreshness('/vault', ['domains/probe'], () => current)).toBeNull();
    expect(gitNodeRevisionContent).toHaveBeenCalledTimes(1);
  });

  it('does not load bodies for insufficient or superseded reference lists', async () => {
    vi.mocked(gitNodeRevisions).mockResolvedValueOnce(references.slice(0, 1));
    expect((await readSummaryFreshness('/vault', ['domains/probe'], () => true))?.verdicts.size).toBe(0);
    let current = true;
    vi.mocked(gitNodeRevisions).mockImplementationOnce(async () => { current = false; return references; });
    expect(await readSummaryFreshness('/vault', ['domains/probe'], () => current)).toBeNull();
    expect(gitNodeRevisionContent).not.toHaveBeenCalled();
  });

  it('keeps independently completed nodes when another history is unavailable', async () => {
    vi.mocked(gitNodeRevisions).mockRejectedValueOnce('git-history-timeout').mockResolvedValueOnce(references);
    const result = await readSummaryFreshness('/vault', ['domains/failed', 'domains/probe'], () => true);
    expect([...result!.unavailable]).toEqual(['domains/failed']);
    expect([...result!.verdicts.keys()]).toEqual(['domains/probe']);
  });

  it('preserves missing-file revisions without treating an absent repository as stale', async () => {
    vi.mocked(gitNodeRevisionContent).mockResolvedValueOnce(null).mockResolvedValueOnce(bodies[0]).mockResolvedValueOnce(bodies[1]).mockResolvedValueOnce(bodies[2]);
    expect((await readSummaryFreshness('/vault', ['domains/probe'], () => true))?.verdicts.size).toBe(1);
    vi.mocked(gitNodeRevisions).mockRejectedValueOnce('git-repo-missing');
    const result = await readSummaryFreshness('/vault', ['domains/probe'], () => true);
    expect(result?.unavailable.size).toBe(0);
    expect(result?.verdicts.size).toBe(0);
  });
});
