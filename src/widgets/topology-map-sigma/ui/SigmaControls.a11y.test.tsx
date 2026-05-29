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
    fireEvent.click(screen.getByRole('button', { name: '그래프 컨트롤 열기' }));
    fireEvent.click(screen.getByRole('button', { name: /고급 설정/ }));
    expect(screen.getByRole('slider', { name: 'Depth' })).toBeInTheDocument();

    // Forces 섹션 열기 → repel 슬라이더 접근명 확인.
    fireEvent.click(screen.getByRole('button', { name: /Forces/ }));
    expect(screen.getByRole('slider', { name: 'Repel' })).toBeInTheDocument();
  });

  it('검색 입력 컨테이너가 키보드 focus 표시(focus-within)를 가진다 (WCAG 2.4.7)', () => {
    render(<SigmaControls value={DEFAULT_SIGMA_CONTROLS} onChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: '그래프 컨트롤 열기' }));
    const search = screen.getByRole('searchbox');
    // input 의 outline-none 을 컨테이너 focus-within 보더가 대체.
    expect(search.parentElement?.className).toContain('focus-within:border');
  });
});
