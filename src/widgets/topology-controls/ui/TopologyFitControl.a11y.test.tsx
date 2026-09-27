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
 * TopologyFitControl — the only tile left after the demolition (Fit). Even with the
 * dead control panel removed, this guards regressions in (1) the Fit button's
 * accessible name and click callback, (2) the right rail's position token contract,
 * and (3) the keyboard focus ring (WCAG 2.4.7).
 */
describe('TopologyFitControl fit tile', () => {
  it('gives the fit button an accessible name and calls onFitView on click', () => {
    const onFitView = vi.fn();
    render(<TopologyFitControl onFitView={onFitView} />);

    const fitButton = screen.getByRole('button', { name: '지도 전체 맞추기' });
    fireEvent.click(fitButton);
    expect(onFitView).toHaveBeenCalledTimes(1);
  });

  it('gives the fit button a keyboard focus ring', () => {
    render(<TopologyFitControl onFitView={() => {}} />);
    const fitButton = screen.getByRole('button', { name: '지도 전체 맞추기' });
    expect(fitButton.className).toMatch(/focus-visible:ring-2/);
    expect(fitButton.className).toContain('focus-visible:outline-none');
  });

  it('keeps the right-rail desktop-top position token', () => {
    const { container } = render(<TopologyFitControl onFitView={() => {}} />);
    const rail = container.querySelector('[data-testid="topology-fit-control"]');

    expect(rail?.className).toContain(
      'md:top-[var(--topology-floating-control-desktop-top)]',
    );
    expect(rail).toHaveAttribute(
      'data-control-desktop-top-token',
      '--topology-floating-control-desktop-top',
    );
  });
});
