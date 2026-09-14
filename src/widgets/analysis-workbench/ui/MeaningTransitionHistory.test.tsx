import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MeaningTransitionV2 } from '@/shared/lib/meaning-transition-v2';

const archive = vi.hoisted(() => ({ available: true, history: vi.fn(), observe: vi.fn(), read: vi.fn() }));
vi.mock('next-intl', () => ({ useLocale: () => 'en', useTranslations: () => (key: string, values?: { count?: number }) => values?.count === undefined ? key : `${key}:${values.count}` }));
vi.mock('@/entities/meaning-transition', () => ({ readMeaningTransitionHistory: archive.history }));
vi.mock('@/shared/lib/tauri-vault-fs', () => ({ getTauriVaultRootPath: (handle: { root?: string }) => handle.root ?? null }));
vi.mock('@/shared/lib/tauri-meaning-transition-archive', () => ({
  canArchiveMeaningTransitions: () => archive.available,
  observeMeaningTransitionRoot: archive.observe,
  readTauriMeaningTransitionArtifact: archive.read,
}));

import { MeaningTransitionHistory } from './MeaningTransitionHistory';

const handle = (root: string) => ({ root }) as unknown as FileSystemDirectoryHandle;
async function digest(text: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  return `sha256:${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}` as const;
}
async function record(): Promise<{ value: MeaningTransitionV2; artifacts: Map<string, string> }> {
  const artifacts = new Map<string, string>();
  for (const text of ['BEFORE EXACT', 'PREVIEW EXACT', 'DECISION EXACT']) artifacts.set(await digest(text), text);
  const refs = [...artifacts.keys()].map((contentDigest) => ({ ref: `.ontology-atlas/meaning-transitions/artifacts/${contentDigest.slice(7)}.artifact`, contentDigest })) as [{ ref: string; contentDigest: `sha256:${string}` }, { ref: string; contentDigest: `sha256:${string}` }, { ref: string; contentDigest: `sha256:${string}` }];
  return { artifacts, value: {
    schema: 'atlas-meaning-transition/v2', eventId: '95f4ba81-41f7-483b-a617-2a4be815be32', createdAt: '2026-09-14T08:00:00.000Z', decisionId: '819f2753-2f91-4e2a-8638-b69051965d3b', phase: 'terminal', previous: { eventId: '05c117c2-17bb-475f-9990-758cf541aa84', createdAt: '2026-09-14T07:59:00.000Z', recordDigest: `sha256:${'a'.repeat(64)}` },
    identity: { vaultId: '/vault', sessionGeneration: 1, userEventId: 'event', requestId: 0, toolCallId: 'tool' }, task: { label: 'Full task text stays visible', digest: `sha256:${'a'.repeat(64)}` },
    proposal: { digest: `sha256:${'b'.repeat(64)}`, rowManifestDigest: `sha256:${'c'.repeat(64)}`, operation: 'patch_concept', rows: [{ rowId: 'row', operation: 'patch', target: 'capabilities/refund.md', rawGuardDigest: refs[0].contentDigest, expectedPersistedDigest: refs[1].contentDigest }], artifacts: { retainedBefore: refs[0], preview: refs[1], decision: refs[2] } },
    meaningDecision: { decisionId: '819f2753-2f91-4e2a-8638-b69051965d3b', action: 'accept_meaning', actionAt: '2026-09-14T07:59:00.000Z', actor: 'user_action', authentication: 'unverified', rationale: null, acceptedGaps: ['Source ownership remains unknown'] },
    reviewEvidence: { status: 'unavailable', reason: 'fixture does not carry a proposal binding' },
    acpCorrelation: { status: 'observed', sessionId: 'session', requestId: 0, toolCallId: 'tool', evidence: 'structured_mcp_approval', executionPermission: 'allowed' },
    git: { source: { status: 'unavailable', reason: 'task ownership unknown' }, vault: { status: 'observed', repositoryId: 'vault', revision: 'abc', dirty: true } }, rowEvidence: [{ rowId: 'row', execution: 'completed', readback: 'matched', persistedDigest: refs[1].contentDigest, error: null }], receipts: { codeChecks: 'unknown', merge: 'unknown', deployment: 'unknown' }, remainingQuestions: ['Verify the next task handoff'], outcome: 'accepted_complete', recordDigest: `sha256:${'d'.repeat(64)}`,
  } };
}

beforeEach(() => { vi.clearAllMocks(); archive.available = true; archive.observe.mockResolvedValue({ canonicalPath: '/vault', device: 1, inode: 2 }); });

describe('MeaningTransitionHistory', () => {
  it('states unsupported browser or platform capability without reading history', () => {
    archive.available = false;
    render(<MeaningTransitionHistory handle={handle('/vault')} open />);
    expect(screen.getByText('unavailable')).toBeInTheDocument();
    expect(archive.history).not.toHaveBeenCalled();
  });

  it('shows separate authority facts and exact retained bytes as inert text', async () => {
    const fixture = await record();
    archive.history.mockResolvedValue({ records: [fixture.value], problems: [], totalMembers: 1, scanned: 1, nextOffset: null });
    archive.read.mockImplementation(async (_root, _identity, value) => fixture.artifacts.get(value));
    render(<MeaningTransitionHistory handle={handle('/vault')} open />);
    expect(await screen.findAllByText('Full task text stays visible')).toHaveLength(2);
    expect(screen.getByText(/structured_mcp_approval/)).toBeInTheDocument();
    expect(screen.getAllByText('authority.unknown')).toHaveLength(3);
    await screen.findByText('artifactRoles.before');
    for (const summary of ['artifactRoles.before', 'artifactRoles.preview', 'artifactRoles.decision']) fireEvent.click(screen.getByText(summary));
    expect(await screen.findByText('BEFORE EXACT')).toBeInTheDocument();
    expect(screen.getByText('PREVIEW EXACT')).toBeInTheDocument();
    expect(screen.getByText('DECISION EXACT')).toBeInTheDocument();
    expect(screen.getByText('integrityBoundary')).toBeInTheDocument();
    expect(screen.getByText('rationaleMissing')).toBeInTheDocument();
    expect(screen.getByText('Source ownership remains unknown')).toBeInTheDocument();
    expect(screen.getByText('Verify the next task handoff')).toBeInTheDocument();
    expect(screen.getByText('819f2753-2f91-4e2a-8638-b69051965d3b')).toBeInTheDocument();
    expect(screen.getByText('previousNotLoaded')).toBeInTheDocument();
  });

  it('keeps malformed rows visible and appends bounded older pages', async () => {
    const fixture = await record();
    archive.history.mockResolvedValueOnce({ records: [], problems: [{ fileName: 'bad.md', reason: 'bad digest' }], totalMembers: 2, scanned: 1, nextOffset: 1 })
      .mockResolvedValueOnce({ records: [fixture.value], problems: [], totalMembers: 2, scanned: 1, nextOffset: null });
    archive.read.mockImplementation(async (_root, _identity, value) => fixture.artifacts.get(value));
    render(<MeaningTransitionHistory handle={handle('/vault')} open />);
    expect(await screen.findByText('problems:1')).toBeInTheDocument();
    fireEvent.click(screen.getByText('loadOlder'));
    expect(await screen.findAllByText('Full task text stays visible')).toHaveLength(2);
    expect(screen.getByText(/bad\.md: bad digest/)).toBeInTheDocument();
  });

  it('discards an old handle response after the folder changes', async () => {
    let release!: (value: unknown) => void;
    archive.history.mockImplementationOnce(() => new Promise((resolve) => { release = resolve; }))
      .mockResolvedValueOnce({ records: [], problems: [], totalMembers: 0, scanned: 0, nextOffset: null });
    const view = render(<MeaningTransitionHistory handle={handle('/vault-a')} open />);
    await waitFor(() => expect(archive.history).toHaveBeenCalledTimes(1));
    view.rerender(<MeaningTransitionHistory handle={handle('/vault-b')} open />);
    await waitFor(() => expect(archive.history).toHaveBeenCalledTimes(2));
    await act(async () => release({ records: [(await record()).value], problems: [], totalMembers: 1, scanned: 1, nextOffset: null }));
    expect(screen.queryByText('Full task text stays visible')).toBeNull();
  });

  it('refreshes only for an archive event carrying this exact vault root', async () => {
    archive.history.mockResolvedValue({ records: [], problems: [], totalMembers: 0, scanned: 0, nextOffset: null });
    render(<MeaningTransitionHistory handle={handle('/vault')} open />);
    await waitFor(() => expect(archive.history).toHaveBeenCalledTimes(1));
    window.dispatchEvent(new CustomEvent('atlas-meaning-transitions-changed', { detail: { vaultRoot: '/other' } }));
    await act(async () => {});
    expect(archive.history).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new CustomEvent('atlas-meaning-transitions-changed', { detail: { vaultRoot: '/vault' } }));
    await waitFor(() => expect(archive.history).toHaveBeenCalledTimes(2));
  });

  it('stops saying artifacts are loading after a verified read fails', async () => {
    const fixture = await record();
    archive.history.mockResolvedValue({ records: [fixture.value], problems: [], totalMembers: 1, scanned: 1, nextOffset: null });
    archive.read.mockRejectedValue(new Error('artifact read failed'));
    render(<MeaningTransitionHistory handle={handle('/vault')} open />);
    expect(await screen.findByText('artifact read failed')).toBeInTheDocument();
    expect(screen.getByText('artifactsUnavailable')).toBeInTheDocument();
    expect(screen.queryByText('loadingArtifacts')).toBeNull();
  });
});
