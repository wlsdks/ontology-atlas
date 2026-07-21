import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render as rtlRender, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import koMessages from '../../../../messages/ko.json';
import { TooltipProvider } from '@/shared/ui';
import { TopologyFitControl } from './TopologyFitControl';

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <TooltipProvider>{ui}</TooltipProvider>
    </NextIntlClientProvider>,
  );
}

/**
 * TopologyFitControl — 철거 후 남은 유일한 타일(Fit). 죽은 조절 패널을
 * 걷어낸 뒤에도 (1) Fit 버튼 접근명/클릭 콜백 (2) 우측 레일 위치 토큰 계약
 * (3) 키보드 focus 링(WCAG 2.4.7) 회귀를 막는다.
 */
describe('TopologyFitControl — Fit 타일', () => {
  it('Fit 버튼이 접근명을 가지고 클릭 시 onFitView 를 호출한다', () => {
    const onFitView = vi.fn();
    render(<TopologyFitControl onFitView={onFitView} />);

    const fitButton = screen.getByRole('button', { name: '지도 전체 맞추기' });
    fireEvent.click(fitButton);
    expect(onFitView).toHaveBeenCalledTimes(1);
  });

  it('Fit 버튼이 keyboard focus 링(WCAG 2.4.7)을 가진다', () => {
    render(<TopologyFitControl onFitView={() => {}} />);
    const fitButton = screen.getByRole('button', { name: '지도 전체 맞추기' });
    expect(fitButton.className).toMatch(/focus-visible:ring-2/);
    expect(fitButton.className).toContain('focus-visible:outline-none');
  });

  it('우측 레일 위치 토큰 계약(phone-bottom / desktop-top)을 유지한다', () => {
    const { container } = render(<TopologyFitControl onFitView={() => {}} />);
    const rail = container.querySelector('[data-testid="topology-fit-control"]');

    expect(rail?.className).toContain(
      'bottom-[var(--topology-floating-control-phone-bottom)]',
    );
    expect(rail?.className).toContain(
      'md:top-[var(--topology-floating-control-desktop-top)]',
    );
    expect(rail).toHaveAttribute(
      'data-control-phone-bottom-token',
      '--topology-floating-control-phone-bottom',
    );
    expect(rail).toHaveAttribute(
      'data-control-desktop-top-token',
      '--topology-floating-control-desktop-top',
    );
  });
});
