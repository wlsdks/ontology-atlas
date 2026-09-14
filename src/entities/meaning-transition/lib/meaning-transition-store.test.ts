import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prepareMeaningTransition, serializeMeaningTransition, type MeaningTransitionInput } from '@/shared/lib/meaning-transition';
import { meaningTransitionV2DecisionArtifact, prepareMeaningTransitionV2, serializeMeaningTransitionV2, type MeaningTransitionV2Input } from '@/shared/lib/meaning-transition-v2';

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

import { appendMeaningTransition, appendMeaningTransitionV2, meaningTransitionArtifactRef, readMeaningTransitionHistory } from './meaning-transition-store';

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

async function v2Fixture() {
  const bytes = ['retained before', 'canonical preview'];
  const artifacts = await Promise.all(bytes.map(async (content) => ({ digest: await digest(content), content })));
  const refs = artifacts.map((item) => ({ ref: meaningTransitionArtifactRef(item.digest), contentDigest: item.digest }));
  const base: MeaningTransitionV2Input = {
    eventId: '95f4ba81-41f7-483b-a617-2a4be815be32', createdAt: '2026-09-14T08:00:01.000Z', decisionId: '819f2753-2f91-4e2a-8638-b69051965d3b', phase: 'decision', previous: null,
    identity, task: { label: 'Review refund meaning', digest: A },
    proposal: { digest: A, operation: 'patch_concept', rows: [{ rowId: 'row', operation: 'patch', target: doc.path, rawGuardDigest: artifacts[0]!.digest, expectedPersistedDigest: artifacts[1]!.digest }], artifacts: { retainedBefore: refs[0]!, preview: refs[1]!, decision: refs[0]! } },
    meaningDecision: { decisionId: '819f2753-2f91-4e2a-8638-b69051965d3b', action: 'accept_meaning', actionAt: '2026-09-14T08:00:00.000Z', actor: 'user_action', authentication: 'unverified', rationale: null, acceptedGaps: [] },
    reviewEvidence: { status: 'unavailable', reason: 'Prototype fixture has no retained review basis.' },
    acpCorrelation: { status: 'observed', sessionId: 'session', requestId: 1, toolCallId: 'tool', evidence: 'structured_mcp_approval', executionPermission: 'pending' },
    git: { source: { status: 'unavailable', reason: 'source unavailable' }, vault: { status: 'unavailable', reason: 'vault git unavailable' } },
    rowEvidence: [{ rowId: 'row', execution: 'not_run', readback: 'unknown', persistedDigest: null, error: null }], receipts: { codeChecks: 'unknown', merge: 'unknown', deployment: 'unknown' }, remainingQuestions: [],
  };
  const decisionContent = meaningTransitionV2DecisionArtifact(base);
  const decisionArtifact = { digest: await digest(decisionContent), content: decisionContent };
  artifacts.push(decisionArtifact);
  base.proposal.artifacts.decision = { ref: meaningTransitionArtifactRef(decisionArtifact.digest), contentDigest: decisionArtifact.digest };
  return { base, artifacts };
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

describe('meaning transition v2 linked archive', () => {
  it('archives the immediate decision then requires its exact immutable bytes for terminal append', async () => {
    const { base, artifacts } = await v2Fixture();
    const records = new Map<string, string>(); const retained = new Map(artifacts.map((item) => [item.digest, item.content]));
    native.append.mockImplementation(async (input) => {
      records.set(input.recordFileName, input.recordContent);
      return { recordFileName: input.recordFileName, recordCreated: true, artifacts: input.artifacts.map((item: { digest: string }) => ({ digest: item.digest, fileName: `${item.digest.slice(7)}.artifact`, created: true })) };
    });
    native.readRecord.mockImplementation(async (_root, _identity, name) => records.get(name));
    native.readArtifact.mockImplementation(async (_root, _identity, value) => retained.get(value));
    const decision = (await prepareMeaningTransitionV2(base)).record;
    await expect(appendMeaningTransitionV2({ capturedHandle: handle, record: decision, artifacts, writable: true, isCurrent: () => true })).resolves.toMatchObject({ status: 'archived' });
    const terminal = (await prepareMeaningTransitionV2({ ...base,
      eventId: '05c117c2-17bb-475f-9990-758cf541aa84', createdAt: '2026-09-14T08:01:00.000Z', phase: 'terminal',
      previous: { eventId: decision.eventId, createdAt: decision.createdAt, recordDigest: decision.recordDigest },
      acpCorrelation: { ...base.acpCorrelation, executionPermission: 'rejected' } as MeaningTransitionV2Input['acpCorrelation'],
    })).record;
    const archived = await appendMeaningTransitionV2({ capturedHandle: handle, record: terminal, artifacts, writable: true, isCurrent: () => true });
    expect(archived).toMatchObject({ status: 'archived' });
    expect(terminal.meaningDecision.action).toBe('accept_meaning');
    expect(terminal.rowEvidence[0].execution).toBe('not_run');
    native.list.mockResolvedValue({ entries: [{ fileName: archived.fileName, kind: 'record', problem: null }], totalMembers: 1, nextOffset: null });
    await expect(readMeaningTransitionHistory({ capturedHandle: handle, isCurrent: () => true })).resolves.toMatchObject({ records: [expect.objectContaining({ schema: 'atlas-meaning-transition/v2', eventId: terminal.eventId })], problems: [] });
  });

  it('rejects a missing or changed previous decision instead of publishing a terminal snapshot', async () => {
    const { base, artifacts } = await v2Fixture();
    const decision = (await prepareMeaningTransitionV2(base)).record;
    const terminal = (await prepareMeaningTransitionV2({ ...base,
      eventId: '05c117c2-17bb-475f-9990-758cf541aa84', createdAt: '2026-09-14T08:01:00.000Z', phase: 'terminal',
      previous: { eventId: decision.eventId, createdAt: decision.createdAt, recordDigest: decision.recordDigest },
      acpCorrelation: { ...base.acpCorrelation, executionPermission: 'allowed' } as MeaningTransitionV2Input['acpCorrelation'],
    })).record;
    native.readRecord.mockRejectedValue(new Error('missing previous record'));
    await expect(appendMeaningTransitionV2({ capturedHandle: handle, record: terminal, artifacts, writable: true, isCurrent: () => true })).rejects.toThrow(/missing previous/);
    expect(native.append).not.toHaveBeenCalled();
    native.readRecord.mockResolvedValue(serializeMeaningTransitionV2(decision).replace('Review refund meaning', 'Changed sealed task'));
    await expect(appendMeaningTransitionV2({ capturedHandle: handle, record: terminal, artifacts, writable: true, isCurrent: () => true })).rejects.toThrow(/digest/);
    expect(native.append).not.toHaveBeenCalled();
  });
});
