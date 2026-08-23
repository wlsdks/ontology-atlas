import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import { DocsVaultUnifiedPalette } from './DocsVaultUnifiedPalette';
import type { VaultDoc } from '@/entities/docs-vault';

// next-intl's navigation wrapper cannot resolve next/navigation under vitest, so
// Link is mocked as a plain <a>, as in the other widget tests.
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

// jsdom does not implement scrollIntoView — stubbed so the active-option scroll
// effect does not throw.
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

function renderPalette(initialQuery = '') {
  const docs = [doc('alpha', 'Alpha Doc'), doc('beta', 'Beta Doc')];
  return render(
    <DocsVaultUnifiedPalette
      onClose={() => {}}
      docs={docs}
      // So the 'Recent' section produces 2 options in empty-query mode — securing listbox options.
      recentSlugs={['alpha', 'beta']}
      pinnedSlugs={[]}
      commands={[]}
      tagCounts={[]}
      onDocSelect={() => {}}
      onTagSelect={() => {}}
      initialQuery={initialQuery}
    />,
  );
}

/**
 * Unified palette a11y — the WAI-ARIA combobox pattern. For a screen reader to
 * follow arrow-key movement, the input has to point at the active option's id
 * through aria-activedescendant (previously only aria-selected was present, so AT
 * could not read the movement).
 */
describe('DocsVaultUnifiedPalette — combobox a11y', () => {
  it('입력이 combobox 역할 + listbox 를 aria-controls 로 연결', () => {
    renderPalette();
    const input = screen.getByRole('combobox');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    const controls = input.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    expect(document.getElementById(controls!)).toHaveAttribute('role', 'listbox');
  });

  it('aria-activedescendant 가 활성 option 을 가리키고, 방향키로 갱신', () => {
    renderPalette();
    const input = screen.getByRole('combobox');

    const first = input.getAttribute('aria-activedescendant');
    expect(first).toBeTruthy();
    // The element with that id really is role=option and is selected.
    const firstOption = document.getElementById(first!);
    expect(firstOption).toHaveAttribute('role', 'option');
    expect(firstOption).toHaveAttribute('aria-selected', 'true');

    // ArrowDown → activedescendant moves to the next option.
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const second = input.getAttribute('aria-activedescendant');
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);
    expect(document.getElementById(second!)).toHaveAttribute('aria-selected', 'true');
  });

  it('결과가 없으면 aria-activedescendant 를 비운다', () => {
    renderPalette('zzz-definitely-no-match-query');
    const input = screen.getByRole('combobox');
    expect(input).not.toHaveAttribute('aria-activedescendant');
  });

  // aria-activedescendant alone does not convey "how many results" to AT → announce
  // the count through a polite live region (standard combobox practice).
  it('검색어가 있으면 결과 수를 live-region 으로 알린다', () => {
    renderPalette('alpha');
    expect(screen.getByRole('status')).toHaveTextContent(/결과 1개/);
  });

  it('검색어가 있고 결과 0건이면 무결과를 live-region 으로 알린다', () => {
    renderPalette('zzz-definitely-no-match-query');
    expect(screen.getByRole('status')).toHaveTextContent('일치하는 항목이 없어요');
  });

  it('빈 검색어(기본 뷰)에서는 announce 하지 않아 첫 오픈 소음 방지', () => {
    renderPalette('');
    expect(screen.getByRole('status').textContent).toBe('');
  });
});
