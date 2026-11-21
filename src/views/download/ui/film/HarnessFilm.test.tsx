import { act, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../../messages/en.json';
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
  vi.restoreAllMocks();
});

describe('HarnessFilm', () => {
  it('without a script is one visible list of the four acts, each with its whole sentence', () => {
    vi.stubGlobal('matchMedia', undefined);
    renderFilm();
    const region = screen.getByRole('region', { name: LABEL });
    expect(region).toHaveAttribute('data-gateway-harness', 'still');
    expect(region.querySelector('img')).toBeNull();
    const acts = [...region.querySelectorAll('li')].map((act) => [act.querySelector('h3')?.textContent, act.querySelector('p')?.textContent]);
    expect(acts.map(([title]) => title)).toEqual([
      'One scan gathers your agent setup',
      'Filter by agent tool',
      'It finds a missing hook script',
      'Tags Claude and Codex copies that differ',
    ]);
    for (const [, body] of acts) expect(body?.length).toBeGreaterThan(60);
  });

  it('under reduced motion shows the window picture, and narrower than 768px the third close-up, above the same list', async () => {
    for (const [queries, file] of [
      [{ 'prefers-reduced-motion': true, 'min-width': true }, '/gateway/harness-film.en.webp'],
      [{ 'prefers-reduced-motion': true, 'min-width': false }, '/gateway/harness-film-phone-3.en.webp'],
    ] as const) {
      vi.stubGlobal('matchMedia', mediaMatching(queries));
      const { unmount } = renderFilm();
      await frame();
      const region = screen.getByRole('region', { name: LABEL });
      expect(region).toHaveAttribute('data-gateway-harness', 'still');
      const picture = region.querySelector('img')!;
      expect(picture.getAttribute('src')).toContain(file);
      expect(picture).toHaveAttribute('alt', '');
      expect(picture).toHaveAttribute('loading', 'lazy');
      expect(within(region).getAllByRole('heading', { level: 3 })).toHaveLength(4);
      unmount();
    }
  });

  it('on a phone with motion plays one close-up per act, in act order, under one caption at a time', async () => {
    vi.stubGlobal('matchMedia', mediaMatching({ 'prefers-reduced-motion': false, 'min-width': false }));
    renderFilm();
    await frame();
    const region = screen.getByRole('region', { name: LABEL });
    expect(region).toHaveAttribute('data-gateway-harness', 'phone');
    const shots = [...region.querySelectorAll('[data-harness-film-phone] img')];
    expect(shots.map((shot) => /harness-film-phone-(\d)\.en\.webp/.exec(shot.getAttribute('src') ?? '')?.[1])).toEqual(['1', '2', '3', '4']);
    for (const shot of shots) expect(shot).toHaveAttribute('alt', '');
    expect(region.querySelectorAll('li')).toHaveLength(4);
    expect(within(region).getByRole('navigation')).toBeInTheDocument();
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
    /* A 1440x900 stage: the label ends at 120px and the caption block starts at 700px. */
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
      const box = (top: number, bottom: number) => ({ left: 120, right: 1320, top, bottom, width: 1200, height: bottom - top, x: 120, y: top, toJSON() {} });
      if (this.querySelector('#gateway-harness-title')) return box(96, 120) as DOMRect;
      if (this.querySelector('nav')) return box(700, 860) as DOMRect;
      return { ...box(0, 900), left: 0, right: 1440, width: 1440, x: 0 } as DOMRect;
    });
    renderFilm();
    await frame();
    const region = screen.getByRole('region', { name: LABEL });
    expect(region).toHaveAttribute('data-gateway-harness', 'playing');
    expect(region.querySelector('img')).toBeNull();
    expect(within(region).getByText('my-app/').closest('p')).toHaveTextContent('Example repository my-app/');
    /* While playing only the last act carries a line under its headline. */
    expect(within(region).getByText('The Harness tab. Read-only.')).toBeInTheDocument();
  });
});
