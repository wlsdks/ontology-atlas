import { act, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import enMessages from '../../../../messages/en.json';
import { MCP_TOOL_COUNT } from '../lib/release-facts';
import type { StageGraph } from '../lib/stage-graph';
import { ProofNumbers } from './ProofNumbers';

const graph = { nodes: Array.from({ length: 96 }), edges: Array.from({ length: 242 }) } as unknown as StageGraph;

function IntlWrapper({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {children}
    </NextIntlClientProvider>
  );
}

type Deliver = (entries: Partial<IntersectionObserverEntry>[]) => void;

function mount() {
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
  const animate = vi.fn(() => ({ pause() {}, play() {}, cancel() {}, playState: 'paused', finished: new Promise(() => {}) }));
  Element.prototype.animate = animate as unknown as Element['animate'];
  render(<ProofNumbers graph={graph} />, { wrapper: IntlWrapper });
  const shown = () =>
    [...screen.getByTestId('gateway-numbers').querySelectorAll('[data-token="engraved-numeral"]')].map(
      (node) => node.textContent,
    );
  return { deliver, shown, animate };
}

describe('the number strip', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    Reflect.deleteProperty(Element.prototype, 'animate');
  });

  it('shows the final counts while it waits below the fold and while it rises', () => {
    const { deliver, shown, animate } = mount();
    expect(shown()).toEqual([String(MCP_TOOL_COUNT), '96', '242']);
    act(() => deliver[0]([{ isIntersecting: false, intersectionRatio: 0 }]));
    act(() => deliver[0]([{ isIntersecting: true, intersectionRatio: 1 }]));
    expect(animate).toHaveBeenCalledTimes(3);
    expect(shown()).toEqual([String(MCP_TOOL_COUNT), '96', '242']);
  });

  it('never moves a strip already in view when the page loads', () => {
    const { deliver, animate } = mount();
    act(() => deliver[0]([{ isIntersecting: true, intersectionRatio: 1 }]));
    expect(animate).not.toHaveBeenCalled();
  });
});
