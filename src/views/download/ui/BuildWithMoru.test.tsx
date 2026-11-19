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

const line = () => screen.getByTestId('build-line').textContent;
const press = (id: string) => fireEvent.click(screen.getByTestId(id));

afterEach(() => {
  vi.useRealTimers();
});

describe('BuildWithMoru', () => {
  it('walks a visitor from the closed folder to the finished map and its Markdown file', () => {
    vi.useFakeTimers();
    renderBuild();
    expect(screen.getByTestId('build-node-cart')).toBeDisabled();

    press('build-open');
    expect(line()).toBe('Reading 8 files and gathering the ones that do the same job.');
    act(() => vi.runOnlyPendingTimers());
    expect(line()).toBe('These 3 files do one job. What should the map call it?');

    press('build-name-0');
    press('build-name-1');
    press('build-name-0');
    expect(screen.getByTestId('build-node-payment')).toHaveAccessibleName('src/payment folder concept, 3 files');
    expect(line()).toBe('src/payment folder connects to Cart (reads the total). Tap src/payment folder first.');

    press('build-node-cart');
    expect(line()).toBe('Not that one. Tap the concept that glows.');
    press('build-node-payment');
    expect(screen.getByTestId('build-node-payment')).toHaveAttribute('aria-pressed', 'true');
    press('build-node-cart');
    press('build-node-payment');
    press('build-node-account');

    press('build-commit-apply');
    expect(screen.getByTestId('build-node-payment')).toHaveAttribute('data-changed');
    press('build-node-payment');
    expect(screen.getByTestId('build-inspect')).toHaveTextContent('charge-card.ts');

    press('build-confirm');
    expect(screen.getByTestId('build-file')).toHaveTextContent('docs/ontology/capabilities/payment.md');
    expect(screen.getByTestId('build-file')).toHaveTextContent('title: src/payment folder');
    expect(screen.getByTestId('build-try-own')).toHaveAttribute('href', '/topology');

    press('build-restart');
    expect(line()).toBe('This is a small shop app. Shall we map it together? Let’s open the folder first.');
    expect(screen.getByTestId('build-node-payment')).toBeDisabled();
  });

  it('ends a phone visit on the source instead of a browser map it cannot open', () => {
    vi.useFakeTimers();
    renderBuild(true);
    press('build-open');
    act(() => vi.runOnlyPendingTimers());
    for (let i = 0; i < 3; i += 1) press('build-name-0');
    for (const id of ['payment', 'cart', 'payment', 'account']) press(`build-node-${id}`);
    press('build-commit-apply');
    press('build-node-payment');
    press('build-confirm');
    expect(screen.queryByTestId('build-try-own')).toBeNull();
    expect(screen.getByTestId('build-github')).toHaveAttribute('href', expect.stringContaining('github.com'));
  });
});
