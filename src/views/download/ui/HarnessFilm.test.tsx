import { act, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import jaMessages from '../../../../messages/ja.json';
import koMessages from '../../../../messages/ko.json';
import zhMessages from '../../../../messages/zh.json';
import { HarnessFilm } from './HarnessFilm';

const LABEL = "The Harness tab: your repository's agent setup";

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

const frame = () => act(() => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined))));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('HarnessFilm', () => {
  it('without a script is one visible list of the four acts, each with its whole sentence', () => {
    vi.stubGlobal('matchMedia', undefined);
    renderFilm();
    const region = screen.getByRole('region', { name: LABEL });
    expect(region).toHaveAttribute('data-gateway-harness', 'still');
    expect(region.querySelector('canvas')).toBeNull();
    const acts = [...region.querySelectorAll('li')].map((act) => [act.querySelector('h3')?.textContent, act.querySelector('p')?.textContent]);
    expect(acts.map(([title]) => title)).toEqual([
      'One scan gathers your agent setup',
      'Filter by agent tool',
      'It finds a missing hook script',
      'Tags Claude and Codex copies that differ',
    ]);
    for (const [, body] of acts) expect(body?.length).toBeGreaterThan(60);
  });

  it('under reduced motion draws one still frame above the same list; narrower than the film, the list alone', async () => {
    for (const [queries, canvas] of [
      [{ 'prefers-reduced-motion': true, 'min-width': true }, true],
      [{ 'prefers-reduced-motion': false, 'min-width': false }, false],
    ] as const) {
      vi.stubGlobal('matchMedia', mediaMatching(queries));
      const { unmount } = renderFilm();
      await frame();
      const region = screen.getByRole('region', { name: LABEL });
      expect(region).toHaveAttribute('data-gateway-harness', 'still');
      expect(Boolean(region.querySelector('canvas'))).toBe(canvas);
      expect(within(region).getAllByRole('heading', { level: 3 })).toHaveLength(4);
      unmount();
    }
  });

  it('plays on a wide screen with motion, naming its example repository beside the title', async () => {
    vi.stubGlobal('matchMedia', mediaMatching({ 'prefers-reduced-motion': false, 'min-width': true }));
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    renderFilm();
    await frame();
    const region = screen.getByRole('region', { name: LABEL });
    expect(region).toHaveAttribute('data-gateway-harness', 'playing');
    expect(region.querySelector('canvas')).toHaveAttribute('aria-hidden', 'true');
    expect(within(region).getByText('my-app/').closest('p')).toHaveTextContent('Example repository my-app/');
    /* While playing only the last act carries a line under its headline. */
    expect(within(region).getByText('The Harness tab. Read-only.')).toBeInTheDocument();
  });
});

describe('the screen the film draws', () => {
  it('uses the Harness tab’s own words in every locale', () => {
    for (const messages of [enMessages, koMessages, jaMessages, zhMessages]) {
      const screenWords = messages.download.harnessFilm.screen as Record<string, unknown>;
      const tab = messages.harness as Record<string, unknown>;
      for (const [key, value] of Object.entries(screenWords)) expect(value, key).toEqual(tab[key]);
    }
  });
});
