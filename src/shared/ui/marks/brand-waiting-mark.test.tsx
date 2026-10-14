import { act, fireEvent, render, screen } from '@testing-library/react';
import { Profiler, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BrandWaitingMark } from './brand-waiting-mark';

let reduced = false;
let hidden = false;
const mediaListeners = new Set<() => void>();
const observers: Array<{ reveal: (visible: boolean) => void; disconnect: ReturnType<typeof vi.fn> }> = [];

beforeEach(() => {
  reduced = false;
  hidden = false;
  mediaListeners.clear();
  observers.length = 0;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced; },
    addEventListener: (_: string, listener: () => void) => mediaListeners.add(listener),
    removeEventListener: (_: string, listener: () => void) => mediaListeners.delete(listener),
  }));
  vi.stubGlobal('IntersectionObserver', class {
    disconnect = vi.fn();
    constructor(callback: IntersectionObserverCallback) {
      observers.push({
        reveal: (visible) => callback([{ isIntersecting: visible } as IntersectionObserverEntry], this as unknown as IntersectionObserver),
        disconnect: this.disconnect,
      });
    }
    observe() {}
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('does not mount or subscribe while no operation is pending', () => {
  const { container } = render(<BrandWaitingMark active={false} />);
  expect(container).toBeEmptyDOMElement();
  expect(observers).toHaveLength(0);
  expect(mediaListeners.size).toBe(0);
});

it('server-renders visible full-screen waits ready for CSS-only motion without subscribing', () => {
  const html = renderToString(<BrandWaitingMark active initialVisibility="visible" />);
  expect(html).toContain('data-waiting-motion="running"');
  expect(html).toContain('/brand/mascot-walk-row.png');
  expect(observers).toHaveLength(0);
  expect(mediaListeners.size).toBe(0);
});

it('hands a full-screen wait over to document and intersection guards on hydration', () => {
  hidden = true;
  render(<BrandWaitingMark active initialVisibility="visible" />);
  const mark = screen.getByTestId('brand-waiting-mark');
  expect(mark).toHaveAttribute('data-waiting-motion', 'paused');
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  expect(mark).toHaveAttribute('data-waiting-motion', 'running');
  act(() => observers[0].reveal(false));
  expect(mark).toHaveAttribute('data-waiting-motion', 'paused');
});

it('runs only in a visible document and intersecting surface, then disconnects on completion', () => {
  const { rerender } = render(<BrandWaitingMark active />);
  const mark = screen.getByTestId('brand-waiting-mark');
  expect(mark).toHaveAttribute('aria-hidden', 'true');
  expect(mark).not.toHaveAttribute('data-mascot-state');
  expect(mark).toHaveAttribute('data-waiting-motion', 'paused');

  act(() => observers[0].reveal(true));
  expect(mark).toHaveAttribute('data-waiting-motion', 'running');
  hidden = true;
  fireEvent(document, new Event('visibilitychange'));
  expect(mark).toHaveAttribute('data-waiting-motion', 'paused');
  act(() => observers[0].reveal(false));
  hidden = false;
  fireEvent(document, new Event('visibilitychange'));
  expect(mark).toHaveAttribute('data-waiting-motion', 'paused');
  act(() => observers[0].reveal(true));
  expect(mark).toHaveAttribute('data-waiting-motion', 'running');

  rerender(<BrandWaitingMark active={false} />);
  expect(screen.queryByTestId('brand-waiting-mark')).toBeNull();
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
  expect(mediaListeners.size).toBe(0);
});

it('keeps the character still under reduced motion without subscribing to visibility work', () => {
  reduced = true;
  render(<BrandWaitingMark active />);
  expect(screen.getByTestId('brand-waiting-mark')).toHaveAttribute('data-waiting-motion', 'still');
  expect(observers).toHaveLength(0);
});

it('keeps a static character if offscreen visibility cannot be observed', () => {
  vi.stubGlobal('IntersectionObserver', undefined);
  render(<BrandWaitingMark active />);
  expect(screen.getByTestId('brand-waiting-mark')).toHaveAttribute('data-waiting-motion', 'still');
});

it('responds to a changed motion preference without a second animation clock', () => {
  render(<BrandWaitingMark active />);
  act(() => observers[0].reveal(true));
  act(() => {
    reduced = true;
    mediaListeners.forEach((listener) => listener());
  });
  expect(screen.getByTestId('brand-waiting-mark')).toHaveAttribute('data-waiting-motion', 'still');
  expect(observers[0].disconnect).toHaveBeenCalledOnce();
});

describe('pending lifecycle and scheduling budget', () => {
  it('adds no frame callbacks, timers or repeated React commits during a wait, and cancellation ends it immediately', () => {
    vi.useFakeTimers();
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    const interval = vi.spyOn(window, 'setInterval');
    const timeout = vi.spyOn(window, 'setTimeout');
    const commit = vi.fn();
    function Harness() {
      const [pending, setPending] = useState(true);
      return <><p role="status">{pending ? 'Preparing the selected tool' : 'Stopped'}</p><BrandWaitingMark active={pending} /><button onClick={() => setPending(false)}>Stop</button></>;
    }
    render(<Profiler id="waiting" onRender={commit}><Harness /></Profiler>);
    act(() => observers[0].reveal(true));
    const initialCommits = commit.mock.calls.length;
    act(() => vi.advanceTimersByTime(3_000));
    expect(commit).toHaveBeenCalledTimes(initialCommits);
    expect(raf).not.toHaveBeenCalled();
    expect(interval).not.toHaveBeenCalled();
    expect(timeout).not.toHaveBeenCalled();
    expect(screen.getByRole('status')).toHaveTextContent('Preparing the selected tool');
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
    expect(screen.queryByTestId('brand-waiting-mark')).toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent('Stopped');
    expect(vi.getTimerCount()).toBe(0);
  });
});
