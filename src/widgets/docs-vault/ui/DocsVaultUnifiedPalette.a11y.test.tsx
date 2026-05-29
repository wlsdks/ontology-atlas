import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import { DocsVaultUnifiedPalette } from './DocsVaultUnifiedPalette';
import type { VaultDoc } from '@/entities/docs-vault';

// next-intl 의 navigation 래퍼는 vitest 환경에서 next/navigation 해석을 못 해
// 다른 위젯 테스트들과 동일하게 Link 를 평범한 <a> 로 mock.
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

// jsdom 은 scrollIntoView 를 구현하지 않는다 — 활성 옵션 스크롤 효과가 throw
// 하지 않도록 stub.
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
      // 빈 쿼리 모드에서 '최근' 섹션이 2개 옵션을 만들도록 — listbox 옵션 확보.
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
 * 통합 팔레트 a11y — WAI-ARIA combobox 패턴. 방향키로 활성 옵션이 바뀔 때
 * 스크린리더가 읽을 수 있도록 입력이 aria-activedescendant 로 활성 option 의
 * id 를 가리켜야 한다 (기존엔 aria-selected 만 있어 AT 가 이동을 못 읽었다).
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
    // 가리키는 id 의 실제 요소가 role=option 이고 선택 상태.
    const firstOption = document.getElementById(first!);
    expect(firstOption).toHaveAttribute('role', 'option');
    expect(firstOption).toHaveAttribute('aria-selected', 'true');

    // 방향키 ↓ → activedescendant 가 다음 option 으로 이동.
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

  // aria-activedescendant 만으로는 "몇 건 나왔는지" 가 AT 에 전달 안 됨 →
  // polite live-region 으로 결과 수를 announce (combobox 표준 관행).
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
