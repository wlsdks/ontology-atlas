import { createHash, webcrypto } from 'node:crypto';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../messages/en.json';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import type { VaultDoc, LibrarySourceRow } from '@/entities/docs-vault';

const mocks = vi.hoisted(() => ({
  status: vi.fn(), judge: vi.fn(),
}));
vi.mock('@/shared/lib/tauri-jev', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/shared/lib/tauri-jev')>();
  return { ...actual, jevSecretStatus: mocks.status, jevJudge: mocks.judge };
});

import { LibraryQuestionDesk } from './LibraryQuestionDesk';

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

function Desk({ hash = currentHash, scope = 'folder-a', listedMtime = 10, onAsk = () => {} }: { hash?: string; scope?: string; listedMtime?: number; onAsk?: (brief: string, question: string) => void }) {
  const { doc, raw, source, handle } = fixture(hash, listedMtime);
  return <NextIntlClientProvider locale="en" messages={en}>
    <LibraryQuestionDesk docs={[doc]} pageTexts={new Map([[doc.slug, raw]])}
      sources={[source]} sourceHandles={new Map([[path, handle]])} hashes={new Map([[path, currentHash]])}
      vaultRoot="/fixture" vaultScope={scope} agentReady={true}
      onBrowse={() => {}} onAsk={onAsk} onOpenWiki={() => {}} onOpenSource={() => {}} />
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
  async function search() {
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Does refund approval restore stock?' } });
    fireEvent.click(screen.getByTestId('question-desk-search'));
    await screen.findByTestId('question-desk-results');
  }

  it('keeps question search, original anchors, and Ask usable with no Jev key', async () => {
    render(<Desk />);
    await search();
    expect(screen.getByText(/immediately restores stock/)).toBeInTheDocument();
    expect(screen.getAllByText('sources/refund.md#l2')).toHaveLength(2);
    expect(screen.getByTestId('question-desk-ask')).toBeEnabled();
    expect(screen.queryByText('Check claim with Jev')).not.toBeInTheDocument();
    expect(mocks.judge).not.toHaveBeenCalled();
  });

  it('reports an unknown answer from the searched coverage instead of inventing one', async () => {
    render(<Desk />);
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Who owns the lunar migration?' } });
    fireEvent.click(screen.getByTestId('question-desk-search'));
    expect(await screen.findByTestId('question-desk-unknown')).toHaveTextContent('The answer remains unknown');
    expect(screen.getByTestId('question-desk-results')).toHaveTextContent('Searched 1 of 1 Wiki pages and 1 of 1 original files.');
    expect(screen.getByTestId('question-desk-ask')).toBeEnabled();
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
    const onAsk = vi.fn();
    render(<Desk onAsk={onAsk} />);
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Does refund approval restore stock?' } });
    fireEvent.click(screen.getByTestId('question-desk-search'));
    await waitFor(() => expect(fileReads).toBe(1));
    fireEvent.change(screen.getByTestId('question-desk-input'), { target: { value: 'Who owns the lunar migration?' } });
    expect(screen.queryByTestId('question-desk-results')).not.toBeInTheDocument();
    expect(screen.getByTestId('question-desk-search')).toBeEnabled();
    fileGate = null;
    fireEvent.click(screen.getByTestId('question-desk-search'));
    expect(await screen.findByTestId('question-desk-unknown')).toHaveTextContent('unknown');
    await act(async () => { release(); });
    expect(screen.getByTestId('question-desk-unknown')).toBeInTheDocument();
    expect(screen.queryByText('Refund approval immediately restores stock.')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('question-desk-ask'));
    expect(onAsk).toHaveBeenCalledWith(expect.any(String), 'Who owns the lunar migration?');
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
