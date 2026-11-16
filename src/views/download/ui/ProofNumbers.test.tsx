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
  const frames: FrameRequestCallback[] = [];
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
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => frames.push(cb));
  render(<ProofNumbers graph={graph} />, { wrapper: IntlWrapper });
  const shown = () =>
    [...screen.getByTestId('gateway-numbers').querySelectorAll('[data-token="engraved-numeral"]')].map(
      (node) => node.textContent,
    );
  const runFrame = (now: number) => act(() => frames.splice(0).forEach((cb) => cb(now)));
  return { deliver, shown, runFrame };
}

describe('the number strip', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the real numbers for a reader, whatever the drawn ones show', () => {
    const { deliver } = mount();
    act(() => deliver[0]([{ isIntersecting: false }]));
    for (const value of [MCP_TOOL_COUNT, 96, 242]) expect(screen.getByText(String(value))).toHaveClass('sr-only');
  });

  it('never hides numbers already in view when the page loads', () => {
    const { deliver, shown } = mount();
    act(() => deliver[0]([{ isIntersecting: true }]));
    expect(shown()).toEqual([String(MCP_TOOL_COUNT), '96', '242']);
  });

  it('waits at zero below the fold, then counts up to the real numbers once seen', () => {
    vi.spyOn(performance, 'now').mockReturnValue(0);
    const { deliver, shown, runFrame } = mount();
    act(() => deliver[0]([{ isIntersecting: false }]));
    expect(shown()).toEqual(['0', '0', '0']);
    act(() => deliver[0]([{ isIntersecting: true }]));
    runFrame(700);
    const midway = shown().map(Number);
    expect(midway[2]).toBeGreaterThan(0);
    expect(midway[2]).toBeLessThan(242);
    runFrame(5000);
    expect(shown()).toEqual([String(MCP_TOOL_COUNT), '96', '242']);
  });
});
