import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Profiler, type ComponentProps } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import en from '../../../../../../messages/en.json';
import type { LibrarySourceRow, VaultDoc } from '@/entities/docs-vault';
import { parseFrontmatter } from '@/shared/lib/vault-document/parse-frontmatter';
import { OFF_VECTOR_STATUS, type VectorStatus, type VectorStatusEvent } from '@/shared/lib/vault-folder/tauri-vault-vectors';
import { vaultVectorSource } from '@/shared/lib/vault-folder/vault-vector-source';

const counts = vi.hoisted(() => ({
  desk: 0,
  line: 0,
  emit: null as ((event: VectorStatusEvent) => void) | null,
}));

vi.mock('@/shared/lib/vault-folder/tauri-vault-fs', async (original) => ({
  ...(await original<typeof import('@/shared/lib/vault-folder/tauri-vault-fs')>()),
  isTauriVaultRuntime: () => true,
}));
vi.mock('@/shared/lib/vault-folder/tauri-vault-vectors', async (original) => {
  const actual = await original<typeof import('@/shared/lib/vault-folder/tauri-vault-vectors')>();
  return {
    ...actual,
    vectorStatus: async () => ({ ...actual.OFF_VECTOR_STATUS, phase: 'preparing', filesTotal: 400, passagesTotal: 4000 }),
    subscribeVectorStatus: (listener: (event: VectorStatusEvent) => void) => {
      counts.emit = listener;
      return () => undefined;
    },
    warmVectors: async () => undefined,
  };
});
vi.mock('@/shared/lib/llm-connection/tauri-jev', async (original) => ({
  ...(await original<typeof import('@/shared/lib/llm-connection/tauri-jev')>()),
  jevSecretStatus: async () => ({ stored: false, last4: null }),
}));
/* The desk calls `useVectorSearch` once per render; the line is counted by its own profiler. */
vi.mock('@/features/vault-vectors', async (original) => {
  const actual = await original<typeof import('@/features/vault-vectors')>();
  return {
    ...actual,
    useVectorSearch: (...args: Parameters<typeof actual.useVectorSearch>) => {
      counts.desk += 1;
      return actual.useVectorSearch(...args);
    },
    MeaningDeskLine: (props: ComponentProps<typeof actual.MeaningDeskLine>) => (
      <Profiler id="line" onRender={() => { counts.line += 1; }}>
        <actual.MeaningDeskLine {...props} />
      </Profiler>
    ),
  };
});

import { libraryPageFacts } from '@/features/library/model/library-page-facts';
import { LibraryQuestionDesk } from './LibraryQuestionDesk';

const ROOT = '/fixture';
const raw = '---\ntitle: Refund overview\n---\n## Facts\n- Refunds restore stock.\n';
const doc: VaultDoc = {
  slug: 'wiki/refund', path: 'wiki/refund.md', title: 'Refund overview', frontmatter: parseFrontmatter(raw).frontmatter,
  tags: [], updatedAt: '', linksOut: [],
};
const source: LibrarySourceRow = { path: 'sources/refund.md', name: 'refund.md', format: 'md', bytes: 10, mtime: 1, state: 'compiled', citedBy: [] };
const docs = [doc];
const pageFacts = new Map([[doc.slug, libraryPageFacts(raw)]]);
const sources = [source];
const empty = new Map();
const noop = () => {};

const EVENTS_PER_SECOND = 4;
const SECONDS = 60;

beforeEach(() => {
  vi.useFakeTimers();
  vaultVectorSource.write(ROOT, { kind: 'builtin' });
});
afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

describe('the Wiki desk while search by meaning prepares', () => {
  it('is not drawn again by status events; only the line is', async () => {
    render(
      <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
        <LibraryQuestionDesk docs={docs} pageFacts={pageFacts} sources={sources} sourceHandles={empty} hashes={empty}
          vaultRoot={ROOT} vaultScope="folder" agentReady dockOpen={false} visible turnRunning={false} report={null}
          onSummarize={noop} onInvalidateReport={noop} onFileReport={null} filingReport={false} fileReportNote={null}
          onBrowse={noop} onOpenWiki={noop} onOpenSource={noop} />
      </NextIntlClientProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });
    expect(counts.emit).not.toBeNull();
    const deskBefore = counts.desk;
    const lineBefore = counts.line;

    for (let event = 1; event <= EVENTS_PER_SECOND * SECONDS; event += 1) {
      const status: VectorStatus = {
        ...OFF_VECTOR_STATUS, phase: 'preparing', filesTotal: 400, filesDone: Math.floor(event / 2),
        passagesTotal: 4000, passagesDone: event * 10, currentPath: `sources/file-${event}.md`, passagesPerSecond: 40,
      };
      await act(async () => {
        counts.emit!({ rootPath: ROOT, status });
        await vi.advanceTimersByTimeAsync(1000 / EVENTS_PER_SECOND);
      });
    }

    const desk = counts.desk - deskBefore;
    const line = counts.line - lineBefore;
    console.info(`desk renders: ${desk}, line commits: ${line} over ${SECONDS} s at ${EVENTS_PER_SECOND} events a second`);
    expect(screen.getByTestId('meaning-desk-ring')).toBeInTheDocument();
    expect(desk).toBe(0);
    expect(line).toBeGreaterThan(0);
  });
});
