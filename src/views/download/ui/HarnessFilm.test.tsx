import { act, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import facts from '../lib/harness-facts.json';
import { HarnessFilm } from './HarnessFilm';

function renderFilm() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <HarnessFilm />
    </NextIntlClientProvider>,
  );
}

function mediaMatching(queries: Record<string, boolean>) {
  return (query: string) => ({
    matches: Object.entries(queries).some(([part, on]) => on && query.includes(part)),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HarnessFilm', () => {
  it('without a script is one visible list of the four acts, with the real counts', () => {
    vi.stubGlobal('matchMedia', undefined);
    renderFilm();
    const region = screen.getByRole('region', { name: 'The harness at a glance' });
    expect(region).toHaveAttribute('data-gateway-harness', 'still');
    expect(region.querySelector('canvas')).toBeNull();
    const titles = within(region).getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent);
    expect(titles).toEqual([
      'What your agent reads first',
      'What stops it before it acts',
      'What checks its work',
      "This repository's real harness",
    ]);
    const checks = facts.checks.scripts.length + facts.checks.gitHooks.length + facts.checks.workflows.length;
    expect(
      within(region).getByText(
        `${facts.instructions.length} instruction files, ${facts.hooks.length} hooks, ${checks} checks.`,
      ),
    ).toBeVisible();
  });

  it('under reduced motion, or narrower than the film reads, keeps the same list and draws nothing', async () => {
    for (const queries of [
      { 'prefers-reduced-motion': true, 'min-width': true },
      { 'prefers-reduced-motion': false, 'min-width': false },
    ]) {
      vi.stubGlobal('matchMedia', mediaMatching(queries));
      const { unmount } = renderFilm();
      await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
      const region = screen.getByRole('region', { name: 'The harness at a glance' });
      expect(region).toHaveAttribute('data-gateway-harness', 'still');
      expect(region.querySelector('canvas')).toBeNull();
      expect(within(region).getAllByRole('heading', { level: 3 })).toHaveLength(4);
      unmount();
    }
  });

  it('plays on a wide screen with motion: a pinned stage, its canvas hidden from readers', async () => {
    vi.stubGlobal('matchMedia', mediaMatching({ 'prefers-reduced-motion': false, 'min-width': true }));
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    renderFilm();
    await act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));
    const region = screen.getByRole('region', { name: 'The harness at a glance' });
    expect(region).toHaveAttribute('data-gateway-harness', 'playing');
    expect(region.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
  });
});
