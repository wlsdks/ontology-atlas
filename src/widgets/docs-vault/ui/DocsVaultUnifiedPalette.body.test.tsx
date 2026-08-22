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

describe('DocsVaultUnifiedPalette — 본문 검색 결과', () => {
  const bodyIndex: DocsBodyIndex = new Map([
    [
      'beta',
      buildBodyEntry(
        'Intro paragraph.\n\nThe deterministic compile flow is described here in detail.',
        'beta@1',
      ),
    ],
  ]);

  it('본문에만 매치되는 문서가 스니펫과 함께 표시된다', () => {
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

  it('본문 히트 행 선택 시 onDocSelect 에 쿼리가 전달된다 (뷰어 착지 — 마우스)', () => {
    const onDocSelect = vi.fn();
    renderPalette({ initialQuery: 'deterministic', bodyIndex, onDocSelect });
    screen.getByText('Beta Doc').closest('a')!.click();
    expect(onDocSelect).toHaveBeenCalledWith('beta', 'deterministic');
  });

  // Landing defect (P1 review) — the keyboard (Enter) path has to pass the query just
  // like the mouse. The `row.onRun` reference is shared, but a separate assertion pins
  // it against a measured regression.
  it('본문 히트 행 선택 시 onDocSelect 에 쿼리가 전달된다 (뷰어 착지 — 키보드 Enter)', () => {
    const onDocSelect = vi.fn();
    renderPalette({ initialQuery: 'deterministic', bodyIndex, onDocSelect });
    const input = screen.getByRole('combobox');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onDocSelect).toHaveBeenCalledWith('beta', 'deterministic');
  });

  it('bodyIndex 없이 0건이면 본문까지-검색했다는 새 안내 문구', () => {
    renderPalette({ initialQuery: 'zzz-no-match' });
    expect(screen.getByText('문서 어디에서도 못 찾았어요')).toBeInTheDocument();
  });

  it('인덱싱 중 0건이면 본문 인덱스 준비 중 안내를 덧붙인다', () => {
    // Look the notice up by its message key, not by a fragment of its wording — the
    // contract is "the notice appears", not "the notice reads like this".
    renderPalette({ initialQuery: 'zzz-no-match', bodyIndexing: true });
    expect(
      screen.getByText(koMessages.vaultWidgets.palette.bodyIndexingNotice),
    ).toBeInTheDocument();
  });

  it('제목 매치 행에는 스니펫을 중복 표시하지 않는다', () => {
    const idx: DocsBodyIndex = new Map([
      ['alpha', buildBodyEntry('alpha appears in body too', 'alpha@1')],
    ]);
    renderPalette({ initialQuery: 'alpha', bodyIndex: idx });
    expect(screen.queryByText(/appears in body too/)).not.toBeInTheDocument();
  });
});
