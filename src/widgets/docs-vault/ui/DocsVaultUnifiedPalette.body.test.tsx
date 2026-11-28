import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { IntlProvider } from 'use-intl';
import koMessages from '../../../../messages/ko.json';
import { DocsVaultUnifiedPalette } from './DocsVaultUnifiedPalette';
import { buildBodyEntry, type DocsBodyIndex } from '../lib/body-index';
import type { VaultDoc } from '@/entities/docs-vault';
import type { VaultIndexStatus } from '@/shared/lib/vault-folder/vault-index/tauri-vault-index';

const textSearch = vi.hoisted(() => ({
  bodyIndex: undefined as DocsBodyIndex | undefined,
  status: null as VaultIndexStatus | null,
}));

vi.mock('../lib/use-vault-text-search', () => ({
  useVaultTextSearch: () => ({ bodyIndex: textSearch.bodyIndex, status: textSearch.status }),
}));

function indexStatus(state: VaultIndexStatus['state'], indexed = 0, total = 0): VaultIndexStatus {
  return { state, indexed, total, sizeBytes: 0, allBytes: 0, vaults: 0 };
}

vi.mock('@/i18n/navigation', () => ({
  Link: ({
    href,
    children,
    className,
    ...rest
  }: {
    href: string;
    children: ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className} {...rest}>
      {children}
    </a>
  ),
}));

if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = vi.fn();
}

function render(ui: React.ReactElement) {
  return rtlRender(
    <IntlProvider locale="ko" messages={koMessages}>
      {ui}
    </IntlProvider>,
  );
}

function doc(slug: string, title: string): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title,
    tags: [],
    frontmatter: {},
    updatedAt: '2026-01-01T00:00:00.000Z',
    linksOut: [],
  };
}

function renderPalette({
  initialQuery = '',
  bodyIndex,
  status = null,
  onDocSelect = () => {},
}: {
  initialQuery?: string;
  bodyIndex?: DocsBodyIndex;
  status?: VaultIndexStatus | null;
  onDocSelect?: (slug: string, query?: string) => void;
} = {}) {
  textSearch.bodyIndex = bodyIndex;
  textSearch.status = status;
  const docs = [doc('alpha', 'Alpha Doc'), doc('beta', 'Beta Doc')];
  return render(
    <DocsVaultUnifiedPalette
      onClose={() => {}}
      docs={docs}
      recentSlugs={[]}
      pinnedSlugs={[]}
      commands={[]}
      tagCounts={[]}
      onDocSelect={onDocSelect}
      onTagSelect={() => {}}
      initialQuery={initialQuery}
    />,
  );
}

describe('DocsVaultUnifiedPalette body search results', () => {
  const bodyIndex: DocsBodyIndex = new Map([
    [
      'beta',
      buildBodyEntry(
        'Intro paragraph.\n\nThe deterministic compile flow is described here in detail.',
        'beta@1',
      ),
    ],
  ]);

  it('shows body-only matches with a snippet', () => {
    renderPalette({ initialQuery: 'deterministic', bodyIndex });
    // The result row itself (the title has no match).
    expect(screen.getByText('Beta Doc')).toBeInTheDocument();
    // Snippet: the match is highlighted with <mark>.
    const marks = document.querySelectorAll('mark');
    const markTexts = Array.from(marks).map((m) => m.textContent);
    expect(markTexts).toContain('deterministic');
    // Snippet context is shown.
    expect(
      screen.getByText(/compile flow is described/),
    ).toBeInTheDocument();
  });

  it('passes the query to onDocSelect when a body hit is clicked', () => {
    const onDocSelect = vi.fn();
    renderPalette({ initialQuery: 'deterministic', bodyIndex, onDocSelect });
    screen.getByText('Beta Doc').closest('a')!.click();
    expect(onDocSelect).toHaveBeenCalledWith('beta', 'deterministic');
  });

  // The Enter path must pass the query like the mouse path.
  it('passes the query to onDocSelect when a body hit is chosen with Enter', () => {
    const onDocSelect = vi.fn();
    renderPalette({ initialQuery: 'deterministic', bodyIndex, onDocSelect });
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onDocSelect).toHaveBeenCalledWith('beta', 'deterministic');
  });

  it('says every document was searched only when the index is ready', () => {
    const palette = koMessages.vaultWidgets.palette;
    const { unmount } = renderPalette({ initialQuery: 'zzz-no-match', status: indexStatus('ready', 2, 2) });
    expect(screen.getByText(palette.noBodySearchHint)).toBeInTheDocument();
    unmount();
    renderPalette({ initialQuery: 'zzz-no-match' });
    expect(screen.getByText(palette.noTitleSearchHint)).toBeInTheDocument();
  });

  it('counts the build up in a status line and names why search covers titles only', () => {
    const lines = koMessages.vaultWidgets.palette.indexStatus;
    const { unmount } = renderPalette({ initialQuery: 'alpha', status: indexStatus('building', 12_400, 50_000) });
    const line = screen.getByTestId('docs-palette-index-status');
    expect(line).toHaveAttribute('data-state', 'building');
    expect(line.textContent).toMatch(/12,400/);
    expect(line.textContent).toMatch(/50,000/);
    unmount();
    renderPalette({ initialQuery: 'alpha', status: indexStatus('off') });
    expect(screen.getByText(lines.off)).toBeInTheDocument();
  });

  it('says when the index covers only part of the folder, and when the folder could not be read', () => {
    const palette = koMessages.vaultWidgets.palette;
    const { unmount } = renderPalette({ initialQuery: 'zzz-no-match', status: indexStatus('partial', 100_000, 100_000) });
    const line = screen.getByTestId('docs-palette-index-status');
    expect(line).toHaveAttribute('data-state', 'partial');
    expect(line.textContent).toMatch(/100,000/);
    expect(screen.getByText(palette.noPartialSearchHint)).toBeInTheDocument();
    expect(screen.queryByText(palette.noBodySearchHint)).not.toBeInTheDocument();
    unmount();
    renderPalette({ initialQuery: 'zzz-no-match', status: indexStatus('unreadable') });
    expect(screen.getByText(palette.indexStatus.unreadable)).toBeInTheDocument();
    expect(screen.getByText(palette.noTitleSearchHint)).toBeInTheDocument();
  });

  it('shows no status line once the index is ready, or on the web', () => {
    const { unmount } = renderPalette({ initialQuery: 'alpha', status: indexStatus('ready', 2, 2) });
    expect(screen.queryByTestId('docs-palette-index-status')).not.toBeInTheDocument();
    unmount();
    renderPalette({ initialQuery: 'alpha' });
    expect(screen.queryByTestId('docs-palette-index-status')).not.toBeInTheDocument();
  });

  it('does not repeat a snippet on title-match rows', () => {
    const index: DocsBodyIndex = new Map([
      ['alpha', buildBodyEntry('alpha appears in body too', 'alpha@1')],
    ]);
    renderPalette({ initialQuery: 'alpha', bodyIndex: index });
    expect(screen.queryByText(/appears in body too/)).not.toBeInTheDocument();
  });
});

describe('DocsVaultUnifiedPalette — command keywords', () => {
  function renderWithCommands(initialQuery: string, onRun: () => void) {
    return render(
      <DocsVaultUnifiedPalette
        onClose={() => {}}
        docs={[doc('alpha', 'Alpha Doc')]}
        recentSlugs={[]}
        pinnedSlugs={[]}
        commands={[
          { id: 'rename', label: 'Rename this doc', keywords: 'change name move', icon: '✎', onRun },
          { id: 'print', label: 'Print', icon: '⎙', onRun: () => {} },
        ]}
        tagCounts={[]}
        onDocSelect={() => {}}
        onTagSelect={() => {}}
        initialQuery={initialQuery}
      />,
    );
  }

  it('finds a command by a keyword its label does not contain, in mixed mode', () => {
    const onRun = vi.fn();
    renderWithCommands('change name', onRun);
    expect(screen.getByText('Rename this doc')).toBeInTheDocument();
    expect(screen.queryByText('Print')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('combobox'), { key: 'Enter' });
    expect(onRun).toHaveBeenCalledTimes(1);
  });

  it('finds it by keyword in command mode too', () => {
    renderWithCommands('>move', () => {});
    expect(screen.getByText('Rename this doc')).toBeInTheDocument();
    expect(screen.queryByText('Print')).not.toBeInTheDocument();
  });

  it('keeps matching on the label', () => {
    renderWithCommands('>print', () => {});
    expect(screen.getByText('Print')).toBeInTheDocument();
    expect(screen.queryByText('Rename this doc')).not.toBeInTheDocument();
  });
});
