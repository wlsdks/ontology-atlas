import { useEffect } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn(), info: vi.fn(), warning: vi.fn() }, Toaster: () => null }));
import messages from '../../../../messages/en.json';
import ko from '../../../../messages/ko.json';
import { analysisDigest, type AnalysisBasis, type AnalysisRun } from '@/entities/analysis-record';
import { ANALYSIS_FINDINGS_INSTRUCTION, type AnalysisCaptureContext } from '@/features/acp-session';

const archive = vi.hoisted(() => ({ read: vi.fn(), append: vi.fn(), basis: vi.fn() }));
vi.mock('@/entities/analysis-record', async (original) => ({ ...await original<object>(), readAnalysisHistory: archive.read, appendAnalysisRecord: archive.append, analysisArchiveWritable: () => true }));
vi.mock('@/features/acp-session', async (original) => ({ ...await original<object>(), currentAnalysisBasis: archive.basis }));
import { toast as sonnerToast } from 'sonner';
import { AnalysisWorkbench } from './AnalysisWorkbench';
import { isRecordedReviewRequest } from '../model/review-result';

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
    request: { id: 'u-1', text: `Review meaning.\n${ANALYSIS_FINDINGS_INSTRUCTION}`, parentRunId: null }, origin: { surface: 'map', runtimeId: 'test', sessionId: 's-1', userEventId: 'u-1', answerEventId: 'a-1', startedAt: '2026-09-04T07:59:00.000Z', stopReason: 'end_turn', outcome: 'completed' },
    basis, evidence: [evidence], observations: [], profileSnapshot: null, toolReads: [{ id: 'r-1', name: 'get_concept', status: 'completed' }], sourceAccess: 'atlas-only', qualification: { status: 'grounded', reasons: [] }, answer: index ? 'Original older answer.' : 'Current answer.',
    findings: [{ id: 'f-1', category: 'boundary', title: 'Check the refund window', detail: 'Does the proposed change retain the limit?', targetSlugs: ['refund'], evidenceSlugs: ['refund'], roleIds: [], relation: null, suggestedAction: 'Read the policy.' }],
  }));
  archive.read.mockResolvedValue({ records: runs, problems: [], nextCursor: null, totalFiles: 2, scanned: 2 });
  archive.basis.mockResolvedValue(basis);
  archive.append.mockResolvedValue({ created: true });
});

function withFindings(run: AnalysisRun, count: number): AnalysisRun {
  return { ...run, findings: Array.from({ length: count }, (_, index) => ({ ...run.findings[0], id: `f-${index + 1}`, title: `Question ${index + 1}`, detail: `Why question ${index + 1} matters.` })) };
}
function wrapper(children: React.ReactNode) { return <NextIntlClientProvider locale="en" messages={messages}>{children}</NextIntlClientProvider>; }
describe('analysis context workbench', () => {
  it('returns to the named door instead of a route container on unmount', async () => {
    const route = document.createElement('main'); route.tabIndex = -1;
    const opener = document.createElement('button'); opener.id = 'workbench-test-door';
    document.body.append(route, opener); route.focus();
    const view = render(wrapper(<AnalysisWorkbench context={context} contextLabel="Project" open returnFocusSelector="#workbench-test-door" onClose={() => {}} />));
    expect(screen.getByTestId('analysis-workbench-close')).toHaveFocus();
    view.unmount();
    route.focus();
    await waitFor(() => expect(opener).toHaveFocus());
    route.remove(); opener.remove();
  });
  it('requests localized analysis prose while preserving the structured finding contract', async () => {
    const onRequest = vi.fn();
    render(<NextIntlClientProvider locale="ko" messages={ko}><AnalysisWorkbench context={context} contextLabel="Project" open onClose={() => {}} onRequest={onRequest} /></NextIntlClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: ko.analysisWorkbench.reanalyze }));
    const text = onRequest.mock.calls[0]![0];
    expect(text).toContain('Korean (ko)');
    expect(text).toContain(ANALYSIS_FINDINGS_INSTRUCTION);
  });
  it('announces a saved analysis once, even when the workbench remounts with the same save state', () => {
    const state = { status: 'saved' as const, id: '2b5f1c3e-7a44-4d9b-9c1e-0f5a6b7c8d9e', handle: context.handle, record: null, error: null };
    const props = { context, contextLabel: 'Refund', open: true, onClose: () => {}, onRequest: vi.fn(), capture: { state, setState: vi.fn() } };
    const first = render(wrapper(<AnalysisWorkbench {...props} />));
    expect(sonnerToast.success).toHaveBeenCalledTimes(1);
    first.unmount();
    render(wrapper(<AnalysisWorkbench {...props} />));
    expect(sonnerToast.success).toHaveBeenCalledTimes(1);
  });

  it('opens the result of a review that finished while its conversation was in view, and leaves any other save to the toast', async () => {
    const savedAs = (record: AnalysisRun, id: string) => ({ state: { status: 'saved' as const, id, handle: context.handle, record, error: null }, setState: vi.fn() });
    const props = { context, contextLabel: 'Refund', open: true, onClose: () => {}, initialTab: 'conversation' as const, conversation: <div>Live conversation</div> };
    const watched = render(wrapper(<AnalysisWorkbench {...props} capture={savedAs(runs[0], runs[0].id)} />));
    await waitFor(() => expect(screen.getByRole('tab', { name: messages.analysisWorkbench.history })).toHaveAttribute('aria-selected', 'true'));
    await screen.findByRole('button', { name: /Check the refund window/ });
    watched.unmount();

    const chatTurn = { ...runs[0], request: { ...runs[0].request, text: 'What does a refund cover?' } };
    render(wrapper(<AnalysisWorkbench {...props} capture={savedAs(chatTurn, '7d1f0a52-3c1b-4e0e-8a57-6f2f4f1f9b10')} />));
    expect(sonnerToast.success).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('tab', { name: messages.analysisWorkbench.conversation })).toHaveAttribute('aria-selected', 'true');
  });

  it('offers to write the missing connection reasons only when there are some, and sends a bounded write request', async () => {
    const onRequest = vi.fn();
    const props = { context, contextLabel: 'Refund', open: true, onClose: () => {}, onRequest };
    const view = render(wrapper(<AnalysisWorkbench {...props} relationNoteGaps={0} />));
    await screen.findByRole('button', { name: messages.analysisWorkbench.reanalyze });
    expect(screen.queryByTestId('workbench-fill-notes')).not.toBeInTheDocument();
    view.rerender(wrapper(<AnalysisWorkbench {...props} relationNoteGaps={7} />));
    const fill = screen.getByTestId('workbench-fill-notes');
    expect(fill).toHaveTextContent('7');
    fireEvent.click(fill);
    expect(onRequest).toHaveBeenCalledTimes(1);
    const [text, parent] = onRequest.mock.calls[0];
    expect(text).toContain('relation_notes');
    expect(text).toContain('patch_concept');
    expect(text).toContain('Scope:');
    expect(parent).toBeNull();
  });
  it('distinguishes a pending read from an empty archive and preserves history during refresh', async () => {
    let finish!: (page: object) => void;
    archive.read.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    await screen.findByText(messages.analysisWorkbench.loadingHistory);
    expect(screen.queryByText(messages.analysisWorkbench.empty)).not.toBeInTheDocument();
    finish({ records: runs, problems: [], nextCursor: null });
    await screen.findByRole('button', { name: /Check the refund window/ });
    archive.read.mockImplementationOnce(() => new Promise(() => {}));
    fireEvent.click(screen.getByRole('button', { name: messages.analysisWorkbench.refresh }));
    await waitFor(() => expect(document.getElementById('workbench-tabpanel-history')).toHaveAttribute('aria-busy', 'true'));
    expect(screen.getByRole('button', { name: /Check the refund window/ })).toBeVisible();
  });
  it('says an empty history once: the quiet decision archive folds into the one empty card', async () => {
    archive.read.mockResolvedValue({ records: [], problems: [], nextCursor: null, totalFiles: 0, scanned: 0 });
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    const empty = await screen.findByTestId('analysis-history-empty');
    expect(screen.queryByRole('heading', { name: messages.analysisWorkbench.meaningTransitions.title })).not.toBeInTheDocument();
    expect(empty).toHaveTextContent(messages.analysisWorkbench.agentUnavailableWithDecisions);
    expect(screen.queryByText(messages.analysisWorkbench.meaningTransitions.unavailable)).not.toBeInTheDocument();
  });
  it('keeps the review request and the fill offer on an empty archive, and through a failed read', async () => {
    archive.read.mockResolvedValue({ records: [], problems: [], nextCursor: null, totalFiles: 0, scanned: 0 });
    const props = { context, contextLabel: 'Refund', open: true, onClose: () => {}, onRequest: vi.fn(), relationNoteGaps: 3 };
    const loaded = render(wrapper(<AnalysisWorkbench {...props} />));
    const empty = await screen.findByTestId('analysis-history-empty');
    expect(empty).toContainElement(screen.getByRole('button', { name: messages.analysisWorkbench.analyze }));
    expect(empty).toContainElement(screen.getByTestId('workbench-fill-notes'));
    loaded.unmount();
    archive.read.mockRejectedValue(new Error('disk'));
    render(wrapper(<AnalysisWorkbench {...props} />));
    const request = await screen.findByTestId('analysis-history-request');
    expect(screen.queryByTestId('analysis-history-empty')).not.toBeInTheDocument();
    expect(request).toContainElement(screen.getByRole('button', { name: messages.analysisWorkbench.analyze }));
    expect(request).toContainElement(screen.getByTestId('workbench-fill-notes'));
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
    fireEvent.click(screen.getByRole('tab', { name: messages.analysisWorkbench.history }));
    await screen.findByRole('button', { name: /Check the refund window/ });
    view.rerender(wrapper(<AnalysisWorkbench {...props} sectionRequest={{ tab: 'conversation', nonce: 1 }} />));
    expect(screen.getByRole('tab', { name: messages.analysisWorkbench.history })).toHaveAttribute('aria-selected', 'true');
    view.rerender(wrapper(<AnalysisWorkbench {...props} sectionRequest={{ tab: 'conversation', nonce: 2 }} />));
    expect(screen.getByRole('tab', { name: messages.analysisWorkbench.conversation })).toHaveAttribute('aria-selected', 'true');
  });
  it('shows the criteria section only where a screen supplies it, and no tab strip for a single section', () => {
    const props = { context, contextLabel: 'Refund', open: true, onClose: () => {} };
    const single = render(wrapper(<AnalysisWorkbench {...props} />));
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
    expect(screen.queryByRole('tabpanel')).not.toBeInTheDocument();
    single.unmount();
    render(wrapper(<AnalysisWorkbench {...props} initialTab="meaning" facts={<p>Criteria</p>} conversation={<div>Live conversation</div>} />));
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([messages.analysisWorkbench.conversation, messages.analysisWorkbench.meaning, messages.analysisWorkbench.history]);
    expect(screen.getByText('Criteria')).toBeVisible();
  });
  it('keeps the conversation mounted while opening history and restores an older exact answer', async () => {
    const mounted = vi.fn(); const unmounted = vi.fn();
    function Conversation() { useEffect(() => { mounted(); return unmounted; }, []); return <div>Conversation draft</div>; }
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="conversation" conversation={<Conversation />} onClose={() => {}} />));
    fireEvent.click(screen.getByRole('tab', { name: messages.analysisWorkbench.history }));
    fireEvent.click(await screen.findByRole('combobox', { name: messages.analysisWorkbench.version }));
    fireEvent.click(await screen.findByRole('option', { name: /24e7bc39/ }));
    fireEvent.click(screen.getByRole('button', { name: messages.analysisWorkbench.recordDetails }));
    expect(await screen.findByRole('dialog', { name: messages.analysisWorkbench.recordDetails })).toHaveTextContent('Original older answer.');
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
  });
  it('lists one pressable row per finding and no disclosure control on the first screen', async () => {
    runs[0] = withFindings(runs[0], 4);
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    const panel = await screen.findByTestId('review-finding-list');
    await waitFor(() => expect(within(panel).getAllByRole('button', { name: /^Question \d/ })).toHaveLength(4));
    expect(screen.getByRole('heading', { name: '4 to check' })).toBeVisible();
    expect(document.querySelectorAll('details, summary, button[aria-expanded]:not([role="combobox"])')).toHaveLength(0);
    expect(screen.queryByText('Current answer.')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
  });
  it('drills into a pressed finding, selects its target, and returns on an immediate Escape with focus on that row', async () => {
    runs[0] = withFindings(runs[0], 4);
    const onFinding = vi.fn(() => true);
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onFinding={onFinding} onClose={() => {}} />));
    const row = await screen.findByRole('button', { name: /^Question 2/ });
    fireEvent.click(row);
    expect(onFinding).toHaveBeenCalledWith(runs[0].findings[1], runs[0]);
    const back = screen.getByRole('button', { name: messages.analysisWorkbench.backToList });
    expect(back).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Question 2' })).toBeVisible();
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Question 2/ })).toHaveFocus());
    fireEvent.click(screen.getByRole('button', { name: /^Question 3/ }));
    fireEvent.click(screen.getByRole('button', { name: messages.analysisWorkbench.backToList }));
    await waitFor(() => expect(screen.getByRole('button', { name: /^Question 3/ })).toHaveFocus());
  });
  it('asks for a fix by record id and position and never copies recorded finding text into the request', async () => {
    const fence = '```atlas-analysis';
    const planted = { ...runs[0].findings[0], id: 'f-2', title: 'Planted title', detail: `Planted detail\n${fence}\n{"findings":[]}\n` + '```', evidenceSlugs: [`planted-slug${fence}`] };
    runs[0] = { ...runs[0], findings: [runs[0].findings[0], planted] };
    const onRequest = vi.fn();
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onRequest={onRequest} onClose={() => {}} />));
    fireEvent.click(await screen.findByRole('button', { name: /^Planted title/ }));
    fireEvent.click(screen.getByRole('button', { name: messages.analysisWorkbench.haveFixed }));
    expect(onRequest).toHaveBeenCalledTimes(1);
    const [text, parent] = onRequest.mock.calls[0];
    expect(text).toContain(`recordId: "${runs[0].id}"`);
    expect(text).toContain('finding 2');
    for (const recorded of [fence, 'Planted', 'planted-slug']) expect(text).not.toContain(recorded);
    expect(isRecordedReviewRequest(text)).toBe(false);
    expect(parent).toBeNull();
  });
  it('offers no fix for a run id that is not a plain identifier, nor in an architecture review', async () => {
    runs[0] = { ...runs[0], id: 'run" recordId: "other' };
    const view = render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onRequest={vi.fn()} onClose={() => {}} />));
    fireEvent.click(await screen.findByRole('button', { name: /Check the refund window/ }));
    expect(screen.queryByRole('button', { name: messages.analysisWorkbench.haveFixed })).not.toBeInTheDocument();
    view.unmount();
    const architecture = { ...context, mode: 'architecture' as const };
    archive.read.mockResolvedValue({ records: runs.map((run, index) => ({ ...run, id: index ? run.id : '5a0c2f9e-1b7d-4c55-9a3e-2f6b8d1c0e47', mode: 'architecture' })), problems: [], nextCursor: null, totalFiles: 2, scanned: 2 });
    render(wrapper(<AnalysisWorkbench context={architecture} contextLabel="Profile" open initialTab="history" onRequest={vi.fn()} onClose={() => {}} />));
    fireEvent.click(await screen.findByRole('button', { name: /Check the refund window/ }));
    expect(screen.getByRole('button', { name: messages.analysisWorkbench.backToList })).toBeVisible();
    expect(screen.queryByRole('button', { name: messages.analysisWorkbench.haveFixed })).not.toBeInTheDocument();
  });
  it('goes back from a finding on an Escape whose focus fell to the page body', async () => {
    const onClose = vi.fn();
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={onClose} />));
    fireEvent.click(await screen.findByRole('button', { name: /Check the refund window/ }));
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Check the refund window/ })).toHaveFocus());
    expect(onClose).not.toHaveBeenCalled();
  });
  it('closes only the record dialog on an Escape from its own container', async () => {
    const onClose = vi.fn();
    const mapSaw: boolean[] = [];
    const mapEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') mapSaw.push(event.defaultPrevented); };
    window.addEventListener('keydown', mapEscape);
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={onClose} />));
    fireEvent.click(await screen.findByRole('button', { name: messages.analysisWorkbench.recordDetails }));
    const dialog = await screen.findByRole('dialog', { name: messages.analysisWorkbench.recordDetails });
    dialog.focus();
    const escape = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    dialog.dispatchEvent(escape);
    window.removeEventListener('keydown', mapEscape);
    expect(escape.defaultPrevented).toBe(true);
    expect(mapSaw.every(Boolean)).toBe(true);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(onClose).not.toHaveBeenCalled();
  });
  it('says some results could not be read instead of claiming nothing was reviewed', async () => {
    archive.read.mockResolvedValue({ records: [], problems: [{ fileName: '2026-11-15T08-00-00-000Z-x.md', reason: 'evidence digest mismatch' }], nextCursor: null, totalFiles: 1, scanned: 1 });
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    await screen.findByText(messages.analysisWorkbench.recordProblems.replace('{count}', '1'));
    expect(screen.queryByTestId('analysis-history-empty')).not.toBeInTheDocument();
  });
  it('names a cancelled review instead of counting nothing to check', async () => {
    runs[0] = { ...runs[0], origin: { ...runs[0].origin, outcome: 'cancelled', stopReason: 'cancelled' }, findings: [], qualification: { status: 'unverified', reasons: ['turn_incomplete'] } };
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    expect(await screen.findByRole('heading', { name: messages.analysisWorkbench.outcome.cancelled })).toBeVisible();
    expect(screen.queryByText(messages.analysisWorkbench.noFindings)).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: /to check/ })).not.toBeInTheDocument();
  });
  it('keeps the map marks through the re-read that follows a judgment', async () => {
    runs[0] = withFindings(runs[0], 2);
    const overlay = vi.fn();
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onFindingsChange={overlay} onClose={() => {}} />));
    await waitFor(() => expect(overlay).toHaveBeenLastCalledWith(runs[0].findings));
    const ready = overlay.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /^Question 1/ }));
    fireEvent.click(screen.getByRole('button', { name: messages.analysisWorkbench.dismiss }));
    await waitFor(() => expect(archive.append).toHaveBeenCalled());
    const review = archive.append.mock.calls[0][1];
    archive.read.mockResolvedValue({ records: [...runs.map((run) => structuredClone(run)), review], problems: [], nextCursor: null, totalFiles: 3, scanned: 3 });
    act(() => { window.dispatchEvent(new Event('atlas-analysis-records-changed')); });
    await waitFor(() => expect(archive.read.mock.calls.length).toBeGreaterThan(1));
    await waitFor(() => expect(overlay).toHaveBeenLastCalledWith([expect.objectContaining({ id: 'f-2' })]));
    expect(overlay.mock.calls.slice(ready).filter(([items]) => items.length === 0)).toEqual([]);
  });
  it('judges a finding with one press, sinks a dismissed row and changes the count', async () => {
    runs[0] = withFindings(runs[0], 2);
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    fireEvent.click(await screen.findByRole('button', { name: /^Question 1/ }));
    fireEvent.click(screen.getByRole('button', { name: messages.analysisWorkbench.dismiss }));
    await waitFor(() => expect(archive.append).toHaveBeenCalledWith(handle, expect.objectContaining({ recordType: 'review', runId: runs[0].id, findingId: 'f-1', disposition: 'dismiss', rationale: '' }), true));
    expect(await screen.findByRole('heading', { name: /1 to check.*1 dismissed/ })).toBeVisible();
    const rows = within(screen.getByTestId('review-finding-list')).getAllByRole('button', { name: /^Question \d/ });
    expect(rows.map((row) => row.textContent)).toEqual([expect.stringContaining('Question 2'), expect.stringContaining(messages.analysisWorkbench.review.dismiss)]);
  });
  it('keeps a typed reason with the judgment', async () => {
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    fireEvent.click(await screen.findByRole('button', { name: /Check the refund window/ }));
    fireEvent.change(screen.getByRole('textbox', { name: messages.analysisWorkbench.reviewReason }), { target: { value: 'The policy already covers this boundary.' } });
    fireEvent.click(screen.getByRole('button', { name: messages.analysisWorkbench.retain }));
    await waitFor(() => expect(archive.append).toHaveBeenCalledWith(handle, expect.objectContaining({ disposition: 'retain', rationale: 'The policy already covers this boundary.' }), true));
  });
  it('marks the map and stays quiet about staleness while the review still matches the documents', async () => {
    const overlay = vi.fn();
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onFindingsChange={overlay} onClose={() => {}} />));
    await waitFor(() => expect(overlay).toHaveBeenLastCalledWith([runs[0].findings[0]]));
    expect(screen.queryByText(messages.analysisWorkbench.basisStaleLine)).not.toBeInTheDocument();
    expect(screen.queryByText(messages.analysisWorkbench.basisUnknownLine)).not.toBeInTheDocument();
  });
  it('says the documents changed and never draws a stale question as a current map defect', async () => {
    archive.basis.mockResolvedValue({ ...basis, documents: [{ slug: 'refund', digest: `sha256:${'b'.repeat(64)}` }] });
    const overlay = vi.fn();
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onFindingsChange={overlay} onClose={() => {}} />));
    await screen.findByText(messages.analysisWorkbench.basisStaleLine);
    expect(overlay.mock.calls.every(([items]) => items.length === 0)).toBe(true);
  });
  it('says currentness is unknown when the basis cannot be read', async () => {
    archive.basis.mockRejectedValue(new Error('unreadable'));
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    await screen.findByText(messages.analysisWorkbench.basisUnknownLine);
  });
  it('opens the record details from the list with the original answer, and Escape returns to the button', async () => {
    const onClose = vi.fn();
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={onClose} />));
    const door = await screen.findByRole('button', { name: messages.analysisWorkbench.recordDetails });
    door.focus();
    fireEvent.click(door);
    const dialog = await screen.findByRole('dialog', { name: messages.analysisWorkbench.recordDetails });
    expect(dialog).toHaveTextContent('Current answer.');
    expect(dialog).toHaveTextContent('The refund window is 30 days.');
    fireEvent.keyDown(document.activeElement!, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(door).toHaveFocus());
    expect(onClose).not.toHaveBeenCalled();
  });
  it('lists no result for a recorded chat turn that never asked for findings', async () => {
    const chatTurn = { ...runs[0], request: { ...runs[0].request, text: 'What does the refund capability own?' }, findings: [], answer: 'A plain chat answer.' };
    archive.read.mockResolvedValue({ records: [chatTurn], problems: [], nextCursor: null, totalFiles: 1, scanned: 1 });
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    await screen.findByTestId('analysis-history-empty');
    expect(screen.queryByText('A plain chat answer.')).not.toBeInTheDocument();
  });
  it('still lists a recorded chat turn that carries a question a person may have judged', async () => {
    const chatTurn = { ...runs[0], request: { ...runs[0].request, text: 'Is the refund window right?' } };
    archive.read.mockResolvedValue({ records: [chatTurn], problems: [], nextCursor: null, totalFiles: 1, scanned: 1 });
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    await screen.findByRole('button', { name: /Check the refund window/ });
  });
  it('reads older pages before saying nothing was reviewed when the newest page holds only chat turns', async () => {
    const chatTurn = { ...runs[0], id: '0d3b6a52-6f0e-4c0a-9a55-1f2d3c4b5a69', request: { ...runs[0].request, text: 'What does the refund capability own?' }, findings: [], answer: 'A plain chat answer.' };
    archive.read.mockImplementation(async (_handle: unknown, options?: { cursor?: string | null }) => options?.cursor
      ? { records: [runs[1]], problems: [], nextCursor: null, totalFiles: 2, scanned: 1 }
      : { records: [chatTurn], problems: [], nextCursor: 'older', totalFiles: 2, scanned: 1 });
    render(wrapper(<AnalysisWorkbench context={context} contextLabel="Refund" open initialTab="history" onClose={() => {}} />));
    await screen.findByRole('button', { name: /Check the refund window/ });
    expect(screen.queryByTestId('analysis-history-empty')).not.toBeInTheDocument();
  });
});
