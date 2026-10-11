import { act, fireEvent, render, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useEffect, useLayoutEffect } from 'react';

import { EXIT_WINDOW_MS, usePanelPresence, useSurfaceSwap, useSwapHeight } from './use-presence';

function SwapFrames({ view, onMount }: { view: string; onMount: (view: string) => void }) {
  const { leaving } = useSurfaceSwap(view);
  const frames = leaving === null ? [view] : [leaving, view];
  return (
    <>
      {frames.map((frame) => (
        <Frame key={frame} name={frame} leaving={frame === leaving} onMount={onMount} />
      ))}
    </>
  );
}

function Frame({ name, leaving, onMount }: { name: string; leaving: boolean; onMount: (view: string) => void }) {
  useEffect(() => {
    onMount(name);
  }, [name, onMount]);
  return <div data-testid={`frame-${name}`} data-leaving={leaving} />;
}

describe('useSurfaceSwap', () => {
  it('names the leaving value on the render that swaps, so its frame is never remounted', () => {
    vi.useFakeTimers();
    const mounts: string[] = [];
    const onMount = (view: string) => mounts.push(view);
    const { queryByTestId, rerender } = render(<SwapFrames view="flat" onMount={onMount} />);
    rerender(<SwapFrames view="territories" onMount={onMount} />);
    expect(queryByTestId('frame-flat')).toHaveAttribute('data-leaving', 'true');
    expect(queryByTestId('frame-territories')).toHaveAttribute('data-leaving', 'false');
    act(() => {
      vi.advanceTimersByTime(EXIT_WINDOW_MS);
    });
    expect(queryByTestId('frame-flat')).toBeNull();
    expect(mounts).toEqual(['flat', 'territories']);
    vi.useRealTimers();
  });
});

function Harness({ token }: { token: string }) {
  const { hostRef, capture } = useSwapHeight(token);

  return (
    <>
      <button type="button" onClick={capture}>Capture</button>
      <div ref={hostRef} data-testid="host">
        <span data-testid="child">content</span>
      </div>
    </>
  );
}

function transitionEnd(element: Element, propertyName: string) {
  const event = new Event('transitionend', { bubbles: true });
  Object.defineProperty(event, 'propertyName', { value: propertyName });
  fireEvent(element, event);
}

describe('useSwapHeight', () => {
  it('waits for the host height transition instead of a bubbled child or another host property', () => {
    const originalRect = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'getBoundingClientRect');
    let height = 200;
    Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
      configurable: true,
      value() {
        return { height } as DOMRect;
      },
    });

    try {
      const { getByRole, getByTestId, rerender } = render(<Harness token="first" />);
      const host = getByTestId('host');
      const child = getByTestId('child');

      act(() => getByRole('button', { name: 'Capture' }).click());
      height = 120;
      act(() => rerender(<Harness token="second" />));
      expect(host).toHaveStyle({ height: '120px' });

      transitionEnd(child, 'height');
      expect(host).toHaveStyle({ height: '120px' });

      transitionEnd(host, 'opacity');
      expect(host).toHaveStyle({ height: '120px' });

      transitionEnd(host, 'height');
      expect(host.style.height).toBe('');
      expect(host.style.transition).toBe('');
    } finally {
      if (originalRect) Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', originalRect);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>).getBoundingClientRect;
    }
  });
});

describe('usePanelPresence', () => {
  it('marks the first closed layout commit as exiting and clears it on an immediate reopen', () => {
    vi.useFakeTimers();
    const commits: Array<{ open: boolean; mounted: boolean; exiting: boolean }> = [];
    function Probe({ open }: { open: boolean }) {
      const { mounted, exiting } = usePanelPresence(open);
      useLayoutEffect(() => { commits.push({ open, mounted, exiting }); }, [open, mounted, exiting]);
      return mounted ? <div inert={exiting}>surface</div> : null;
    }
    try {
      const view = render(<Probe open />);
      view.rerender(<Probe open={false} />);
      expect(commits.find(commit => !commit.open)).toEqual({ open: false, mounted: true, exiting: true });
      commits.length = 0;
      view.rerender(<Probe open />);
      expect(commits[0]).toEqual({ open: true, mounted: true, exiting: false });
      act(() => { vi.advanceTimersByTime(EXIT_WINDOW_MS); });
      expect(view.queryByText('surface')).toBeInTheDocument();
      view.unmount();
    } finally { vi.useRealTimers(); }
  });

  /*
   * A surface opened in its first exit window (a locale remount reopening the settings sheet)
   * rendered `inert` on its opening commit, so the focus trap could not focus it.
   */
  it('is never exiting while open, even when opened right after mount', () => {
    vi.useFakeTimers();
    const { result, rerender } = renderHook(({ open }) => usePanelPresence(open), {
      initialProps: { open: false },
    });
    expect(result.current.exiting).toBe(false);
    rerender({ open: true });
    expect(result.current.exiting).toBe(false);
    rerender({ open: false });
    expect(result.current).toEqual({ mounted: true, exiting: true });
    rerender({ open: true });
    expect(result.current.exiting).toBe(false);
    rerender({ open: false });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(result.current).toEqual({ mounted: false, exiting: false });
    vi.useRealTimers();
  });
});
