import { act, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
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
const openAndRead = () => {
  press('build-open');
  act(() => vi.runOnlyPendingTimers());
};
const nameAll = () => {
  for (let i = 0; i < 3; i += 1) press('build-name-0');
};
const linkAll = () => {
  for (const id of ['payment', 'cart', 'payment', 'account']) press(`build-node-${id}`);
};

afterEach(() => {
  vi.useRealTimers();
});

describe('BuildWithMoru', () => {
  it('walks a visitor from the closed folder to the finished map and its Markdown file', () => {
    vi.useFakeTimers();
    renderBuild();
    expect(screen.getByTestId('build-node-cart')).toBeDisabled();

    openAndRead();
    press('build-name-0');
    press('build-name-1');
    press('build-name-0');
    expect(screen.getByTestId('build-node-payment')).toHaveAccessibleName('src/payment folder concept, 3 files');
    expect(screen.getByTestId('build-node-payment')).toHaveAttribute('data-target');

    linkAll();
    press('build-commit-apply');
    expect(screen.getByTestId('build-node-payment')).toHaveAttribute('data-changed');
    press('build-node-payment');
    expect(screen.getByTestId('build-inspect')).toHaveTextContent('charge-card.ts');
    expect(screen.getByTestId('build-node-cart')).toBeDisabled();

    press('build-confirm');
    const file = screen.getByTestId('build-file');
    expect(file).toHaveTextContent('payment.md');
    expect(file).toHaveTextContent('title: src/payment folder');
    expect(file).toHaveTextContent('path: src/payment');
    expect(file).toHaveTextContent('- capabilities/cart');
    expect(screen.getByTestId('build-try-browser')).toHaveAttribute('href', '/topology');

    press('build-restart');
    expect(screen.getByTestId('build-open')).toBeInTheDocument();
    expect(screen.getByTestId('build-node-payment')).toBeDisabled();
  });

  it('names the concept to tap after a wrong tap, and says it again after a second one', () => {
    vi.useFakeTimers();
    renderBuild();
    openAndRead();
    nameAll();
    const asked = line();
    press('build-node-cart');
    const first = screen.getByTestId('build-line');
    expect(line()).not.toBe(asked);
    expect(line()).toContain('Payment');
    press('build-node-account');
    expect(screen.getByTestId('build-line')).not.toBe(first);
  });

  it('counts one press of a double click on a choice that stays in place', () => {
    vi.useFakeTimers();
    renderBuild();
    openAndRead();
    fireEvent.click(screen.getByTestId('build-name-0'), { detail: 1 });
    fireEvent.click(screen.getByTestId('build-name-0'), { detail: 2 });
    expect(screen.getByTestId('build-node-cart')).toHaveAccessibleName(/^Cart/);
    expect(screen.getByTestId('build-name-0')).toHaveTextContent('Payment');
  });

  it('keeps keyboard focus in the section when the pressed control leaves', () => {
    vi.useFakeTimers();
    renderBuild();
    screen.getByTestId('build-open').focus();
    openAndRead();
    expect(screen.getByTestId('build-name-0')).toHaveFocus();

    nameAll();
    expect(screen.getByTestId('build-node-payment')).toHaveFocus();
    for (const id of ['payment', 'cart', 'payment']) press(`build-node-${id}`);
    screen.getByTestId('build-node-account').focus();
    press('build-node-account');
    expect(screen.getByTestId('build-commit-apply')).toHaveFocus();
  });

  it('ends a phone visit on the source instead of a browser map it cannot open', () => {
    vi.useFakeTimers();
    renderBuild(true);
    openAndRead();
    nameAll();
    linkAll();
    press('build-commit-apply');
    press('build-node-payment');
    press('build-confirm');
    expect(screen.queryByTestId('build-try-browser')).toBeNull();
    expect(screen.getByTestId('build-github')).toHaveAttribute('href', expect.stringContaining('github.com'));
  });
});
