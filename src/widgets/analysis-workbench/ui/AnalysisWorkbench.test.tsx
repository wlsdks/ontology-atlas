import { useEffect } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import messages from '../../../../messages/en.json';
import { analysisDigest, type AnalysisBasis, type AnalysisRun } from '@/entities/analysis-record';
import type { AnalysisCaptureContext } from '@/features/acp-session';

const archive = vi.hoisted(() => ({ read: vi.fn(), append: vi.fn(), basis: vi.fn() }));
vi.mock('@/entities/analysis-record', async (original) => ({ ...await original<object>(), readAnalysisHistory: archive.read, appendAnalysisRecord: archive.append, analysisArchiveWritable: () => true }));
vi.mock('@/features/acp-session', async (original) => ({ ...await original<object>(), currentAnalysisBasis: archive.basis }));
import { AnalysisWorkbench } from './AnalysisWorkbench';

const handle = {} as FileSystemDirectoryHandle;
const context: AnalysisCaptureContext = { mode: 'meaning', surface: 'map', handle, writable: true, graph: { nodes: [], edges: [] }, fileHandles: new Map(), scope: { projectSlug: null, projectUid: null, targetSlugs: [], profileSlug: null }, sourceFingerprint: null, profileHash: null };
let basis: AnalysisBasis;
let runs: AnalysisRun[];
beforeEach(async () => {
  vi.clearAllMocks();
  const evidence = { slug: 'refund', uid: null, title: 'Refund', kind: 'capability', body: 'The refund window is 30 days.', frontmatter: { kind: 'capability' }, digest: '', toolCallId: 'r-1' };
  evidence.digest = await analysisDigest({ frontmatter: evidence.frontmatter, body: evidence.body });
  basis = { graphHash: `sha256:${'a'.repeat(64)}`, profileHash: null, sourceFingerprint: null, documents: [{ slug: 'refund', digest: evidence.digest }] };
  runs = ['95f4ba81-41f7-483b-a617-2a4be815be32', '24e7bc39-013c-46e7-86b2-ff2f3aeab58c'].map((id, index) => ({
    schema: 'atlas-analysis/v1', recordType: 'run', id, createdAt: index ? '2026-09-04T08:00:00.000Z' : '2026-09-05T08:00:00.000Z', mode: 'meaning', scope: context.scope,
    request: { id: 'u-1', text: 'Review meaning.', parentRunId: null }, origin: { surface: 'map', runtimeId: 'test', sessionId: 's-1', userEventId: 'u-1', answerEventId: 'a-1', startedAt: '2026-09-04T07:59:00.000Z', stopReason: 'end_turn', outcome: 'completed' },
    basis, evidence: [evidence], observations: [], profileSnapshot: null, toolReads: [{ id: 'r-1', name: 'get_concept', status: 'completed' }], sourceAccess: 'atlas-only', qualification: { status: 'grounded', reasons: [] }, answer: index ? 'Original older answer.' : 'Current answer.',
    findings: [{ id: 'f-1', category: 'boundary', title: 'Check the refund window', detail: 'Does the proposed change retain the limit?', targetSlugs: ['refund'], evidenceSlugs: ['refund'], roleIds: [], relation: null, suggestedAction: 'Read the policy.' }],
  }));
  archive.read.mockResolvedValue({ records: runs, problems: [], nextCursor: null, totalFiles: 2, scanned: 2 });
  archive.basis.mockResolvedValue(basis);
  archive.append.mockResolvedValue({ created: true });
});

function wrapper(children: React.ReactNode) { return <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>; }
describe('analysis context workbench', () => {
  it('distinguishes a pending read from an empty archive and preserves history during refresh', async () => {
    let finish!: (page: object) => void;
    archive.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    await screen.findByText(messages.analysisWorkbench.loadingHistory);
    expect(screen.queryByText(messages.analysisWorkbench.empty)).not.toBeInTheDocument();
    finish({ records: runs, problems: [], nextCursor: null });
    await screen.findByText('Current answer.');
    archive.read.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: messages.analysisWorkbench.refresh }));
    await screen.findByText(messages.analysisWorkbench.loadingHistory);
    expect(screen.getByText('Current answer.')).toBeVisible();
  });
  it('does not offer an inert refresh or loaded-empty claim before a folder is attached', () => {
    render(wrapper(<AnalysisWorkbench context={{ ...context, handle: null }} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    expect(screen.getByText(messages.analysisWorkbench.openFolder)).toBeVisible();
    expect(screen.queryByRole('button', { name: messages.analysisWorkbench.refresh })).not.toBeInTheDocument();
    expect(screen.queryByText(messages.analysisWorkbench.empty)).not.toBeInTheDocument();
  });
  it('honors external section navigation and consuming a sent request does not pull history back to chat', async () => {
    const props = { context, contextLabel: 'Refund', open: true, onClose: () => {}, conversation: <div>Live conversation</div> };
    const view = render(wrapper(<AnalysisWorkbench {...props} requestNonce={1} sectionRequest={{ tab: 'conversation', nonce: 1 }} />));
    fireEvent.click(screen.getByRole('radio', { name: 'Findings & history' }));
    await screen.findByText('Current answer.');
    view.rerender(wrapper(<AnalysisWorkbench {...props} sectionRequest={{ tab: 'conversation', nonce: 1 }} />));
    expect(screen.getByRole('radio', { name: 'Findings & history' })).toBeChecked();
    view.rerender(wrapper(<AnalysisWorkbench {...props} sectionRequest={{ tab: 'meaning', nonce: 2 }} />));
    expect(screen.getByRole('radio', { name: 'Meaning' })).toBeChecked();
  });
  it('keeps the conversation mounted while opening history and restores an older exact answer', async () => {
    const mounted = vi.fn(); const unmounted = vi.fn();
    function Conversation() { useEffect(() => { mounted(); return unmounted; }, []); return <div>Conversation draft</div>; }
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="conversation" conversation={<Conversation />} onClose={() => {}} />));
    fireEvent.click(screen.getByRole('radio', { name: 'Findings & history' }));
    await screen.findByText('Current answer.');
    fireEvent.click(screen.getByRole('combobox', { name: 'Analysis version' }));
    fireEvent.click(screen.getByRole('option', { name: /24e7bc39/ }));
    await screen.findByText('Original older answer.');
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('radio', { name: 'Conversation' }));
    expect(screen.getByText('Conversation draft')).toBeVisible();
  });
  it('never draws a stale question as a current map defect', async () => {
    archive.basis.mockResolvedValue({ ...basis, documents: [{ slug: 'refund', digest: `sha256:${'b'.repeat(64)}` }] });
    const overlay = vi.fn();
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onFindingsChange={overlay} onClose={() => {}} />));
    await screen.findByText(/Evidence has changed/);
    expect(screen.getByRole('checkbox', { name: 'Show review questions on the map' })).toBeDisabled();
    expect(overlay.mock.calls.every(([items]) => items.length === 0)).toBe(true);
    expect(screen.getByText('Current answer.')).toBeVisible();
  });
  it('appends a reasoned review for the selected run, preserving its answer', async () => {
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    fireEvent.click(await screen.findByRole('button', { name: 'Review this question' }));
    expect(screen.getByRole('button', { name: 'Dismiss this question' })).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Reason for your judgment' }), { target: { value: 'The policy already covers this boundary.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss this question' }));
    await waitFor(() => expect(archive.append).toHaveBeenCalledWith(handle, expect.objectContaining({ recordType: 'review', runId: runs[0].id, findingId: 'f-1', disposition: 'dismiss', rationale: 'The policy already covers this boundary.' }), true));
    expect(runs[0].answer).toBe('Current answer.');
  });
  it('keeps earlier questions reachable when the latest analysis was cancelled without findings', async () => {
    runs[0] = { ...runs[0], origin: { ...runs[0].origin, outcome: 'cancelled', stopReason: 'cancelled' }, findings: [], qualification: { status: 'unverified', reasons: ['turn_incomplete'] } };
    archive.read.mockResolvedValue({ records: runs, problems: [], nextCursor: null, totalFiles: 2, scanned: 2 });
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    fireEvent.click(await screen.findByText('Questions from earlier versions: 1'));
    fireEvent.click(screen.getByRole('button', { name: /Check the refund window · 24e7bc39/ }));
    await screen.findByText('Original older answer.');
  });
});
