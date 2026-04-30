import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OperationsNav } from './OperationsNav';

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useSearchParams: () => ({
    get: () => mockAccount,
  }),
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
}));

vi.mock('@/features/user-auth', () => ({
  signOut: vi.fn(),
}));

let mockPathname = '/';
let mockAccount: string | null = null;

describe('OperationsNav — A2-6 모바일 + 데스크톱 nav', () => {
  it('모바일·데스크톱 양쪽에 모든 항목 (5) 렌더 — chip row + 데스크톱 탭', () => {
    mockPathname = '/ontology/';
    mockAccount = null;
    render(<OperationsNav />);

    // 5 개 라벨이 양쪽에 각각 1 회 = 총 10 occurrences. audit A6 후 plain
    // link 시맨틱 (이전 role='tab' 제거).
    expect(screen.getAllByRole('link', { name: '문서' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: '문서 확인' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: '온톨로지' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: '정리' })).toHaveLength(2);
    expect(screen.getAllByRole('link', { name: '챙길 곳' })).toHaveLength(2);
  });

  it('모바일 chip row 는 md:hidden + 모바일 별도 라벨', () => {
    mockPathname = '/ontology/';
    mockAccount = null;
    const { container } = render(<OperationsNav />);
    const mobileList = container.querySelector(
      'ul[aria-label="운영 메뉴 (모바일)"]',
    );
    expect(mobileList).not.toBeNull();
    // 돌아가기 link + ul 을 묶는 wrapping div 가 md:hidden 과 overflow-x-auto
    // 를 가진다 — 모바일 chip row 는 그 자식 ul.
    const mobileRow = mobileList?.closest('div.md\\:hidden');
    expect(mobileRow).not.toBeNull();
    expect(mobileRow?.className).toContain('overflow-x-auto');
  });

  it('데스크톱 nav 는 우측 보조 버튼 (프로젝트 / 로그아웃) 포함', () => {
    mockPathname = '/knowledge/';
    mockAccount = null;
    const { container } = render(<OperationsNav />);
    // 데스크톱 컨테이너 (md:flex hidden)
    const desktopRow = container.querySelector('div.hidden.items-center');
    expect(desktopRow).not.toBeNull();
    expect(desktopRow?.textContent).toContain('프로젝트');
    expect(desktopRow?.textContent).toContain('로그아웃');
  });

  it('모바일 chip row 에는 우측 보조 (프로젝트 / 로그아웃) 없음 — BottomTabBar 가 대체', () => {
    mockPathname = '/knowledge/';
    mockAccount = null;
    const { container } = render(<OperationsNav />);
    const mobileList = container.querySelector(
      'ul[aria-label="운영 메뉴 (모바일)"]',
    );
    expect(mobileList?.textContent).not.toContain('로그아웃');
  });

  it('현재 pathname prefix 일치 항목만 active — /ontology 진입 시 온톨로지', () => {
    mockPathname = '/ontology/insights/';
    mockAccount = null;
    render(<OperationsNav />);
    // 양쪽 (모바일+데스크톱) 모두 active. aria-current='page' + data-active.
    const ontologyTabs = screen.getAllByRole('link', { name: '온톨로지' });
    for (const tab of ontologyTabs) {
      expect(tab.getAttribute('aria-current')).toBe('page');
      expect(tab.getAttribute('data-active')).toBe('true');
    }
    const knowledgeTabs = screen.getAllByRole('link', { name: '문서' });
    for (const tab of knowledgeTabs) {
      expect(tab.getAttribute('aria-current')).toBeNull();
      expect(tab.getAttribute('data-active')).toBe('false');
    }
  });

  it('accountId prop 명시 시 href 에 ?account=… 붙음', () => {
    mockPathname = '/';
    render(<OperationsNav accountId="aslan" />);
    const tabs = screen.getAllByRole('link', { name: '온톨로지' });
    for (const tab of tabs) {
      expect(tab.getAttribute('href')).toContain('account=aslan');
    }
  });

  it('rightSlot 은 모바일 chip row 가 아닌 데스크톱 nav 에만 렌더', () => {
    mockPathname = '/';
    mockAccount = null;
    render(
      <OperationsNav rightSlot={<button type="button">slot-x</button>} />,
    );
    const slotBtn = screen.getByRole('button', { name: 'slot-x' });
    // slotBtn 의 부모 chain 에 mobile ul 가 없고 desktop div 가 있어야 함
    let cur: HTMLElement | null = slotBtn;
    let inMobile = false;
    while (cur) {
      if (cur.getAttribute?.('aria-label') === '운영 메뉴 (모바일)') {
        inMobile = true;
        break;
      }
      cur = cur.parentElement;
    }
    expect(inMobile).toBe(false);
  });
});
