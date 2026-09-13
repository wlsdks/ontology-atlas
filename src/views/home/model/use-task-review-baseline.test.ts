import { describe, expect, it, vi } from 'vitest';
import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';
import type { TaskBaselineCaptureRequest, TaskBaselineCaptureResult } from '@/features/acp-session';
import type { ProjectSourceBinding } from '@/shared/lib/project-source-receipt';
import type { ProjectSourceStore } from '@/shared/lib/project-source-store';
import { captureTaskReviewBaseline } from './use-task-review-baseline';

const file = {} as FileSystemFileHandle;
const vault = { name: 'vault' } as FileSystemDirectoryHandle;
const node = (slug: string, kind = 'capability') => ({ id: `${kind}:${slug}`, kind, agentSlug: slug, hasOwnDocument: true } as KnowledgeGraphNode);
const binding = (extra: Partial<ProjectSourceBinding> = {}): ProjectSourceBinding => ({ projectSlug: 'shop', sourceId: 'source-1', rootPath: '/repo', kind: 'git', boundAt: '2026-09-14T00:00:00.000Z', ...extra });
const available = (): TaskBaselineCaptureResult => ({ status: 'available', capturedAt: 'now', vaultId: '/vault', scope: { requestedSlugs: ['capabilities/pay'], capturedSlugs: ['capabilities/pay'] }, counts: { requested: 1, captured: 1, bytes: 1 }, sourceUnavailableReasons: [], documents: [], meaningBasis: 'meaning:sha256:x', sourceBasis: null });
function store(rows: () => ProjectSourceBinding[]): ProjectSourceStore {
  return { list: vi.fn(async () => ({ status: 'ok', bindings: rows() })), read: vi.fn(), replaceAfterMeasurement: vi.fn() } as unknown as ProjectSourceStore;
}
function state(overrides: Record<string, unknown> = {}) {
  return { handle: vault, vaultRoot: '/vault', fileHandles: new Map([['capabilities/pay', file]]), nodes: [node('capabilities/pay'), node('wiki/note', 'document')], projectSlug: 'shop', ...overrides };
}

describe('captureTaskReviewBaseline', () => {
  it('captures documented ontology nodes and a stable exact source binding', async () => {
    const captured = state(); let request: TaskBaselineCaptureRequest | undefined;
    await captureTaskReviewBaseline(captured, () => captured, {
      capture: async (next) => { request = next; expect(await next.inspectSource?.()).toMatchObject({ sourceId: 'source-1' }); expect(next.isCurrent()).toBe(true); return available(); },
      createSourceStore: () => store(() => [binding()]),
      inspectSource: async () => ({ rootPath: '/repo', sourceId: 'source-1', kind: 'git', revision: 'abc', fingerprint: 'tree:x', dirty: false, truncated: false, files: ['src/a.ts'] }),
    });
    expect(request?.slugs).toEqual(['capabilities/pay']);
    expect(request?.fileHandles).not.toBe(captured.fileHandles);
  });

  it.each([
    { bindings: [] as ProjectSourceBinding[] },
    { bindings: [binding(), binding({ sourceId: 'source-2' })] },
  ])('leaves source unknown for missing or ambiguous bindings', async ({ bindings }) => {
    const captured = state(); const inspect = vi.fn();
    await captureTaskReviewBaseline(captured, () => captured, { capture: async (request) => { expect(await request.inspectSource?.()).toBeNull(); return available(); }, createSourceStore: () => store(() => bindings), inspectSource: inspect });
    expect(inspect).not.toHaveBeenCalled();
  });

  it('invalidates capture when a source binding drifts during inspection', async () => {
    const captured = state(); let reads = 0;
    await captureTaskReviewBaseline(captured, () => captured, {
      capture: async (request) => { expect(await request.inspectSource?.()).toBeNull(); expect(request.isCurrent()).toBe(false); return available(); },
      createSourceStore: () => store(() => [binding(reads++ ? { rootPath: '/moved' } : {})]),
      inspectSource: async () => ({ rootPath: '/repo', sourceId: 'source-1', kind: 'git', revision: 'abc', fingerprint: 'tree:x', dirty: false, truncated: false, files: [] }),
    });
  });

  it.each([
    null,
    { rootPath: '/repo', sourceId: 'source-1', kind: 'git' as const, revision: 'abc', fingerprint: 'tree:x', dirty: false, truncated: true, files: [] },
  ])('keeps failed or truncated source inspection out of the baseline', async (observation) => {
    const captured = state();
    await captureTaskReviewBaseline(captured, () => captured, {
      capture: async (request) => { expect(await request.inspectSource?.()).toBeNull(); expect(request.isCurrent()).toBe(true); return available(); },
      createSourceStore: () => store(() => [binding()]),
      inspectSource: async () => observation,
    });
  });

  it.each(['vault', 'membership'])('rejects %s drift after an await', async (drift) => {
    const captured = state(); let live = captured;
    await captureTaskReviewBaseline(captured, () => live, { capture: async (request) => { live = drift === 'vault' ? state({ handle: { name: 'other' } as FileSystemDirectoryHandle }) : state({ fileHandles: new Map([['capabilities/pay', {} as FileSystemFileHandle]]) }); expect(request.isCurrent()).toBe(false); return available(); } });
  });
});
