import { createHash, webcrypto } from 'node:crypto';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en.json';
import ko from '../../../../../messages/ko.json';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import type { VaultDoc, LibrarySourceRow } from '@/entities/docs-vault';

const mocks = vi.hoisted(() => ({
  status: vi.fn(), judge: vi.fn(),
  /** What search by meaning answers; `null` asks by words alone, as a folder with nothing set up. */
  meaning: null as import('@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors').VectorFound | null,
  /** Each question's answer by meaning: `meaning`, unless a test queues its own. */
  ask: vi.fn<() => Promise<import('@/shared/lib/vault-folder/vault-vectors/tauri-vault-vectors').VectorFound> | null>(),
  /** Resolves when the update a question started has ended. */
  updated: Promise.resolve(),
}));
vi.mock('@/features/vault-vectors', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/vault-vectors')>();
  return {
    ...actual,
    useVectorSearch: () => ({ ask: mocks.ask, warm: () => {}, offerSetup: false, afterJob: () => mocks.updated }),
  };
});
vi.mock('@/shared/lib/llm-connection/tauri-jev', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/llm-connection/tauri-jev')>();
  return { ...actual, jevSecretStatus: mocks.status, jevJudge: mocks.judge };
});

import type { LibraryPageFacts } from '@/features/library';
import { libraryPageFacts } from '@/features/library/model/library-page-facts';
import type { QuestionDeskReportRequest } from '../../model/turns/library-turn-requests';
import { LibraryQuestionDesk, type QuestionDeskReportDraft } from './LibraryQuestionDesk';

/** One facts object per page text, as the Library keeps one per page version. */
const factsByText = new Map<string, LibraryPageFacts>();
function factsOf(raw: string): LibraryPageFacts {
  let facts = factsByText.get(raw);
  if (!facts) factsByText.set(raw, (facts = libraryPageFacts(raw)));
  return facts;
}

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
    frontmatter: parseFrontmatter(raw).frontmatter, tags: [], 
    updatedAt: '', linksOut: [],
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

function Desk({ hash = currentHash, scope = 'folder-a', listedMtime = 10, includeWiki = true, extraPages = [], visible = true, agentReady = true, dockOpen = false, locale = 'en', onSummarize = () => {}, onInvalidateReport = () => {}, report = null, onFileReport = null, onOpenSource = () => {}, onOpenWiki = () => {} }: {
  hash?: string; scope?: string; listedMtime?: number; includeWiki?: boolean; extraPages?: Array<{ doc: VaultDoc; raw: string }>;
  visible?: boolean; agentReady?: boolean; dockOpen?: boolean; locale?: 'en' | 'ko';
  onSummarize?: (request: QuestionDeskReportRequest) => void;
  onInvalidateReport?: () => void;
  report?: QuestionDeskReportDraft | null;
  onFileReport?: (() => void) | null;
  onOpenSource?: (path: string, anchor?: string) => void;
  onOpenWiki?: (slug: string) => void;
}) {
  const { doc, raw, source, handle } = fixture(hash, listedMtime);
  return <NextIntlClientProvider locale={locale} messages={locale === 'ko' ? ko : en}>
    <LibraryQuestionDesk docs={[...(includeWiki ? [doc] : []), ...extraPages.map((page) => page.doc)]}
      pageFacts={new Map([...(includeWiki ? [[doc.slug, factsOf(raw)] as const] : []), ...extraPages.map((page) => [page.doc.slug, factsOf(page.raw)] as const)])}
      sources={[source]} sourceHandles={new Map([[path, handle]])} hashes={new Map([[path, currentHash]])}
      vaultRoot="/fixture" vaultScope={scope} agentReady={agentReady} dockOpen={dockOpen}
      visible={visible}
      turnRunning={false} report={report} onSummarize={onSummarize}
      onInvalidateReport={onInvalidateReport}
      onFileReport={onFileReport} filingReport={false} fileReportNote={null}
      onBrowse={() => {}} onOpenWiki={onOpenWiki} onOpenSource={onOpenSource} />
  </NextIntlClientProvider>;
}

beforeEach(() => {
  sourceText = original;
  sourceMtime = 10;
  fileReads = 0;
  fileGate = null;
  mocks.meaning = null;
  mocks.ask.mockReset();
  mocks.ask.mockImplementation(() => (mocks.meaning ? Promise.resolve(mocks.meaning) : null));
  mocks.updated = Promise.resolve();
  mocks.status.mockReset();
  mocks.judge.mockReset();
  mocks.status.mockResolvedValue({ stored: false, last4: null });
  mocks.judge.mockResolvedValue({ choice: 'contradicted', confidence: 0.9, responseModel: 'jev-latest', loggedAt: '' });
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
});

function page(slug: string, raw: string, updatedAt = '2026-11-01T00:00:00Z'): { doc: VaultDoc; raw: string } {
  return { raw, doc: {
    slug, path: `${slug}.md`, title: parseFrontmatter(raw).frontmatter.title as string, frontmatter: parseFrontmatter(raw).frontmatter,
    tags: [], updatedAt, linksOut: [],
  } };
}

/** jsdom lays nothing out, and the popover places itself from its glyph's rect. */
function openCoverage() {
  const glyph = screen.getByTestId('question-desk-coverage-info');
  glyph.getBoundingClientRect = () => ({ x: 0, y: 0, top: 0, left: 0, right: 24, bottom: 24, width: 24, height: 24, toJSON: () => ({}) });
  fireEvent.click(glyph);
  return glyph;
}

/**
 * A report citation as the screen and print read it. jsdom applies no stylesheet, so the classes
 * stand for `display`: the place is screen-only, the address is print-only and the description.
 */
function expectCitation(press: HTMLElement, place: string, address: string, { printCopy = false } = {}) {
  const shown = press.querySelector('[data-citation-place]')!;
  const printed = press.querySelector('[data-citation-address]')!;
  expect(shown).toHaveTextContent(place);
  expect(shown).toHaveClass('print:hidden');
  expect(printed.textContent).toBe(address);
  expect(printed).toHaveClass('hidden', 'print:inline');
  // The print copy drops ids; on screen the address is the press's description.
  if (!printCopy) expect(press).toHaveAccessibleDescription(address);
}

describe('Library question desk transfer boundary', () => {
  async function search() {
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Does refund approval restore stock?' } });
    fireEvent.click(screen.getByTestId('question-desk-search'));
    await screen.findByTestId('question-desk-results');
  }

  it('opens an inventoried original before searching without reading or inventing a citation', () => {
    const onOpenSource = vi.fn();
    render(<Desk onOpenSource={onOpenSource} agentReady={false} includeWiki={false} />);
    const originals = screen.getByTestId('question-desk-originals');
    fireEvent.click(within(originals).getByRole('button', { name: /refund.md/ }));
    expect(onOpenSource).toHaveBeenCalledWith('sources/refund.md');
    expect(fileReads).toBe(0);
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('keeps local search and original anchors usable with no Jev key', async () => {
    const onOpenSource = vi.fn();
    render(<Desk onOpenSource={onOpenSource} />);
    await search();
    expect(screen.getByTestId('question-desk-summarize')).toBeEnabled();
    const leads = screen.getAllByTestId('question-desk-lead');
    // Line 2 is the place the claim cites, but it says something else: the claim and the line that
    // contradicts it stand in the list together.
    expect(leads.map((lead) => lead.dataset.leadKind)).toEqual(['claim', 'source', 'source']);
    expect(screen.getByTestId('question-desk-results-head')).toHaveTextContent('3 passages found');
    expect(screen.getByRole('button', { name: 'Refund approval immediately restores stock.' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Refund approval queues a stock restoration job.' })).toBeInTheDocument();
    for (const lead of leads) expect(lead.textContent).not.toMatch(/\.md#/u);
    const cited = within(leads[0]!).getByRole('button', { name: 'refund.md · line 2' });
    // The second line has one label size; the cited file differs from a file name only by ink.
    expect(cited).toHaveClass('text-label');
    expect(cited).not.toHaveClass('text-caption');
    expect(leads[1]!.querySelector('[data-lead-where]')).toHaveClass('text-label');
    fireEvent.click(cited);
    expect(onOpenSource).toHaveBeenLastCalledWith('sources/refund.md', 'l2');
    expect(mocks.status).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Check claim with Jev'));
    expect(await screen.findByTestId('question-desk-jev-note')).toHaveTextContent('No Jev key');
    expect(mocks.judge).not.toHaveBeenCalled();
  });

  it('says the method sentence true for the search in the popover, the brief and the saved limits', async () => {
    const wordsOnly = 'Unreadable sources: 0 · changed during search: 0 · skipped by read limit: 0 · matching leads omitted: 0. Search matches words and uses the last listed file versions; external edits may appear after a folder refresh.';
    const byMeaning = 'Search matches words and meaning and uses the last listed file versions; external edits may appear after a folder refresh.';
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const rendered = render(<Desk onSummarize={onSummarize} />);
    await search();
    openCoverage();
    expect(screen.getByTestId('question-desk-coverage-info-popover')).toHaveTextContent('Search matches words and uses the last listed file versions');
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    expect(onSummarize.mock.calls[0]![0].limits).toBe(wordsOnly);
    expect(onSummarize.mock.calls[0]![0].brief).toContain(wordsOnly);
    rendered.unmount();

    mocks.meaning = { state: 'ok', failure: null, hits: [{ path, lineStart: 2, lineEnd: 2, heading: 'Refund handling', score: 0.8 }], staleDropped: 0, filesReady: 2, filesTotal: 2, busy: false };
    render(<Desk onSummarize={onSummarize} />);
    await search();
    openCoverage();
    expect(screen.getByTestId('question-desk-coverage-info-popover')).toHaveTextContent(byMeaning);
    expect(screen.getByTestId('question-desk-coverage-info-popover')).not.toHaveTextContent('Search matches words and uses');
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    const request = onSummarize.mock.calls[1]![0];
    expect(request.limits).toBe(wordsOnly.replace('Search matches words and uses', 'Search matches words and meaning and uses'));
    expect(request.brief).toContain(byMeaning);
    expect(request.brief).not.toContain('Search matches words and uses');
  });

  it('adds how much meaning covered to the saved limits and the brief only when it covered part of the folder', async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    mocks.meaning = { state: 'ok', failure: null, hits: [{ path, lineStart: 2, lineEnd: 2, heading: 'Refund handling', score: 0.8 }], staleDropped: 0, filesReady: 1240, filesTotal: 2000, busy: false };
    render(<Desk onSummarize={onSummarize} />);
    await search();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    const request = onSummarize.mock.calls[0]![0];
    expect(request.limits).toMatch(/ Search matches words and meaning and uses .* folder refresh\. By meaning: 1,240 of 2,000 files\.$/u);
    expect(request.brief).toContain('By meaning: 1,240 of 2,000 files.');
  });

  it('starts a report only on explicit press and renders the returned freeform draft with safe citations', async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const onFileReport = vi.fn();
    const onOpenSource = vi.fn();
    const rendered = render(<Desk onSummarize={onSummarize} onFileReport={onFileReport} onOpenSource={onOpenSource} />);
    await search();
    expect(onSummarize).not.toHaveBeenCalled();
    expect(mocks.status).not.toHaveBeenCalled();
    expect(screen.getByTestId('question-desk-summarize')).toBeEnabled();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    expect(onSummarize).toHaveBeenCalledTimes(1);
    const request = onSummarize.mock.calls[0]![0];
    expect(request.brief).toContain('## Disagreements or changed claims');
    expect(request.brief).toContain('Write no files.');
    const firstLead = within(screen.getAllByTestId('question-desk-lead')[0]!).getAllByRole('button')[0]!;
    firstLead.focus();
    const report: QuestionDeskReportDraft = {
      question: request.question, searchId: request.searchId, listingVersion: request.listingVersion, vaultScope: request.vaultScope,
      text: '# A freeform heading\n\nThe job runs later. [[src:sources/refund.md#l2]] and [[src:sources/refund.md#l2|refund policy]].\n\nMissing [[src:sources/gone.md#l4]]. Invalid [[src:sources/refund.md#bogus]]. [external](https://example.com) ![remote](https://example.com/image.png)<img src="https://example.com/raw.png" />',
      coverage: request.coverage, limits: request.limits, generatedAt: '2026-09-27T17:00:00Z',
    };
    rendered.rerender(<Desk report={report} onSummarize={onSummarize} onFileReport={onFileReport} onOpenSource={onOpenSource} />);
    expect(document.activeElement).toBe(firstLead);
    expect(screen.getByTestId('question-desk-results-head')).toHaveTextContent('Passages the search found');
    expect(screen.getByTestId('question-desk-input')).toBeInTheDocument();
    const draft = screen.getByTestId('question-desk-report');
    expect(draft).toHaveTextContent('AGENT DRAFT · UNREVIEWED');
    expect(draft).toHaveTextContent('A freeform heading');
    expect(draft).not.toHaveTextContent('Source-backed evidence');
    const cited = draft.querySelector<HTMLElement>('[data-source-path="sources/refund.md"]')!;
    expect(cited).toHaveClass('text-body');
    expectCitation(cited, 'refund.md · line 2', 'sources/refund.md#l2');
    fireEvent.click(cited);
    expect(onOpenSource).toHaveBeenCalledWith('sources/refund.md', 'l2');
    const labelled = draft.querySelectorAll<HTMLElement>('[data-source-path="sources/refund.md"]')[1]!;
    expect(labelled.firstChild).toHaveTextContent('refund policy');
    expectCitation(labelled, 'refund.md · line 2', 'sources/refund.md#l2');
    expect(screen.getAllByTestId('question-desk-lead')).toHaveLength(3);
    expect(screen.getAllByTestId('question-desk-report-citation-unavailable')).toHaveLength(2);
    // Only the two exact citations press; `#bogus` and the missing file stay inert text. jsdom hides
    // no print-only span, so the name is read from the screen-only place the browser names it by.
    expect(within(draft).getAllByRole('button', { description: /^sources\// }).map((press) => [
      press.querySelector('[data-citation-place]')!.textContent, press.title,
    ])).toEqual([
      ['refund.md · line 2', 'sources/refund.md#l2'],
      ['refund.md · line 2', 'sources/refund.md#l2'],
    ]);
    expect(within(draft).getByText(/sources\/refund\.md#bogus/u).closest('button')).toBeNull();
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
    expect(screen.getByTestId('library-question-desk').firstElementChild?.className).toContain('max-w-[var(--measure-doc-column)]');
    expect(within(answer).getByText('Answer')).toHaveClass('text-title');
    expect(answer).toHaveTextContent('No owner is recorded in the originals.');
    const answerParagraphs = Array.from(answer.querySelectorAll('p'));
    expect(answerParagraphs.length).toBeGreaterThanOrEqual(3);
    expect(answerParagraphs[0]).toHaveClass('text-display');
    expect(answerParagraphs[0]).not.toHaveTextContent('sources/refund.md#l2');
    const answerCitations = answer.querySelector('[data-report-citations]')!;
    expect(answerCitations.querySelector('[data-citation-place]')).toHaveTextContent('refund.md · line 2');
    expect(answerParagraphs[0]).toHaveTextContent('No owner is recorded in the originals.');
    expect(answerParagraphs[0]?.textContent).not.toMatch(/\s\./u);
    fireEvent.click(answerCitations.querySelector<HTMLElement>('[data-source-anchor="l2"]')!);
    expect(onOpenSource).toHaveBeenCalledWith('sources/refund.md', 'l2');
    expect(answerParagraphs.slice(1).every((paragraph) => !paragraph.classList.contains('text-display'))).toBe(true);
    expect(screen.getByTestId('question-desk-download-markdown')).toBeInTheDocument();
    expect(answer.querySelector('[data-report-actions]')).toBeNull();
    expect(screen.getByTestId('question-desk-input')).toHaveValue('Who owns the lunar migration?');
    rendered.rerender(<Desk dockOpen report={report} onSummarize={onSummarize} />);
    expect(screen.getByTestId('question-desk-report')).toHaveAttribute('data-dock-open', 'true');
    expect(screen.getByTestId('question-desk-report-section-1')).not.toHaveClass('border-t');
    expect(screen.getByTestId('question-desk-report-sections').querySelector('[data-report-evidence-pair]')).not.toHaveClass('flex');
    expect(screen.getByTestId('question-desk-report-section-1')).toHaveTextContent('The plan lists no owner.');
    expect(screen.getByTestId('question-desk-report-section-2')).toHaveTextContent('One page suggests an owner.');
    expect(screen.getByTestId('question-desk-report-section-3')).toHaveTextContent('Another-language documents may be missed.');
    expect(screen.getByTestId('question-desk-report-coverage-info')).toHaveAttribute('aria-expanded', 'false');
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

  it("keeps the question focused while Search is pressed over an arrived report, so WebKit's blur cannot hide the form before the click", async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const rendered = render(<Desk onSummarize={onSummarize} />);
    await search();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    const request = onSummarize.mock.calls[0]![0];
    act(() => { screen.getByTestId('question-desk-input').focus(); });
    rendered.rerender(<Desk onSummarize={onSummarize} report={{
      question: request.question, searchId: request.searchId, listingVersion: request.listingVersion,
      vaultScope: request.vaultScope, text: 'A draft.', coverage: request.coverage,
      limits: request.limits, generatedAt: '2026-09-27T17:00:00Z',
    }} />);
    expect(fireEvent.mouseDown(screen.getByTestId('question-desk-search'))).toBe(false);
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
    expect(printable).toHaveTextContent('A job runs later.');
    expectCitation(printable.querySelector<HTMLElement>('[data-source-path="sources/refund.md"]')!, 'refund.md · line 2', 'sources/refund.md#l2');
    expect(printable).toHaveTextContent(report.coverage);
    expect(printable).toHaveTextContent(report.limits);
    expect(printable.querySelector('[data-report-actions]')).not.toBeNull();
    const previousCreate = URL.createObjectURL;
    const previousRevoke = URL.revokeObjectURL;
    let exported: Blob | null = null;
    const createUrl = vi.fn((blob: Blob) => { exported = blob; return 'blob:question-desk'; });
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
    // The Markdown export is the address record the screen shortens: the same text main exports.
    const markdown = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(exported!);
    });
    expect(markdown).toContain('sources/refund.md#l2');
    expect(markdown).not.toContain('refund.md · line 2');
    expect(markdown.replace(report.coverage, '<coverage>').replace(report.limits, '<limits>')).toMatchInlineSnapshot(`
      "# Ontology Atlas · Knowledge Report

      > Status: Agent draft · Unreviewed
      > Generated: 2026-09-27T17:00:00Z

      ## Question

      Does refund approval restore stock?

      ## Agent report draft

      A job runs later. [[src:sources/refund.md#l2]]

      ---

      ## Search-time scope and limits

      <coverage>

      <limits>

      Source citations are portable text addresses. Availability reflects the search-time file inventory; this export did not re-read the originals. External links and images are inert.
      "
    `);
    const print = vi.spyOn(window, 'print').mockImplementation(() => {
      const printRoot = document.body.querySelector('[data-question-desk-print-root]')!;
      expectCitation(printRoot.querySelector<HTMLElement>('[data-source-path="sources/refund.md"]')!, 'refund.md · line 2', 'sources/refund.md#l2', { printCopy: true });
    });
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
    openCoverage();
    expect(await screen.findByTestId('question-desk-coverage-info-popover')).toHaveTextContent('Wiki 0/0 · Sources 1/1');
    expect(screen.getByRole('button', { name: 'Refund approval queues a stock restoration job.' })).toBeInTheDocument();
    expect(mocks.status).not.toHaveBeenCalled();
  });

  it('keeps local source review usable when no agent is connected', async () => {
    const onOpenSource = vi.fn();
    render(<Desk agentReady={false} onOpenSource={onOpenSource} />);
    await search();
    expect(screen.getByTestId('question-desk-summarize')).toBeDisabled();
    expect(screen.getByText(/Connect an agent in the installed app/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'refund.md · line 2' }));
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
    expect(screen.getByTestId('question-desk-summarize')).toHaveTextContent('Investigate sources');
    // The title is the head: no count of zero, no rule under it, and the scope glyph ends its line.
    expect(screen.queryByTestId('question-desk-results-head')).not.toBeInTheDocument();
    expect(unknown).not.toHaveTextContent('0 passages found');
    const title = within(unknown).getByRole('heading', { name: 'No matching passage yet' });
    expect(title.nextElementSibling).toBe(screen.getByTestId('question-desk-coverage-info'));
    openCoverage();
    const popover = await screen.findByTestId('question-desk-coverage-info-popover');
    // Nothing was omitted, so the compact line names no omitted leads.
    expect(popover).toHaveTextContent('Wiki 1/1 · Sources 1/1');
    expect(popover).not.toHaveTextContent('leads omitted');
    expect(screen.getByTestId('question-desk-summarize')).toBeEnabled();
    expect(screen.queryByText('No matching wiki fact or decision in the pages read.')).not.toBeInTheDocument();
    expect(screen.queryByText(/No matching text in the sources Atlas could read/)).not.toBeInTheDocument();
  });

  describe('a question asked while changed files wait for their update', () => {
    const leftOut = { state: 'ok' as const, failure: null, hits: [], staleDropped: 3, filesReady: 2, filesTotal: 2, busy: true };
    const updatedAnswer = { ...leftOut, staleDropped: 0, busy: false, hits: [{ path, lineStart: 2, lineEnd: 2, heading: 'Refund handling', score: 0.8 }] };
    let endUpdate = () => {};
    beforeEach(() => {
      mocks.updated = new Promise((resolve) => { endUpdate = resolve; });
      mocks.ask.mockReturnValueOnce(Promise.resolve(leftOut)).mockReturnValueOnce(Promise.resolve(updatedAnswer));
    });

    it('says passages were left out, then asks again once the update has ended', async () => {
      render(<Desk />);
      fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Who owns the lunar migration?' } });
      fireEvent.click(screen.getByTestId('question-desk-search'));
      expect(await screen.findByTestId('question-desk-unknown')).toHaveTextContent(/3 passages from changed files/u);
      expect(mocks.ask).toHaveBeenCalledTimes(1);

      await act(async () => { endUpdate(); });
      expect(await screen.findByText('Refund approval queues a stock restoration job.')).toBeInTheDocument();
      expect(screen.queryByTestId('question-desk-unknown')).not.toBeInTheDocument();
      expect(mocks.ask).toHaveBeenCalledTimes(2);
    });

    it('does not ask again once the question has changed', async () => {
      render(<Desk />);
      const field = screen.getByTestId('question-desk-input');
      fireEvent.change(field, { target: { value: 'Who owns the lunar migration?' } });
      fireEvent.click(screen.getByTestId('question-desk-search'));
      await screen.findByTestId('question-desk-unknown');
      fireEvent.change(field, { target: { value: 'Who owns the solar migration?' } });

      await act(async () => { endUpdate(); });
      expect(mocks.ask).toHaveBeenCalledTimes(1);
    });

    it('does not ask again when the app reports no job, as for a stopped folder', async () => {
      mocks.ask.mockReset();
      mocks.ask.mockReturnValue(Promise.resolve({ ...leftOut, busy: false }));
      render(<Desk />);
      fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Who owns the lunar migration?' } });
      fireEvent.click(screen.getByTestId('question-desk-search'));
      expect(await screen.findByTestId('question-desk-unknown')).toHaveTextContent(/3 passages from changed files/u);

      await act(async () => { endUpdate(); });
      expect(mocks.ask).toHaveBeenCalledTimes(1);
    });
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
    expect(screen.queryByRole('button', { name: 'Refund approval immediately restores stock.' })).not.toBeInTheDocument();
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
    expect(screen.getByTestId('question-desk-jev-result')).toHaveTextContent('Refund overview · refund.md · line 2');
    expect(screen.getByTestId('question-desk-jev-result')).not.toHaveTextContent('#');
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

  it('lists a saved question and recent pages at entry instead of the originals, and opens them', () => {
    const onOpenWiki = vi.fn();
    const saved = page('wiki/answers/kept', `---\ntitle: When does stock return?\ncompiled_at: 2026-11-05T00:00:00Z\nsources: [${path}]\n---\n`);
    render(<Desk onOpenWiki={onOpenWiki} extraPages={[saved]} />);
    expect(screen.queryByTestId('question-desk-originals')).not.toBeInTheDocument();
    const questions = screen.getByTestId('question-desk-saved');
    expect(questions).toHaveTextContent('Saved questions');
    fireEvent.click(within(questions).getByRole('button', { name: /When does stock return\?/ }));
    expect(onOpenWiki).toHaveBeenLastCalledWith('wiki/answers/kept');
    const recent = screen.getByTestId('question-desk-recent');
    expect(within(recent).getAllByRole('button')).toHaveLength(1);
    fireEvent.click(within(recent).getByRole('button', { name: /Refund overview/ }));
    expect(onOpenWiki).toHaveBeenLastCalledWith('wiki/refund');
    expect(fileReads).toBe(0);
  });

  it('shows the best three leads, and Show more appends the rest and focuses the first of them', async () => {
    const facts = Array.from({ length: 8 }, (_, index) => `- Refund approval rule ${index + 1} restores stock. [[src:${path}#l2]]`).join('\n');
    sourceText = `# Refund handling\n${Array.from({ length: 5 }, (_, index) => `Refund approval note ${index + 1}.`).join('\n')}\n`;
    const rules = page('wiki/rules', `---\ntitle: Refund rules\nsource_hash:\n  ${path}: ${currentHash}\n---\n## Facts\n${facts}`);
    render(<Desk includeWiki={false} extraPages={[rules]} />);
    await search();
    expect(screen.getAllByTestId('question-desk-lead')).toHaveLength(3);
    // Eight rules and three notes. Note 1 stands at line 2, where the rules cite, but says another
    // sentence, so it keeps its own row. The file holds six matches with its heading and gives three,
    // so the compact line names the three omitted.
    expect(screen.getByTestId('question-desk-results-head')).toHaveTextContent('11 passages found');
    openCoverage();
    expect(await screen.findByTestId('question-desk-coverage-info-popover')).toHaveTextContent('Wiki 1/1 · Sources 1/1 · 3 leads omitted');
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByTestId('question-desk-show-more'));
    const leads = screen.getAllByTestId('question-desk-lead');
    expect(leads).toHaveLength(11);
    expect(screen.queryByTestId('question-desk-show-more')).not.toBeInTheDocument();
    await waitFor(() => expect(document.activeElement).toBe(leads[3]!.querySelector('[data-lead-open]')));
  });

  it('offers no plus, minus or chevron disclosure, and the scope glyph closes on Escape with focus back on it', async () => {
    render(<Desk />);
    await search();
    const desk = screen.getByTestId('library-question-desk');
    expect(desk.querySelector('details, [class*="lucide-chevron"], [class*="lucide-plus"], [class*="lucide-minus"]')).toBeNull();
    expect(screen.getByTestId('question-desk-coverage-info')).toHaveAccessibleName('Search coverage and limits');
    const glyph = openCoverage();
    const popover = await screen.findByTestId('question-desk-coverage-info-popover');
    expect(popover).toHaveTextContent('Wiki 1/1 · Sources 1/1');
    // Every limit is zero, so the popover names none of them; the search method still stands.
    expect(popover).not.toHaveTextContent(/leads omitted|Unreadable|Changed during|Skipped by/u);
    expect(popover).toHaveTextContent('Search matches words and uses the last listed file versions');
    expect(screen.getAllByText(/Source freshness does not establish/)).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(glyph).toHaveAttribute('aria-expanded', 'false');
    await waitFor(() => expect(document.activeElement).toBe(glyph));
  });

  it('lists in the scope popover only the limits that hold something', async () => {
    render(<Desk listedMtime={9} />);
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Does refund approval restore stock?' } });
    fireEvent.click(screen.getByTestId('question-desk-search'));
    await screen.findByTestId('question-desk-results');
    openCoverage();
    const popover = await screen.findByTestId('question-desk-coverage-info-popover');
    expect(popover).toHaveTextContent('Changed during search: 1');
    expect(popover).not.toHaveTextContent(/Unreadable|Skipped by/u);
  });

  it('keeps a report on screen while the question is edited, and lets it go when new rows arrive', async () => {
    const onSummarize = vi.fn<(request: QuestionDeskReportRequest) => void>();
    const onInvalidateReport = vi.fn();
    const rendered = render(<Desk onSummarize={onSummarize} onInvalidateReport={onInvalidateReport} />);
    await search();
    fireEvent.click(screen.getByTestId('question-desk-summarize'));
    const request = onSummarize.mock.calls[0]![0];
    const report: QuestionDeskReportDraft = {
      question: request.question, searchId: request.searchId, listingVersion: request.listingVersion, vaultScope: request.vaultScope,
      text: 'A draft.', coverage: request.coverage, limits: request.limits, generatedAt: '2026-09-27T17:00:00Z',
    };
    rendered.rerender(<Desk report={report} onSummarize={onSummarize} onInvalidateReport={onInvalidateReport} />);
    onInvalidateReport.mockClear();
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'When does the stock job run?' } });
    expect(onInvalidateReport).not.toHaveBeenCalled();
    expect(screen.getByTestId('question-desk-report')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('question-desk-search'));
    await waitFor(() => expect(onInvalidateReport).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId('question-desk-report')).not.toBeInTheDocument();
  });

  it('reaches the field, Find evidence, the scope glyph, the report action, then each row and its Jev press in that order', async () => {
    render(<Desk />);
    await search();
    const desk = screen.getByTestId('library-question-desk');
    const order = Array.from(desk.querySelectorAll<HTMLElement>('input, button:not([disabled])'));
    const firstRow = screen.getAllByTestId('question-desk-lead')[0]!;
    const sequence = [
      screen.getByTestId('question-desk-input'), screen.getByTestId('question-desk-search'),
      screen.getByTestId('question-desk-coverage-info'), screen.getByTestId('question-desk-summarize'),
      firstRow.querySelector<HTMLElement>('[data-lead-open]')!, within(firstRow).getByText('Check claim with Jev'),
    ].map((element) => order.indexOf(element));
    expect(sequence.every((index) => index >= 0)).toBe(true);
    expect([...sequence].sort((a, b) => a - b)).toEqual(sequence);
    expect(order.every((element) => element.tabIndex >= 0)).toBe(true);
  });
});
