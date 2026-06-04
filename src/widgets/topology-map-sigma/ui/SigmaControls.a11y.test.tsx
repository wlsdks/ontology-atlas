import { describe, expect, it } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import { TooltipProvider } from '@/shared/ui';
import { SigmaControls } from './SigmaControls';
import { DEFAULT_SIGMA_CONTROLS } from '../model/controls-state';

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TooltipProvider>{ui}</TooltipProvider>
    </NextIntlClientProvider>,
  );
}

/**
 * SigmaControls 슬라이더 a11y — range 입력은 보이는 라벨 span 과 미연결이라
 * 스크린리더가 이름 없이("slider") 읽었다. aria-label 로 접근명을 부여한다.
 */
describe('SigmaControls — range slider 접근명', () => {
  it('depth / forces 슬라이더가 aria-label 로 접근명을 가진다', () => {
    render(
      <SigmaControls value={DEFAULT_SIGMA_CONTROLS} onChange={() => {}} />,
    );

    // 패널 펼치기 → 고급 설정 열기 → depth 슬라이더 노출.
    fireEvent.click(screen.getByRole('button', { name: '지도 조절 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /고급 설정/ }));
    expect(screen.getByRole('slider', { name: '연결 범위' })).toBeInTheDocument();

    // 배치 조절 섹션 열기 → 노드 간격 슬라이더 접근명 확인.
    fireEvent.click(screen.getByRole('button', { name: /배치 조절/ }));
    expect(screen.getByRole('slider', { name: '노드 간격' })).toBeInTheDocument();
  });

  it('검색 입력 컨테이너가 키보드 focus 표시(focus-within)를 가진다 (WCAG 2.4.7)', () => {
    render(<SigmaControls value={DEFAULT_SIGMA_CONTROLS} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '지도 조절 열기' }));
    const search = screen.getByRole('searchbox');
    // input 의 outline-none 을 컨테이너 focus-within 보더가 대체.
    expect(search.parentElement?.className).toContain('focus-within:border');
  });
});

function expectAllButtonsHaveFocusRing(container: HTMLElement) {
  const buttons = Array.from(container.querySelectorAll('button'));
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) {
    expect(
      button.className,
      `버튼(${button.getAttribute('aria-label') ?? button.textContent?.trim() ?? ''})에 focus 링 필요`,
    ).toMatch(/focus-visible:ring-2/);
    expect(button.className).toContain('focus-visible:outline-none');
  }
}

/**
 * 컨트롤 버튼 키보드 focus 가시성 회귀 가드 (WCAG 2.4.7). 줌/필터/레이아웃
 * 버튼이 hover 스타일만 있고 focus-visible 링이 0 이라, 전역 focus 규칙이
 * 없는 상태에서 키보드 사용자가 현재 컨트롤을 못 봤다. 접힘/펼침/고급/도움말
 * 각 단계의 모든 버튼이 링을 갖는지 단언.
 */
describe('SigmaControls — 키보드 focus 가시성 (a11y, WCAG 2.4.7)', () => {
  it('접힘 상태 버튼이 모두 focus 링을 가진다', () => {
    const { container } = render(
      <SigmaControls value={DEFAULT_SIGMA_CONTROLS} onChange={() => {}} onFitView={() => {}} />,
    );
    expectAllButtonsHaveFocusRing(container);
  });

  it('모바일 접힘 토글은 분석 모드 탭을 가리지 않도록 하단에 고정된다', () => {
    render(
      <SigmaControls value={DEFAULT_SIGMA_CONTROLS} onChange={() => {}} onFitView={() => {}} />,
    );

    const controlsButton = screen.getByRole('button', { name: '지도 조절 열기' });
    const mobileRail = controlsButton.parentElement;

    expect(mobileRail?.className).toContain('bottom-[7rem]');
    expect(mobileRail?.className).toContain('md:top-[140px]');
  });

  it('펼침 + 고급 설정 + 단축키 도움말 단계의 모든 버튼이 focus 링을 가진다', () => {
    const { container } = render(
      <SigmaControls
        value={DEFAULT_SIGMA_CONTROLS}
        onChange={() => {}}
        onFitView={() => {}}
        visibleCount={5}
        totalCount={10}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '지도 조절 열기' }));
    expectAllButtonsHaveFocusRing(container);
    fireEvent.click(screen.getByRole('button', { name: /고급 설정/ }));
    expectAllButtonsHaveFocusRing(container);
    fireEvent.click(screen.getByRole('button', { name: '단축키 도움말' }));
    expectAllButtonsHaveFocusRing(container);
  });

  it('고급 설정과 단축키 도움말을 동시에 열어 겹치지 않는다', () => {
    render(
      <SigmaControls
        value={DEFAULT_SIGMA_CONTROLS}
        onChange={() => {}}
        onFitView={() => {}}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '지도 조절 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /고급 설정/ }));
    expect(screen.getByRole('slider', { name: '연결 범위' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '단축키 도움말' }));

    expect(screen.getByRole('dialog', { name: '키보드 단축키 도움말' })).toBeInTheDocument();
    expect(screen.queryByRole('slider', { name: '연결 범위' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /고급 설정/ })).toHaveAttribute('aria-expanded', 'false');
  });
});
