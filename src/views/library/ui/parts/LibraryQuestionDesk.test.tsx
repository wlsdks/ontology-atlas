import { createHash, webcrypto } from 'node:crypto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en.json';
import ko from '../../../../../messages/ko.json';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import type { VaultDoc, LibrarySourceRow } from '@/entities/docs-vault';

const mocks = vi.hoisted(() => ({
  status: vi.fn(), judge: vi.fn(),
}));
vi.mock('@/shared/lib/tauri-jev', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/tauri-jev')>();
  return { ...actual, jevSecretStatus: mocks.status, jevJudge: mocks.judge };
});

import { LibraryQuestionDesk, type QuestionDeskReportDraft, type QuestionDeskReportRequest } from './LibraryQuestionDesk';

const original = '# Refund handling\nRefund approval queues a stock restoration job.\n';
const currentHash = createHash('sha256').update(original).digest('hex');
const path = 'sources/refund.md';
let sourceText = original;
let sourceMtime = 10;
let fileReads = 0;
let fileGate: Promise<void> | null = null;

function fixture(hash = currentHash, listedMtime = 10) {
  const raw = `---\ntitle: Refund overview\nsource_hash:\n  ${path}: ${hash}\n---\n## Facts\n- Refund approval immediately restores stock. [[src:${path}#l2]]`;
  const doc: VaultDoc = {
    slug: 'wiki/refund', path: 'wiki/refund.md', title: 'Refund overview',
    frontmatter: parseFrontmatter(raw).frontmatter, headings: [], tags: [], excerpt: '',
    wordCount: 0, updatedAt: '', linksOut: [],
  };
  const source: LibrarySourceRow = {
    path, name: 'refund.md', format: 'md', bytes: new TextEncoder().encode(sourceText).length, mtime: listedMtime,
    state: 'compiled', citedBy: ['wiki/refund'],
  };
  const handle = { getFile: vi.fn(async () => {
    fileReads += 1;
    const gate = fileGate;
    if (gate) await gate;
    const bytes = new TextEncoder().encode(sourceText);
    return { lastModified: sourceMtime, arrayBuffer: async () => bytes.buffer.slice(0) };
  }) } as unknown as FileSystemFileHandle;
  return { doc, raw, source, handle };
}

function Desk({ hash = currentHash, scope = 'folder-a', listedMtime = 10, includeWiki = true, visible = true, agentReady = true, dockOpen = false, locale = 'en', onSummarize = () => {}, report = null, onFileReport = null, onOpenSource = () => {} }: {
  hash?: string; scope?: string; listedMtime?: number; includeWiki?: boolean;
  visible?: boolean; agentReady?: boolean; dockOpen?: boolean; locale?: 'en' | 'ko';
  onSummarize?: (request: QuestionDeskReportRequest) => void;
  report?: QuestionDeskReportDraft | null;
  onFileReport?: (() => void) | null;
  onOpenSource?: (path: string, anchor?: string) => void;
}) {
  const { doc, raw, source, handle } = fixture(hash, listedMtime);
  return <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? ko : en}>
    <LibraryQuestionDesk docs={includeWiki ? [doc] : []} pageTexts={includeWiki ? new Map([[doc.slug, raw]]) : new Map()}
      sources={[source]} sourceHandles={new Map([[path, handle]])} hashes={new Map([[path, currentHash]])}
      vaultRoot="/fixture" vaultScope={scope} agentReady={agentReady} dockOpen={dockOpen}
      visible={visible}
      turnRunning={false} report={report} onSummarize={onSummarize}
      onInvalidateReport={() => {}}
      onFileReport={onFileReport} filingReport={false} fileReportNote={null}
      onBrowse={() => {}} onOpenWiki={() => {}} onOpenSource={onOpenSource} />
  </NextIntlClientProvider>;
}

beforeEach(() => {
  sourceText = original;
  sourceMtime = 10;
  fileReads = 0;
  fileGate = null;
  mocks.status.mockReset();
  mocks.judge.mockReset();
  mocks.status.mockResolvedValue({ stored: false, last4: null });
  mocks.judge.mockResolvedValue({ choice: 'contradicted', confidence: 0.9, responseModel: 'jev-latest', loggedAt: '' });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
});

describe('Library question desk transfer boundary', () => {
  async function search(revealLeads = true) {
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Does refund approval restore stock?' } });
    fireEvent.click(screen.getByTestId('question-desk-search'));
    await screen.findByTestId('question-desk-results');
    const toggle = screen.queryByTestId('question-desk-evidence-toggle');
    if (revealLeads && toggle?.getAttribute('aria-expanded') === 'false') fireEvent.click(toggle);
  }

  it('opens an inventoried original before searching without reading or inventing a citation', () => {
    const onOpenSource = vi.fn();
    render(<Desk onOpenSource={onOpenSource} agentReady={false} />);
    const originals = screen.getByTestId('question-desk-originals');
    fireEvent.click(within(originals).getByRole('button', { name: /refund.md/ }));
    expect(onOpenSource).toHaveBeenCalledWith('sources/refund.md');
    expect(fileReads).toBe(0);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('keeps local search and original anchors usable with no Jev key', async () => {
    render(<Desk />);
    await search(false);
    expect(screen.getByTestId('question-desk-summarize')).toBeEnabled();
    const toggle = screen.getByTestId('question-desk-evidence-toggle');
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    toggle.focus();
    expect(document.activeElement).toBe(toggle);
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/immediately restores stock/)).toBeInTheDocument();
    expect(screen.getAllByText('sources/refund.md#l2')).toHaveLength(2);
    expect(mocks.status).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Check claim with Jev'));
    expect(await screen.findByTestId('question-desk-jev-note')).toHaveTextContent('No Jev key');
    expect(mocks.judge).not.toHaveBeenCalled();
  });

  it('starts a report only on explicit press and renders the returned freeform draft with safe citations', async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const onFileReport = vi.fn();
    const onOpenSource = vi.fn();
    const rendered = render(<Desk onSummarize={onSummarize} onFileReport={onFileReport} onOpenSource={onOpenSource} />);
    await search(false);
    expect(onSummarize).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(screen.getByTestId('question-desk-summarize')).toBeEnabled();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    expect(onSummarize).toHaveBeenCalledTimes(1);
    const request = onSummarize.mock.calls[0]![0];
    expect(request.brief).toContain('## Disagreements or changed claims');
    expect(request.brief).toContain('Write no files.');
    const evidenceToggle = screen.getByTestId('question-desk-evidence-toggle');
    fireEvent.click(evidenceToggle);
    evidenceToggle.focus();
    const report: QuestionDeskReportDraft = {
      question: request.question, searchId: request.searchId, listingVersion: request.listingVersion, vaultScope: request.vaultScope,
      text: '# A freeform heading\n\nThe job runs later. [[src:sources/refund.md#l2]] and [[src:sources/refund.md#l2|refund policy]].\n\nMissing [[src:sources/gone.md#l4]]. Invalid [[src:sources/refund.md#bogus]]. [external](https://example.com) ![remote](https://example.com/image.png)<img src="https://example.com/raw.png" />',
      coverage: request.coverage, limits: request.limits, generatedAt: '2026-09-27T17:00:00Z',
    };
    rendered.rerender(<Desk report={report} onSummarize={onSummarize} onFileReport={onFileReport} onOpenSource={onOpenSource} />);
    expect(screen.getByTestId('question-desk-evidence-toggle')).toBe(evidenceToggle);
    expect(evidenceToggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.activeElement).toBe(evidenceToggle);
    const draft = screen.getByTestId('question-desk-report');
    expect(draft).toHaveTextContent('AGENT DRAFT · UNREVIEWED');
    expect(draft).toHaveTextContent('A freeform heading');
    expect(draft).not.toHaveTextContent('Source-backed evidence');
    const cited = within(draft).getAllByRole('button', { name: 'sources/refund.md#l2' })[0]!;
    expect(cited).toHaveClass('text-body');
    fireEvent.click(cited);
    expect(onOpenSource).toHaveBeenCalledWith('sources/refund.md', 'l2');
    expect(draft).toHaveTextContent('refund policy · sources/refund.md#l2');
    expect(evidenceToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByTestId('question-desk-report-citation-unavailable')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'sources/refund.md#bogus' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'external' })).not.toBeInTheDocument();
    expect(draft.querySelector('img')).toBeNull();
    expect(draft.querySelector('img[src="https://example.com/raw.png"]')).toBeNull();
    expect(onFileReport).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId('question-desk-file-report'));
    expect(onFileReport).toHaveBeenCalledTimes(1);
    expect(mocks.judge).not.toHaveBeenCalled();
    expect(screen.getByTestId('question-desk-report-raw')).toHaveTextContent('A freeform heading');
    rendered.rerender(<Desk visible={false} report={report} onSummarize={onSummarize} onFileReport={onFileReport} onOpenSource={onOpenSource} />);
    expect(screen.queryByTestId('question-desk-report-markdown')).not.toBeInTheDocument();
    rendered.rerender(<Desk visible report={report} onSummarize={onSummarize} onFileReport={onFileReport} onOpenSource={onOpenSource} />);
    expect(screen.getByTestId('question-desk-report')).toHaveTextContent('A freeform heading');
  });

  it('makes an exact four-section report answer-first and keeps local-zero diagnostics secondary', async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const onOpenSource = vi.fn();
    const rendered = render(<Desk onSummarize={onSummarize} onOpenSource={onOpenSource} />);
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Who owns the lunar migration?' } });
    fireEvent.click(screen.getByTestId('question-desk-search'));
    await screen.findByTestId('question-desk-unknown');
    expect(screen.queryByTestId('question-desk-evidence-leads')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    const request = onSummarize.mock.calls[0]![0];
    const report: QuestionDeskReportDraft = {
      question: request.question, searchId: request.searchId, listingVersion: request.listingVersion, vaultScope: request.vaultScope,
      text: '## Answer\nNo owner is recorded in the originals [[src:sources/refund.md#l2]] [[src:sources/refund.md#l1]].\n\n> A later quoted note remains ordinary prose.\n\n- A loose list note remains ordinary prose.\n\n  Its second paragraph also stays ordinary.\n## Source-backed evidence\n- The plan lists no owner. [[src:sources/refund.md#l2]]\n## Disagreements or changed claims\n- One page suggests an owner.\n## Unknowns and search limits\n- Another-language documents may be missed.',
      coverage: request.coverage, limits: request.limits, generatedAt: '2026-09-27T17:00:00Z',
    };
    rendered.rerender(<Desk report={report} onSummarize={onSummarize} onOpenSource={onOpenSource} />);
    expect(screen.queryByTestId('question-desk-unknown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-desk-summarize')).not.toBeInTheDocument();
    const answer = screen.getByTestId('question-desk-report-section-0');
    expect(screen.getByTestId('question-desk-report')).toHaveAttribute('data-dock-open', 'false');
    expect(screen.getByTestId('library-question-desk').firstElementChild?.className).toContain('max-w-[calc(');
    expect(within(answer).getByText('Answer')).toHaveClass('text-title');
    expect(answer).toHaveTextContent('No owner is recorded in the originals.');
    const answerParagraphs = Array.from(answer.querySelectorAll('p'));
    expect(answerParagraphs.length).toBeGreaterThanOrEqual(3);
    expect(answerParagraphs[0]).toHaveClass('text-display');
    expect(answerParagraphs[0]).not.toHaveTextContent('sources/refund.md#l2');
    expect(answer.querySelector('[data-report-citations]')).toHaveTextContent('sources/refund.md#l2');
    expect(answerParagraphs[0]).toHaveTextContent('No owner is recorded in the originals.');
    expect(answerParagraphs[0]?.textContent).not.toMatch(/\s\./u);
    fireEvent.click(within(answer).getByRole('button', { name: 'sources/refund.md#l2' }));
    expect(onOpenSource).toHaveBeenCalledWith('sources/refund.md', 'l2');
    expect(answerParagraphs.slice(1).every((paragraph) => !paragraph.classList.contains('text-display'))).toBe(true);
    expect(screen.getByTestId('question-desk-download-markdown')).toBeInTheDocument();
    expect(answer.querySelector('[data-report-actions]')).toBeNull();
    expect(screen.queryByTestId('question-desk-input')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('question-desk-edit-question'));
    expect(screen.getByTestId('question-desk-input')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId('question-desk-input')));
    rendered.rerender(<Desk dockOpen report={report} onSummarize={onSummarize} />);
    expect(screen.getByTestId('question-desk-report')).toHaveAttribute('data-dock-open', 'true');
    expect(screen.getByTestId('question-desk-report-section-1')).not.toHaveClass('border-t');
    expect(screen.getByTestId('question-desk-report-sections').querySelector('[data-report-evidence-pair]')).not.toHaveClass('flex');
    expect(screen.getByTestId('question-desk-report-section-1')).toHaveTextContent('The plan lists no owner.');
    expect(screen.getByTestId('question-desk-report-section-2')).toHaveClass('border-t');
    expect(screen.getByTestId('question-desk-report-section-2')).toHaveTextContent('One page suggests an owner.');
    expect(screen.getByTestId('question-desk-report-section-3')).toHaveTextContent('Another-language documents may be missed.');
    expect(screen.getByTestId('question-desk-coverage-toggle')).toHaveAttribute('aria-expanded', 'false');
  });

  it('keeps a focused question field mounted when the report arrives', async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const rendered = render(<Desk onSummarize={onSummarize} />);
    await search();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    const request = onSummarize.mock.calls[0]![0];
    const input = screen.getByTestId('question-desk-input');
    act(() => { input.focus(); });
    rendered.rerender(<Desk onSummarize={onSummarize} report={{
      question: request.question, searchId: request.searchId, listingVersion: request.listingVersion,
      vaultScope: request.vaultScope, text: 'A draft.', coverage: request.coverage,
      limits: request.limits, generatedAt: '2026-09-27T17:00:00Z',
    }} />);
    expect(input).toBeInTheDocument();
    expect(document.activeElement).toBe(input);
  });

  it('keeps Korean masthead type untracked and renders a localized human timestamp', async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const rendered = render(<Desk onSummarize={onSummarize} />);
    await search();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    const request = onSummarize.mock.calls[0]![0];
    const generatedAt = '2026-09-27T17:00:00Z';
    const report: QuestionDeskReportDraft = {
      question: request.question, searchId: request.searchId, listingVersion: request.listingVersion, vaultScope: request.vaultScope,
      text: 'An unreviewed answer.', coverage: request.coverage, limits: request.limits, generatedAt,
    };
    rendered.rerender(<Desk report={report} onSummarize={onSummarize} />);
    expect(screen.getByTestId('question-desk-report-masthead')).toHaveClass('font-mono');
    expect(screen.getByTestId('question-desk-report-masthead').className).toContain('tracking-');
    const generated = screen.getByTestId('question-desk-report-generated');
    expect(generated).toHaveAttribute('datetime', generatedAt);
    expect(generated).toHaveTextContent(new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(generatedAt)));
    expect(generated).not.toHaveTextContent(generatedAt);

    rendered.rerender(<Desk locale="ko" report={report} onSummarize={onSummarize} />);
    const koreanMasthead = screen.getByTestId('question-desk-report-masthead');
    expect(koreanMasthead).toHaveTextContent(/[가-힣]/u);
    expect(koreanMasthead.className).not.toMatch(/tracking-|font-mono/u);
    expect(screen.getByTestId('question-desk-report-generated')).toHaveTextContent(
      new Intl.DateTimeFormat('ko', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(generatedAt)),
    );
  });

  it('offers explicit Markdown and print exports only for the current unreviewed report', async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const rendered = render(<Desk onSummarize={onSummarize} />);
    await search();
    expect(screen.queryByTestId('question-desk-download-markdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-desk-print-pdf')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    const request = onSummarize.mock.calls[0]![0];
    const report: QuestionDeskReportDraft = {
      question: request.question, searchId: request.searchId, listingVersion: request.listingVersion, vaultScope: request.vaultScope,
      text: 'A job runs later. [[src:sources/refund.md#l2]]',
      coverage: request.coverage, limits: request.limits, generatedAt: '2026-09-27T17:00:00Z',
    };
    rendered.rerender(<Desk report={report} onSummarize={onSummarize} />);
    const printable = screen.getByTestId('question-desk-print-content');
    expect(printable).toHaveTextContent(request.question);
    expect(printable).toHaveTextContent(report.text.replace('[[src:sources/refund.md#l2]]', 'sources/refund.md#l2'));
    expect(printable).toHaveTextContent(report.coverage);
    expect(printable).toHaveTextContent(report.limits);
    expect(printable.querySelector('[data-report-actions]')).not.toBeNull();
    const previousCreate = URL.createObjectURL;
    const previousRevoke = URL.revokeObjectURL;
    const createUrl = vi.fn(() => 'blob:question-desk');
    const revokeUrl = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl });
    let downloadedName = '';
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { downloadedName = this.download; });
    try {
      vi.useFakeTimers();
      fireEvent.click(screen.getByTestId('question-desk-download-markdown'));
      expect(createUrl).toHaveBeenCalledWith(expect.any(Blob));
      expect(downloadedName).toBe('atlas-question-report-does-refund-approval-restore-stock-20260927.md');
      vi.advanceTimersByTime(1000);
      expect(revokeUrl).toHaveBeenCalledWith('blob:question-desk');
    } finally {
      vi.useRealTimers();
      anchorClick.mockRestore();
      if (previousCreate) Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: previousCreate });
      else delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL;
      if (previousRevoke) Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: previousRevoke });
      else delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL;
    }
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByTestId('question-desk-print-pdf'));
    expect(print).toHaveBeenCalledTimes(1);
    expect(document.documentElement.dataset.printScope).toBe('question-desk');
    const printPageStyle = Array.from(document.head.querySelectorAll('style')).find((style) => style.textContent?.includes('@page { size: A4; margin: 18mm 16mm; }'));
    expect(printPageStyle).toBeInTheDocument();
    expect(document.body.querySelector('[data-question-desk-print-root]')).toBeInTheDocument();
    window.dispatchEvent(new Event('afterprint'));
    expect(document.documentElement.dataset.printScope).toBeUndefined();
    expect(printPageStyle).not.toBeInTheDocument();
    expect(document.body.querySelector('[data-question-desk-print-root]')).toBeNull();
    print.mockImplementationOnce(() => Promise.reject(new Error('ACL')) as never);
    fireEvent.click(screen.getByTestId('question-desk-print-pdf'));
    expect(await screen.findByTestId('question-desk-print-error')).toHaveTextContent('Could not open the print dialog');
    expect(document.documentElement.dataset.printScope).toBeUndefined();
    expect(document.body.querySelector('[data-question-desk-print-root]')).toBeNull();
    print.mockRestore();
    rendered.rerender(<Desk report={report} listedMtime={11} onSummarize={onSummarize} />);
    expect(screen.queryByTestId('question-desk-report')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-desk-print-pdf')).not.toBeInTheDocument();
  });

  it('clears an active print scope when the desk unmounts before afterprint', async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const rendered = render(<Desk onSummarize={onSummarize} />);
    await search();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    const request = onSummarize.mock.calls[0]![0];
    rendered.rerender(<Desk onSummarize={onSummarize} report={{
      question: request.question, searchId: request.searchId, listingVersion: request.listingVersion,
      vaultScope: request.vaultScope, text: 'Unreviewed answer.', coverage: request.coverage,
      limits: request.limits, generatedAt: '2026-09-27T17:00:00Z',
    }} />);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {});
    fireEvent.click(screen.getByTestId('question-desk-print-pdf'));
    expect(document.documentElement.dataset.printScope).toBe('question-desk');
    expect(document.body.querySelector('[data-question-desk-print-root]')).toBeInTheDocument();
    rendered.unmount();
    expect(document.documentElement.dataset.printScope).toBeUndefined();
    expect(document.body.querySelector('[data-question-desk-print-root]')).toBeNull();
    print.mockRestore();
  });

  it('hands a complete report to a direct body print root before opening the dialog', async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const rendered = render(<Desk onSummarize={onSummarize} />);
    await search();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    const request = onSummarize.mock.calls[0]![0];
    const report: QuestionDeskReportDraft = {
      question: request.question, searchId: request.searchId, listingVersion: request.listingVersion, vaultScope: request.vaultScope,
      text: '## Answer\nA later job restores stock.\n## Source-backed evidence\n- The job is queued. [[src:sources/refund.md#l2]]\n## Disagreements or changed claims\n- The Wiki says immediately.\n## Unknowns and search limits\n- The run time is unknown.',
      coverage: request.coverage, limits: request.limits, generatedAt: '2026-09-27T17:00:00Z',
    };
    rendered.rerender(<Desk report={report} onSummarize={onSummarize} />);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      const printRoot = document.body.querySelector('[data-question-desk-print-root]');
      expect(printRoot?.parentElement).toBe(document.body);
      expect(printRoot).toHaveTextContent(report.question);
      expect(printRoot).toHaveTextContent('A later job restores stock.');
      expect(printRoot).toHaveTextContent('The job is queued.');
      expect(printRoot).toHaveTextContent('The Wiki says immediately.');
      expect(printRoot).toHaveTextContent('The run time is unknown.');
      expect(printRoot).toHaveTextContent(report.coverage);
      expect(printRoot).toHaveTextContent(report.limits);
      expect(printRoot?.querySelector('[data-source-path="sources/refund.md"]')).toHaveTextContent('sources/refund.md#l2');
      expect(printRoot?.querySelector('[data-report-actions]')).toBeNull();
      expect(printRoot?.querySelector('[data-report-scope-disclosure]')).toBeNull();
      expect(printRoot?.querySelectorAll('[data-report-section-heading] + [data-report-markdown]')).toHaveLength(4);
      const chapterStart = printRoot?.querySelectorAll('[data-report-chapter-start]');
      expect(chapterStart).toHaveLength(1);
      expect(chapterStart?.[0]).toHaveTextContent('The Wiki says immediately.');
    });
    try {
      fireEvent.click(screen.getByTestId('question-desk-print-pdf'));
      expect(print).toHaveBeenCalledTimes(1);
      window.dispatchEvent(new Event('afterprint'));
      expect(document.body.querySelector('[data-question-desk-print-root]')).toBeNull();
    } finally { print.mockRestore(); }
  });

  it('renders a source-only folder and searches it without touching Keychain', async () => {
    mocks.status.mockReturnValue(new Promise(() => {}));
    render(<Desk includeWiki={false} />);
    expect(screen.getByTestId('library-question-desk')).toBeInTheDocument();
    expect(mocks.status).not.toHaveBeenCalled();
    await search();
    fireEvent.click(screen.getByTestId('question-desk-coverage-toggle'));
    expect(screen.getByTestId('question-desk-results')).toHaveTextContent('Searched 0 of 0 Wiki pages and 1 of 1 original files.');
    expect(screen.getByText('Refund approval queues a stock restoration job.')).toBeInTheDocument();
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('keeps local source review usable when no agent is connected', async () => {
    const onOpenSource = vi.fn();
    render(<Desk agentReady={false} onOpenSource={onOpenSource} />);
    await search();
    expect(screen.getByTestId('question-desk-summarize')).toBeDisabled();
    expect(screen.getByTestId('question-desk-evidence-toggle')).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(screen.getAllByRole('button', { name: 'sources/refund.md#l2' })[0]!);
    expect(onOpenSource).toHaveBeenCalledWith('sources/refund.md', 'l2');
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('reports an unknown answer from the searched coverage instead of inventing one', async () => {
    render(<Desk />);
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Who owns the lunar migration?' } });
    fireEvent.click(screen.getByTestId('question-desk-search'));
    const unknown = await screen.findByTestId('question-desk-unknown');
    expect(unknown).toHaveTextContent('Word search can miss documents in another language');
    expect(unknown).not.toHaveClass('border-t');
    expect(screen.getByTestId('question-desk-summarize')).toHaveTextContent('Investigate originals');
    fireEvent.click(screen.getByTestId('question-desk-coverage-toggle'));
    expect(screen.getByTestId('question-desk-results')).toHaveTextContent('Searched 1 of 1 Wiki pages and 1 of 1 original files.');
    expect(screen.getByTestId('question-desk-summarize')).toBeEnabled();
    expect(screen.queryByText('No matching Wiki fact or decision in the pages read.')).not.toBeInTheDocument();
    expect(screen.queryByText('No matching text unit in the originals Atlas could read.')).not.toBeInTheDocument();
  });

  it('reuses the unchanged source units for a second question in the same folder', async () => {
    render(<Desk />);
    await search();
    expect(fileReads).toBe(1);
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'When does the stock job run?' } });
    fireEvent.click(screen.getByTestId('question-desk-search'));
    await screen.findByTestId('question-desk-results');
    expect(fileReads).toBe(1);
  });

  it('cancels an in-flight search when the question changes and lets the new question run', async () => {
    let release!: () => void;
    fileGate = new Promise<void>((resolve) => { release = resolve; });
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    render(<Desk onSummarize={onSummarize} />);
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Does refund approval restore stock?' } });
    fireEvent.click(screen.getByTestId('question-desk-search'));
    await waitFor(() => expect(fileReads).toBe(1));
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Who owns the lunar migration?' } });
    expect(screen.queryByTestId('question-desk-results')).not.toBeInTheDocument();
    expect(screen.getByTestId('question-desk-search')).toBeEnabled();
    fileGate = null;
    fireEvent.click(screen.getByTestId('question-desk-search'));
    expect(await screen.findByTestId('question-desk-unknown')).toBeInTheDocument();
    await act(async () => { release(); });
    expect(screen.getByTestId('question-desk-unknown')).toBeInTheDocument();
    expect(screen.queryByText('Refund approval immediately restores stock.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    expect(onSummarize.mock.calls[0]?.[0].question).toBe('Who owns the lunar migration?');
  });

  it('invalidates cached source units when the inventoried file version changes', async () => {
    const rendered = render(<Desk />);
    await search();
    expect(fileReads).toBe(1);
    sourceMtime = 11;
    sourceText = '# Refund handling\nRefund approval waits for a later job.\n';
    rendered.rerender(<Desk listedMtime={11} />);
    expect(screen.getByText(/folder changed/i)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('question-desk-search'));
    await screen.findByTestId('question-desk-results');
    expect(fileReads).toBe(2);
  });

  it('blocks stale evidence before a consent preview or network call', async () => {
    mocks.status.mockResolvedValue({ stored: true, last4: '1234' });
    render(<Desk hash={'f'.repeat(64)} />);
    await search();
    fireEvent.click(await screen.findByText('Check claim with Jev'));
    await screen.findByTestId('question-desk-jev-note');
    expect(screen.queryByTestId('question-desk-jev-consent')).not.toBeInTheDocument();
    expect(mocks.judge).not.toHaveBeenCalled();
  });

  it('withholds Jev consent when the exact original passage exceeds the bridge limit', async () => {
    sourceText = '# Refund handling\nRefund approval queues a stock restoration job. ' + 'x'.repeat(8_001) + '\n';
    const hash = createHash('sha256').update(sourceText).digest('hex');
    mocks.status.mockResolvedValue({ stored: true, last4: '1234' });
    render(<Desk hash={hash} />);
    await search();
    fireEvent.click(await screen.findByText('Check claim with Jev'));
    expect(await screen.findByTestId('question-desk-jev-note')).toHaveTextContent('too long for Jev');
    expect(screen.queryByTestId('question-desk-jev-consent')).not.toBeInTheDocument();
    expect(mocks.judge).not.toHaveBeenCalled();
  });

  it('discards a pending key-status result after the question changes', async () => {
    let finish!: (status: { stored: boolean; last4: string }) => void;
    mocks.status.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Desk />);
    await search();
    fireEvent.click(screen.getByText('Check claim with Jev'));
    await waitFor(() => expect(mocks.status).toHaveBeenCalledTimes(1));
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Who owns the lunar migration?' } });
    expect(screen.getByTestId('question-desk-search')).toBeEnabled();
    await act(async () => { finish({ stored: true, last4: '1234' }); });
    expect(screen.queryByTestId('question-desk-jev-consent')).not.toBeInTheDocument();
    expect(screen.queryByTestId('question-desk-jev-note')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('question-desk-search'));
    expect(await screen.findByTestId('question-desk-unknown')).toBeInTheDocument();
  });

  it('shows the exact outgoing payload in a blocking consent dialog and sends only after Send', async () => {
    mocks.status.mockResolvedValue({ stored: true, last4: '1234' });
    render(<Desk />);
    await search();
    fireEvent.click(await screen.findByText('Check claim with Jev'));
    const preview = await screen.findByTestId('question-desk-jev-payload');
    const payload = preview.textContent!;
    expect(JSON.parse(payload).state).toEqual({
      claim: 'Refund approval immediately restores stock.',
      evidence: 'Refund approval queues a stock restoration job.',
    });
    expect(mocks.judge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByTestId('question-desk-jev-consent')).not.toBeInTheDocument());
    expect(mocks.judge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Check claim with Jev'));
    await screen.findByTestId('question-desk-jev-payload');
    fireEvent.click(screen.getByTestId('question-desk-jev-send'));
    await waitFor(() => expect(mocks.judge).toHaveBeenCalledWith('/fixture', payload));
    expect(await screen.findByTestId('question-desk-jev-result')).toHaveTextContent('Jev advice only');
    expect(screen.getByTestId('question-desk-jev-result')).toHaveTextContent('wiki/refund.md · sources/refund.md#l2');
  });

  it('keeps prior advice when a repeat check is canceled, then hides it when source version changes', async () => {
    mocks.status.mockResolvedValue({ stored: true, last4: '1234' });
    const rendered = render(<Desk />);
    await search();
    fireEvent.click(screen.getByText('Check claim with Jev'));
    await screen.findByTestId('question-desk-jev-payload');
    fireEvent.click(screen.getByTestId('question-desk-jev-send'));
    await screen.findByTestId('question-desk-jev-result');
    await waitFor(() => expect(screen.queryByTestId('question-desk-jev-consent')).not.toBeInTheDocument());
    fireEvent.click(screen.getByText('Check claim with Jev'));
    await screen.findByTestId('question-desk-jev-payload');
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByTestId('question-desk-jev-consent')).not.toBeInTheDocument());
    expect(screen.getByTestId('question-desk-jev-result')).toHaveTextContent('contradicted');
    expect(mocks.judge).toHaveBeenCalledTimes(1);
    rendered.rerender(<Desk listedMtime={11} />);
    expect(screen.queryByTestId('question-desk-jev-result')).not.toBeInTheDocument();
  });

  it('returns focus to the Jev claim button after Escape and Cancel close consent', async () => {
    mocks.status.mockResolvedValue({ stored: true, last4: '1234' });
    render(<Desk />);
    await search();
    const opener = screen.getByText('Check claim with Jev');
    opener.focus();
    fireEvent.click(opener);
    expect(await screen.findByTestId('question-desk-jev-consent')).toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByText('Cancel')));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByTestId('question-desk-jev-consent')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
    fireEvent.click(opener);
    await screen.findByTestId('question-desk-jev-consent');
    fireEvent.click(screen.getByText('Cancel'));
    await waitFor(() => expect(screen.queryByTestId('question-desk-jev-consent')).not.toBeInTheDocument());
    expect(document.activeElement).toBe(opener);
  });

  it('invalidates the preview if the exact source changes before Send', async () => {
    mocks.status.mockResolvedValue({ stored: true, last4: '1234' });
    render(<Desk />);
    await search();
    fireEvent.click(await screen.findByText('Check claim with Jev'));
    await screen.findByTestId('question-desk-jev-payload');
    sourceText = '# Refund handling\nA changed claim source.\n';
    sourceMtime = 11;
    fireEvent.click(screen.getByTestId('question-desk-jev-send'));
    expect(await screen.findByTestId('question-desk-jev-note')).toHaveTextContent('changed');
    expect(mocks.judge).not.toHaveBeenCalled();
  });

  it('discards Jev advice when its source changes while the response is pending', async () => {
    mocks.status.mockResolvedValue({ stored: true, last4: '1234' });
    let finish!: (value: unknown) => void;
    mocks.judge.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    render(<Desk />);
    await search();
    fireEvent.click(await screen.findByText('Check claim with Jev'));
    await screen.findByTestId('question-desk-jev-payload');
    fireEvent.click(screen.getByTestId('question-desk-jev-send'));
    await waitFor(() => expect(mocks.judge).toHaveBeenCalledTimes(1));
    sourceText = '# Refund handling\nA changed claim source.\n';
    sourceMtime = 11;
    await act(async () => { finish({ choice: 'supported', confidence: 1, responseModel: 'jev-latest', loggedAt: '' }); });
    expect(screen.queryByTestId('question-desk-jev-result')).not.toBeInTheDocument();
    expect(await screen.findByTestId('question-desk-jev-note')).toHaveTextContent('changed');
  });
});
