import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import { FAQ_KEYS } from '../model/faq';
import { FaqSection } from './FaqSection';

const ITEMS = enMessages.download.faq.items;

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

type Deliver = (entries: Partial<IntersectionObserverEntry>[]) => void;
type Run = { play: ReturnType<typeof vi.fn>; pause: ReturnType<typeof vi.fn>; onfinish: (() => void) | null };

/** The section at a width and motion setting, with its observer and progress runs in hand. */
function mount({ narrow = false, reduced = false } = {}) {
  const deliver: Deliver[] = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback: IntersectionObserverCallback) {
        deliver.push((entries) => callback(entries as IntersectionObserverEntry[], this as never));
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduce') ? reduced : query.includes('max-width') ? narrow : false,
    addEventListener() {},
    removeEventListener() {},
  }));
  const runs: Run[] = [];
  Element.prototype.animate = vi.fn(() => {
    const run: Run = { play: vi.fn(), pause: vi.fn(), onfinish: null };
    runs.push(run);
    return Object.assign(run, { cancel() {}, playState: 'paused', finished: new Promise(() => {}) });
  }) as unknown as Element['animate'];
  render(<FaqSection />, { wrapper: IntlWrapper });
  return { deliver, runs, section: screen.getByTestId('gateway-faq-section') };
}

/** The picker is built a frame after hydration, so the first paint matches the server's list. */
async function settle() {
  await act(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
}

function expectEveryAnswerWhole(section: HTMLElement) {
  for (const key of FAQ_KEYS) {
    const answer = [...section.querySelectorAll('p')].find((p) => p.textContent === ITEMS[key].a);
    expect(answer, key).toBeDefined();
  }
}

describe('the FAQ', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'animate');
  });

  it('picks a question on the left and shows its answer on the right, every answer still in the page', async () => {
    const { section } = mount();
    await settle();
    const tabs = within(section).getAllByRole('tab');
    expect(tabs.map((tab) => tab.textContent)).toEqual(FAQ_KEYS.map((key) => ITEMS[key].q));
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expectEveryAnswerWhole(section);

    fireEvent.click(tabs[2]);
    expect(tabs[2]).toHaveAttribute('aria-selected', 'true');
    const panel = document.getElementById(tabs[2].getAttribute('aria-controls')!);
    expect(panel).toHaveAttribute('data-state', 'active');
    expect(panel).toHaveTextContent(ITEMS.privacy.a);
    expect(document.getElementById(tabs[0].getAttribute('aria-controls')!)).toHaveAttribute('inert');
  });

  it('moves between questions with the arrow keys, Home and End, keeping one tab stop', async () => {
    const { section } = mount();
    await settle();
    const tabs = within(section).getAllByRole('tab');
    fireEvent.keyDown(tabs[0], { key: 'ArrowDown' });
    expect(tabs[1]).toHaveFocus();
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(tabs[1], { key: 'ArrowUp' });
    fireEvent.keyDown(tabs[0], { key: 'ArrowUp' });
    expect(tabs[FAQ_KEYS.length - 1]).toHaveFocus();
    fireEvent.keyDown(tabs[FAQ_KEYS.length - 1], { key: 'Home' });
    expect(tabs[0]).toHaveFocus();
    expect(tabs.filter((tab) => tab.tabIndex === 0)).toEqual([tabs[0]]);
  });

  it('moves on by itself only while in view and untouched, and never after a person picks', async () => {
    const { deliver, runs, section } = mount();
    await settle();
    const picker = screen.getByTestId('gateway-faq-picker');
    const run = runs.at(-1)!;
    expect(run.play).not.toHaveBeenCalled();

    act(() => deliver.at(-1)!([{ intersectionRatio: 0.5 }]));
    expect(run.play).toHaveBeenCalled();
    fireEvent.pointerEnter(picker);
    expect(run.pause).toHaveBeenCalled();
    fireEvent.pointerLeave(picker);

    act(() => run.onfinish?.());
    const tabs = within(section).getAllByRole('tab');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true');
    expect(runs.at(-1)!.play).toHaveBeenCalled();

    fireEvent.click(tabs[3]);
    fireEvent.blur(tabs[3]);
    expect(runs.at(-1)!.play).not.toHaveBeenCalled();
  });

  it('stands every question over its answer on a narrow window', async () => {
    const { section } = mount({ narrow: true });
    await settle();
    expect(within(section).queryByRole('tablist')).not.toBeInTheDocument();
    expect(within(section).getAllByRole('heading', { level: 3 })).toHaveLength(FAQ_KEYS.length);
    expectEveryAnswerWhole(section);
  });

  it('stands every question over its answer under reduced motion', async () => {
    const { section } = mount({ reduced: true });
    await settle();
    expect(within(section).queryByRole('tablist')).not.toBeInTheDocument();
    expectEveryAnswerWhole(section);
  });
});
