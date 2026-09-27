import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import { DocsVaultUnifiedPalette } from './DocsVaultUnifiedPalette';
import { buildBodyEntry, type DocsBodyIndex } from '../lib/body-index';
import type { VaultDoc } from '@/entities/docs-vault';

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
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function doc(slug: string, title: string): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title,
    tags: [],
    frontmatter: {},
    headings: [],
    excerpt: '',
    wordCount: 0,
    updatedAt: '2026-01-01T00:00:00.000Z',
    linksOut: [],
  };
}

function renderPalette({
  initialQuery = '',
  bodyIndex,
  bodyIndexing = false,
  onDocSelect = () => {},
}: {
  initialQuery?: string;
  bodyIndex?: DocsBodyIndex;
  bodyIndexing?: boolean;
  onDocSelect?: (slug: string, query?: string) => void;
} = {}) {
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
      bodyIndex={bodyIndex}
      bodyIndexing={bodyIndexing}
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

  // Landing defect (P1 review) — the keyboard (Enter) path has to pass the query just
  // like the mouse. The `row.onRun` reference is shared, but a separate assertion pins
  // it against a measured regression.
  it('passes the query to onDocSelect when a body hit is chosen with Enter', () => {
    const onDocSelect = vi.fn();
    renderPalette({ initialQuery: 'deterministic', bodyIndex, onDocSelect });
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onDocSelect).toHaveBeenCalledWith('beta', 'deterministic');
  });

  it('says the body was searched too when zero results come without a bodyIndex', () => {
    renderPalette({ initialQuery: 'zzz-no-match' });
    expect(screen.getByText('문서 어디에서도 못 찾았어요')).toBeInTheDocument();
  });

  it('adds an indexing notice when zero results come while indexing', () => {
    // Look the notice up by its message key, not by a fragment of its wording — the
    // contract is "the notice appears", not "the notice reads like this".
    renderPalette({ initialQuery: 'zzz-no-match', bodyIndexing: true });
    expect(
      screen.getByText(koMessages.vaultWidgets.palette.bodyIndexingNotice),
    ).toBeInTheDocument();
  });

  it('does not repeat a snippet on title-match rows', () => {
    const idx: DocsBodyIndex = new Map([
      ['alpha', buildBodyEntry('alpha appears in body too', 'alpha@1')],
    ]);
    renderPalette({ initialQuery: 'alpha', bodyIndex: idx });
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
