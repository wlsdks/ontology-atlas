import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../messages/en.json';
import { AGENT_BEATS } from '../../lib/build-play';
import { BuildWithMoru } from './BuildWithMoru';

vi.mock('@/i18n/navigation', () => ({
  Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderBuild(handheld = false) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <BuildWithMoru handheld={handheld} />
    </NextIntlClientProvider>,
  );
}

const line = () => screen.getByTestId('build-line').textContent ?? '';
const press = (id: string) => fireEvent.click(screen.getByTestId(id), { detail: 1 });
/** Opens the folder and lets the agent write the whole first map. */
const openAndBuild = () => {
  press('build-open');
  for (let beat = 0; beat <= AGENT_BEATS; beat += 1) act(() => vi.advanceTimersByTime(2000));
};
const rename = () => {
  press('build-node-login');
  press('build-name-0');
  press('build-node-coupon');
  press('build-name-0');
};
const link = () => {
  press('build-node-refund');
  press('build-node-payment');
  press('build-node-alerts');
  press('build-node-shipping');
};

afterEach(() => {
  vi.useRealTimers();
});

describe('BuildWithMoru', () => {
  it('walks a visitor from the map the agent writes through both fixes and the commit to the Markdown file', () => {
    vi.useFakeTimers();
    renderBuild();
    expect(screen.getByTestId('build-node-cart')).toBeDisabled();

    openAndBuild();
    expect(screen.getByTestId('build-node-login')).toHaveAccessibleName('authService concept, 2 files');
    expect(screen.getByTestId('build-node-login')).toHaveAttribute('data-target');
    expect(screen.getByTestId('build-node-refund')).toHaveAttribute('data-lone');
    rename();
    expect(screen.getByTestId('build-node-login')).toHaveAccessibleName('Sign-in concept, 2 files');
    expect(screen.getByTestId('build-node-refund')).toHaveAttribute('data-target');

    link();
    expect(screen.getByTestId('build-node-refund')).not.toHaveAttribute('data-lone');
    press('build-commit-apply');
    expect(screen.getByTestId('build-node-payment')).toHaveAttribute('data-changed');
    // A change reaches only what depends on it: Refunds, not the Cart and Sign-in that Payment depends on.
    expect(screen.getByTestId('build-node-refund')).toHaveAttribute('data-touched');
    for (const id of ['cart', 'login', 'payment']) expect(screen.getByTestId(`build-node-${id}`)).not.toHaveAttribute('data-touched');
    press('build-node-payment');
    expect(screen.getByTestId('build-inspect')).toHaveTextContent('charge-card.ts');

    press('build-confirm');
    const file = screen.getByTestId('build-file');
    expect(file).toHaveTextContent('payment.md');
    expect(file).toHaveTextContent('path: src/payment');
    expect(file).toHaveTextContent('- capabilities/login');
    expect(screen.getByTestId('build-try-browser')).toHaveAttribute('href', '/topology');
    expect(screen.getByTestId('build-result')).toHaveAttribute('data-stars', '3');

    press('build-restart');
    expect(screen.getByTestId('build-open')).toBeInTheDocument();
    expect(screen.getByTestId('build-node-payment')).toBeDisabled();
  });

  it('runs a fresh clock when a finished visitor tries again for three stars', () => {
    vi.useFakeTimers();
    renderBuild();
    openAndBuild();
    press('build-node-cart');
    rename();
    link();
    press('build-commit-apply');
    press('build-node-payment');
    press('build-confirm');
    expect(screen.getByTestId('build-clock')).toHaveAttribute('data-stopped');
    press('build-retry');
    press('build-open');
    expect(screen.getByTestId('build-clock')).not.toHaveAttribute('data-stopped');
  });

  it('names the concept to tap after a wrong tap, and says it again after a second one', () => {
    vi.useFakeTimers();
    renderBuild();
    openAndBuild();
    const asked = line();
    press('build-node-cart');
    const first = screen.getByTestId('build-line');
    expect(line()).not.toBe(asked);
    expect(line()).toContain('couponManager');
    press('build-node-payment');
    expect(screen.getByTestId('build-line')).not.toBe(first);
  });

  it('draws a missing relation when a concept is dragged onto the one it links to', () => {
    vi.useFakeTimers();
    HTMLElement.prototype.setPointerCapture = vi.fn();
    document.elementFromPoint = vi.fn(() => null);
    renderBuild();
    openAndBuild();
    rename();
    const map = screen.getByTestId('build-stage').firstElementChild!;
    fireEvent.pointerDown(screen.getByTestId('build-node-payment'), { pointerId: 1, button: 0, clientX: 200, clientY: 200 });
    fireEvent.pointerMove(map, { pointerId: 1, clientX: 120, clientY: 120 });
    expect(screen.getByTestId('build-node-payment')).toHaveAttribute('data-picked');
    // The stage has no size here, so every concept sits at the origin the drag ends on.
    fireEvent.pointerUp(map, { pointerId: 1, clientX: 0, clientY: 0 });
    expect(screen.getByTestId('build-node-refund')).not.toHaveAttribute('data-lone');
    expect(screen.getByTestId('build-node-payment')).not.toHaveAttribute('data-picked');
  });

  it('counts one press of a double click on a concept that stays in place', () => {
    vi.useFakeTimers();
    renderBuild();
    openAndBuild();
    rename();
    fireEvent.click(screen.getByTestId('build-node-payment'), { detail: 1 });
    fireEvent.click(screen.getByTestId('build-node-payment'), { detail: 2 });
    expect(screen.getByTestId('build-node-payment')).toHaveAttribute('data-picked');
  });

  it('keeps keyboard focus in the section when the pressed control leaves', () => {
    vi.useFakeTimers();
    renderBuild();
    screen.getByTestId('build-open').focus();
    openAndBuild();
    expect(screen.getByTestId('build-node-coupon')).toHaveFocus();
    press('build-node-coupon');
    expect(screen.getByTestId('build-name-0')).toHaveFocus();
    press('build-name-0');
    expect(screen.getByTestId('build-node-login')).toHaveFocus();
    press('build-node-login');
    press('build-name-0');
    expect(screen.getByTestId('build-node-refund')).toHaveFocus();
    press('build-node-refund');
    press('build-node-payment');
    press('build-node-alerts');
    screen.getByTestId('build-node-shipping').focus();
    press('build-node-shipping');
    expect(screen.getByTestId('build-commit-apply')).toHaveFocus();
  });

  it('ends a phone visit on the source instead of a browser map it cannot open', () => {
    vi.useFakeTimers();
    renderBuild(true);
    openAndBuild();
    rename();
    link();
    press('build-commit-apply');
    press('build-node-payment');
    press('build-confirm');
    expect(screen.queryByTestId('build-try-browser')).toBeNull();
    expect(screen.getByTestId('build-github')).toHaveAttribute('href', expect.stringContaining('github.com'));
  });
});
