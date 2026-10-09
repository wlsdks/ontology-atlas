import { beforeEach, describe, expect, it, vi } from 'vitest';
const historyReader = vi.hoisted(() => vi.fn());
vi.mock('@/entities/analysis-record', async (original) => ({ ...await original<object>(), readAnalysisHistory: historyReader }));
import { currentAnalysisBasis, type AnalysisCaptureContext } from '@/features/acp-session';
import type { AnalysisRun } from '@/entities/analysis-record';
import { createFlowArchiveLoader, flowHeadingChanges, selectFlowVersions } from './flow-history';

const basis = (graphHash: string | null) => ({ graphHash, sourceFingerprint: null, profileHash: null, documents: [] });

const run = (overrides: Record<string, unknown> = {}) => ({
  schema: 'atlas-analysis/v1',
  recordType: 'run',
  id: 'run-1',
  createdAt: '2026-09-18T00:00:00Z',
  mode: 'meaning',
  scope: { projectSlug: 'project', projectUid: null, targetSlugs: [], profileSlug: null },
  request: { id: 'r', text: 'ask', parentRunId: null },
  origin: { surface: 'analysis', runtimeId: 'claude-acp', sessionId: null, userEventId: 'u', answerEventId: 'a', startedAt: '2026-09-18T00:00:00Z', stopReason: null, outcome: 'completed' },
  basis: basis('graph-1'),
  evidence: [],
  observations: [],
  profileSnapshot: null,
  toolReads: [],
  sourceAccess: 'atlas-only',
  findings: [],
  qualification: { status: 'grounded', reasons: [] },
  answer: '### 왜 있나\n설명.',
  ...overrides,
}) as never;

const context = { mode: 'meaning', scope: { projectSlug: 'project', projectUid: null, targetSlugs: [], profileSlug: null } } as never;

describe('selectFlowVersions', () => {
  it('keeps this surface, this scope and completed answers, newest first', () => {
    const versions = selectFlowVersions(
      [
        run(),
        run({ id: 'run-2', createdAt: '2026-09-19T00:00:00Z' }),
        run({ id: 'other-surface', origin: { ...(run() as unknown as { origin: Record<string, unknown> }).origin, surface: 'architecture' } }),
        run({ id: 'cancelled', origin: { ...(run() as unknown as { origin: Record<string, unknown> }).origin, outcome: 'cancelled' } }),
        run({ id: 'empty', answer: '   ' }),
        run({ id: 'other-project', scope: { projectSlug: 'else', projectUid: null, targetSlugs: [], profileSlug: null } }),
      ],
      context,
      basis('graph-1'),
    );
    expect(versions.map((version) => version.id)).toEqual(['run-2', 'run-1']);
    expect(versions[0]?.standing).toBe('current');
    expect(versions[0]?.writer).toBe('claude-acp');
  });

  it('says the folder moved when the graph behind the explanation changed', () => {
    const versions = selectFlowVersions([run()], context, basis('graph-2'));
    expect(versions[0]?.standing).toBe('stale');
    expect(versions[0]?.reasons).toContain('graphHash_changed');
  });

  it('says unknown rather than current when there is nothing to compare against', () => {
    expect(selectFlowVersions([run()], context, null)[0]?.standing).toBe('unknown');
    expect(selectFlowVersions([run()], null, basis('graph-1'))).toEqual([]);
  });
});

describe('flowHeadingChanges', () => {
  it('names the scenes that were added, removed or rewritten', () => {
    const newer = '### 왜 있나\n새 설명.\n\n### 어디가 책임지나\n같음.\n\n### 새 장면\n추가됨.';
    const older = '### 왜 있나\n옛 설명.\n\n### 어디가 책임지나\n같음.\n\n### 사라진 장면\n지워짐.';
    expect(flowHeadingChanges(newer, older)).toEqual([
      { heading: '왜 있나', change: 'rewritten' },
      { heading: '새 장면', change: 'added' },
      { heading: '사라진 장면', change: 'removed' },
    ]);
  });
});

describe('Flow archive evidence inspection', () => {
  const slug = 'capabilities/refund';
  const markdown = '---\nkind: capability\ntitle: Refund\n---\nRefund within 30 days.\n';
  function readingContext(getFile = vi.fn(async () => new File([markdown], 'refund.md'))): AnalysisCaptureContext {
    return { mode: 'meaning', surface: 'analysis', handle: { kind: 'directory', name: 'test-vault' } as FileSystemDirectoryHandle,
      writable: false, scope: { projectSlug: 'project', projectUid: null, targetSlugs: [], profileSlug: null },
      graph: { nodes: [{ id: slug, title: 'Refund', kind: 'capability' }], edges: [] },
      fileHandles: new Map([[slug, { getFile } as unknown as FileSystemFileHandle]]), sourceFingerprint: null, profileHash: null };
  }
  async function recorded(ctx: AnalysisCaptureContext, overrides: Partial<AnalysisRun> = {}): Promise<AnalysisRun> {
    const { profileSnapshot: _snapshot, ...recordedBasis } = await currentAnalysisBasis(ctx, [slug]);
    return run({ basis: recordedBasis, ...overrides });
  }
  beforeEach(() => { historyReader.mockReset(); });

  it('rechecks the cited document before marking a saved answer current', async () => {
    const ctx = readingContext();
    const saved = await recorded(ctx);
    historyReader.mockResolvedValue({ records: [saved] });
    const publish = vi.fn();
    await createFlowArchiveLoader(ctx, publish).load();
    const state = publish.mock.calls[0][0];
    expect(selectFlowVersions(state.records, ctx, state.basis)[0].standing).toBe('current');
    expect(state.basis.documents.map((doc: { slug: string }) => doc.slug)).toEqual([slug]);
  });

  it('detects a changed body even when the saved graph still matches', async () => {
    const getFile = vi.fn(async () => new File([markdown], 'refund.md'));
    const ctx = readingContext(getFile);
    const saved = await recorded(ctx);
    getFile.mockResolvedValue(new File([markdown.replace('30 days', '7 days')], 'refund.md'));
    historyReader.mockResolvedValue({ records: [saved] });
    const publish = vi.fn();
    await createFlowArchiveLoader(ctx, publish).load();
    const state = publish.mock.calls[0][0];
    expect(selectFlowVersions(state.records, ctx, state.basis)[0]).toMatchObject({ standing: 'stale', reasons: ['document_changed:' + slug] });
  });

  it('keeps unreadable evidence unknown and retains the dated answer', async () => {
    const getFile = vi.fn(async () => new File([markdown], 'refund.md'));
    const ctx = readingContext(getFile);
    const saved = await recorded(ctx);
    getFile.mockRejectedValue(new Error('unavailable'));
    historyReader.mockResolvedValue({ records: [saved] });
    const publish = vi.fn();
    await createFlowArchiveLoader(ctx, publish).load();
    const state = publish.mock.calls[0][0];
    expect(selectFlowVersions(state.records, ctx, state.basis)[0]).toMatchObject({ standing: 'unknown', answer: saved.answer });
  });

  it('ignores an older archive read after a newer refresh has completed', async () => {
    const ctx = readingContext();
    const oldRun = await recorded(ctx);
    const newRun = await recorded(ctx, { id: 'newer', createdAt: '2026-10-09T00:00:00.000Z' });
    const oldRead = Promise.withResolvers<{ records: AnalysisRun[] }>();
    historyReader.mockReturnValueOnce(oldRead.promise).mockResolvedValueOnce({ records: [newRun] });
    const publish = vi.fn();
    const loader = createFlowArchiveLoader(ctx, publish);
    const oldLoad = loader.load();
    await loader.load();
    oldRead.resolve({ records: [oldRun] });
    await oldLoad;
    expect(publish).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].records[0].id).toBe('newer');
  });


  it('ignores an old document inspection after a newer one detects a change', async () => {
    const getFile = vi.fn(async () => new File([markdown], 'refund.md'));
    const ctx = readingContext(getFile);
    const saved = await recorded(ctx);
    const oldFile = Promise.withResolvers<File>();
    const reading = Promise.withResolvers<void>();
    getFile.mockImplementationOnce(() => { reading.resolve(); return oldFile.promise; })
      .mockResolvedValue(new File([markdown.replace('30 days', '7 days')], 'refund.md'));
    historyReader.mockResolvedValue({ records: [saved] });
    const publish = vi.fn();
    const loader = createFlowArchiveLoader(ctx, publish);
    const oldLoad = loader.load();
    await reading.promise;
    await loader.load();
    oldFile.resolve(new File([markdown], 'refund.md'));
    await oldLoad;
    expect(publish).toHaveBeenCalledTimes(1);
    const state = publish.mock.calls[0][0];
    expect(selectFlowVersions(state.records, ctx, state.basis)[0].standing).toBe('stale');
  });

  it('inspects no document when the bounded archive has no matching answers', async () => {
    const getFile = vi.fn(async () => new File([markdown], 'refund.md'));
    const ctx = readingContext(getFile);
    const saved = await recorded(ctx);
    getFile.mockClear();
    historyReader.mockResolvedValue({ records: [{ ...saved, origin: { ...saved.origin, surface: 'map' } }] });
    const publish = vi.fn();
    await createFlowArchiveLoader(ctx, publish).load();
    expect(getFile).not.toHaveBeenCalled();
    expect(publish.mock.calls[0][0].basis).toBeNull();
  });

  it('starts no cited-document read after an archive request is retired', async () => {
    const getFile = vi.fn(async () => new File([markdown], 'refund.md'));
    const ctx = readingContext(getFile);
    const saved = await recorded(ctx);
    getFile.mockClear();
    const pending = Promise.withResolvers<{ records: AnalysisRun[] }>();
    historyReader.mockReturnValue(pending.promise);
    const publish = vi.fn();
    const loader = createFlowArchiveLoader(ctx, publish);
    const loading = loader.load();
    loader.stop();
    pending.resolve({ records: [saved] });
    await loading;
    expect(getFile).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });


  it.each([
    ['project identity', { projectUid: '07d7531c-cf66-4e4b-a871-1e7aa055012a' }],
    ['profile', { profileSlug: 'architecture/other' }],
    ['target scope', { targetSlugs: ['capabilities/refund'] }],
  ])('reads no evidence from a different %s', async (_name, scopeChange) => {
    const getFile = vi.fn(async () => new File([markdown], 'refund.md'));
    const ctx = readingContext(getFile);
    const saved = await recorded(ctx);
    getFile.mockClear();
    historyReader.mockResolvedValue({ records: [{ ...saved, scope: { ...saved.scope, ...scopeChange } }] });
    const publish = vi.fn();
    await createFlowArchiveLoader(ctx, publish).load();
    expect(getFile).not.toHaveBeenCalled();
    expect(publish.mock.calls[0][0].basis).toBeNull();
  });

  it('does not expand evidence scope through an identifier duplicated in another project', async () => {
    const ctx = readingContext();
    const saved = await recorded(ctx);
    const foreignRead = vi.fn(async () => new File([markdown], 'foreign.md'));
    ctx.fileHandles = new Map([...ctx.fileHandles, ['capabilities/foreign', { getFile: foreignRead } as unknown as FileSystemFileHandle]]);
    historyReader.mockResolvedValue({ records: [saved, { ...saved, scope: { ...saved.scope, projectSlug: 'foreign-project' },
      basis: { ...saved.basis, documents: [{ slug: 'capabilities/foreign', digest: saved.basis.documents[0].digest }] } }] });
    const publish = vi.fn();
    await createFlowArchiveLoader(ctx, publish).load();
    expect(foreignRead).not.toHaveBeenCalled();
    expect(selectFlowVersions(publish.mock.calls[0][0].records, ctx, publish.mock.calls[0][0].basis)[0].standing).toBe('current');
  });

  it('reads only unique references from the five visible matching completed versions', async () => {
    const getFile = vi.fn(async () => new File([markdown], 'refund.md'));
    const ctx = readingContext(getFile);
    const saved = await recorded(ctx);
    getFile.mockClear();
    const records = Array.from({ length: 6 }, (_, index) => ({ ...saved, id: 'saved-' + index, createdAt: new Date(Date.UTC(2026, 9, index + 1)).toISOString(),
      basis: { ...saved.basis, documents: index ? saved.basis.documents : [{ slug: 'capabilities/older', digest: saved.basis.documents[0].digest }] } }));
    records.push({ ...saved, id: 'foreign', scope: { ...saved.scope, projectSlug: 'other' }, basis: { ...saved.basis, documents: [{ slug: 'capabilities/foreign', digest: saved.basis.documents[0].digest }] } });
    historyReader.mockResolvedValue({ records });
    const publish = vi.fn();
    await createFlowArchiveLoader(ctx, publish).load();
    expect(getFile).toHaveBeenCalledTimes(1);
    expect(publish.mock.calls[0][0].basis.documents.map((doc: { slug: string }) => doc.slug)).toEqual([slug]);
    expect(historyReader).toHaveBeenCalledWith(ctx.handle, { limit: 20 });
  });
});
