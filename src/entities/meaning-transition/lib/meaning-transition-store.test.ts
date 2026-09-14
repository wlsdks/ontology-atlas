import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMeaningTransition, serializeMeaningTransition, type MeaningTransitionInput } from '@/shared/lib/meaning-transition';

const native = vi.hoisted(() => ({
  append: vi.fn(), observe: vi.fn(), readArtifact: vi.fn(), readRecord: vi.fn(), list: vi.fn(),
}));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({ getTauriVaultRootPath: (value: { root?: string }) => value.root ?? '/vault' }));
vi.mock('@/shared/lib/tauri-meaning-transition-archive', () => ({
  canArchiveMeaningTransitions: () => true,
  observeMeaningTransitionRoot: native.observe,
  appendTauriMeaningTransitionBundle: native.append,
  readTauriMeaningTransitionArtifact: native.readArtifact,
  readTauriMeaningTransitionRecord: native.readRecord,
  listTauriMeaningTransitionHistory: native.list,
}));

import { appendMeaningTransition, meaningTransitionArtifactRef, readMeaningTransitionHistory } from './meaning-transition-store';

const A = `sha256:${'a'.repeat(64)}` as const;
const identity = { vaultId: '/vault', sessionGeneration: 1, userEventId: 'event', requestId: 1, toolCallId: 'tool' };
const doc = { path: 'capabilities/refund.md', contentDigest: A, sourceRevision: 'source', meaningRevision: 'meaning', graphRevision: null };
const handle = {} as FileSystemDirectoryHandle;

async function digest(content: string): Promise<`sha256:${string}`> {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content)));
  return `sha256:${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

async function fixture() {
  const content = 'exact proposal bytes'; const artifactDigest = await digest(content);
  const input: MeaningTransitionInput = {
    eventId: '95f4ba81-41f7-483b-a617-2a4be815be32', createdAt: '2026-09-14T08:00:00.000Z', identity,
    task: { label: 'Review refund meaning', digest: A },
    proposal: { digest: A, operation: 'patch', artifact: { ref: meaningTransitionArtifactRef(artifactDigest), contentDigest: artifactDigest }, rows: [{ rowId: 'row', operation: 'patch', target: doc.path, rawGuardDigest: A, expectedPersistedDigest: A }] },
    decision: { actor: 'user_action', disposition: 'rejected', proposalDigest: A, rowManifestDigest: A, taskDigest: A, identity, acceptanceBasis: { vaultId: '/vault', documents: [doc] }, rationale: 'Supplied review action, not authentication.', acceptedGaps: [] },
    historicalBefore: [doc], currentAcceptance: { vaultId: '/vault', proposalDigest: A, taskDigest: A, documents: [doc] },
    verifiedAfter: [], rowEvidence: [],
    codeEvidence: { sourceRepository: { repositoryId: 'source', baseRevision: null, currentRevision: null }, vaultRepository: { repositoryId: 'vault', baseRevision: null, currentRevision: null }, observedTaskPaths: [], diffArtifact: null },
    receipts: { codeChecks: { status: 'unknown', refs: [] }, merge: { status: 'unknown', refs: [] }, deployment: { status: 'unknown', refs: [] } }, remainingQuestions: ['Writer outcome remains unknown.'],
  };
  const preparation = await prepareMeaningTransition({ ...input, semanticDelta: 'present' });
  if (preparation.status !== 'candidate') throw new Error('candidate expected');
  return { preparation, artifact: { digest: artifactDigest, content } };
}

beforeEach(() => {
  vi.clearAllMocks();
  native.observe.mockResolvedValue({ canonicalPath: '/vault', device: 1, inode: 2 });
});

describe('meaning transition archive store', () => {
  it('validates, publishes, and reopens exact artifact and record bytes', async () => {
    const { preparation, artifact } = await fixture();
    native.append.mockImplementation(async (input) => {
      native.readRecord.mockResolvedValue(input.recordContent);
      native.readArtifact.mockResolvedValue(artifact.content);
      return { recordFileName: input.recordFileName, recordCreated: true, artifacts: [{ digest: artifact.digest, fileName: `${artifact.digest.slice(7)}.artifact`, created: true }] };
    });
    await expect(appendMeaningTransition({ capturedHandle: handle, preparation, artifacts: [artifact], writable: true, isCurrent: () => true }))
      .resolves.toMatchObject({ status: 'archived', created: true });
    expect(native.append).toHaveBeenCalledWith(expect.objectContaining({ rootPath: '/vault', artifacts: [artifact] }));
    expect(native.readArtifact).toHaveBeenCalledWith('/vault', expect.anything(), artifact.digest);
    expect(native.readRecord).toHaveBeenCalledTimes(1);
  });

  it('creates nothing for a semantic no-op and rejects missing, mutated, or stale-context artifacts', async () => {
    await expect(appendMeaningTransition({ capturedHandle: handle, preparation: { status: 'not_created', reason: 'no_semantic_delta' }, artifacts: [], writable: true, isCurrent: () => true }))
      .resolves.toEqual({ status: 'not_created', reason: 'no_semantic_delta' });
    expect(native.observe).not.toHaveBeenCalled(); expect(native.append).not.toHaveBeenCalled();
    const { preparation, artifact } = await fixture();
    await expect(appendMeaningTransition({ capturedHandle: handle, preparation, artifacts: [], writable: true, isCurrent: () => true })).rejects.toThrow(/exactly match/);
    await expect(appendMeaningTransition({ capturedHandle: handle, preparation, artifacts: [{ ...artifact, content: 'mutated' }], writable: true, isCurrent: () => true })).rejects.toThrow(/digest verification/);
    await expect(appendMeaningTransition({ capturedHandle: handle, preparation, artifacts: [artifact], writable: true, isCurrent: () => false })).rejects.toThrow(/context changed/);
  });

  it('reports malformed members and record integrity failures without hiding valid history', async () => {
    const { preparation } = await fixture();
    native.list.mockResolvedValue({ entries: [
      { fileName: 'bad.md', kind: 'malformed', problem: 'invalid generated name' },
      { fileName: '2026-09-14T08-00-00-000Z-95f4ba81-41f7-483b-a617-2a4be815be32.md', kind: 'record', problem: null },
    ], totalMembers: 2, nextOffset: null });
    native.readRecord.mockResolvedValue('tampered');
    const page = await readMeaningTransitionHistory({ capturedHandle: handle, isCurrent: () => true });
    expect(page).toMatchObject({ records: [], totalMembers: 2, scanned: 2, problems: [
      { fileName: 'bad.md', reason: 'invalid generated name' }, expect.objectContaining({ fileName: expect.stringContaining('95f4ba81') }),
    ] });
    expect(preparation.status).toBe('candidate');
  });

  it('captures mutable entry inputs before the first asynchronous validation', async () => {
    const { preparation, artifact } = await fixture();
    native.observe.mockImplementation(async (rootPath) => ({ canonicalPath: rootPath, device: 1, inode: 2 }));
    native.append.mockImplementation(async (input) => {
      native.readRecord.mockResolvedValue(input.recordContent); native.readArtifact.mockResolvedValue(artifact.content);
      return { recordFileName: input.recordFileName, recordCreated: true, artifacts: [{ digest: artifact.digest, fileName: `${artifact.digest.slice(7)}.artifact`, created: true }] };
    });
    const input = { capturedHandle: { root: '/vault' } as unknown as FileSystemDirectoryHandle, preparation, artifacts: [artifact], writable: true, isCurrent: () => true };
    const pending = appendMeaningTransition(input);
    input.capturedHandle = { root: '/other' } as unknown as FileSystemDirectoryHandle;
    input.artifacts[0] = { ...artifact, content: 'later mutation' };
    await pending;
    expect(native.observe).toHaveBeenCalledWith('/vault');
    expect(native.append).toHaveBeenCalledWith(expect.objectContaining({ rootPath: '/vault', artifacts: [artifact] }));
  });

  it('rejects generated filename mismatch and propagates context invalidation', async () => {
    const { preparation, artifact } = await fixture();
    const markdown = serializeMeaningTransition(preparation.record);
    const originalName = '2026-09-14T08-00-00-000Z-95f4ba81-41f7-483b-a617-2a4be815be32.md';
    native.list.mockResolvedValue({ entries: [{ fileName: originalName.replace('08-00', '09-00'), kind: 'record', problem: null }], totalMembers: 1, nextOffset: null });
    native.readRecord.mockResolvedValue(markdown); native.readArtifact.mockResolvedValue(artifact.content);
    await expect(readMeaningTransitionHistory({ capturedHandle: handle, isCurrent: () => true })).resolves.toMatchObject({ records: [], problems: [expect.objectContaining({ reason: expect.stringMatching(/identity/) })] });

    let current = true;
    native.list.mockResolvedValue({ entries: [{ fileName: originalName, kind: 'record', problem: null }], totalMembers: 1, nextOffset: null });
    native.readRecord.mockImplementation(async () => { current = false; return markdown; });
    await expect(readMeaningTransitionHistory({ capturedHandle: handle, isCurrent: () => current })).rejects.toThrow(/context changed/);
  });

  it('does not publish when context changes after early root observation during validation', async () => {
    const { preparation, artifact } = await fixture();
    let current = true;
    native.observe.mockImplementation(async () => {
      queueMicrotask(() => queueMicrotask(() => { current = false; }));
      return { canonicalPath: '/vault', device: 1, inode: 2 };
    });
    await expect(appendMeaningTransition({ capturedHandle: handle, preparation, artifacts: [artifact], writable: true, isCurrent: () => current }))
      .rejects.toThrow(/context changed/);
    expect(native.append).not.toHaveBeenCalled();
  });
});
