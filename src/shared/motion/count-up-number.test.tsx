import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CountUpNumber } from './count-up-number';

function mockReducedMotion(matches: boolean) {
  window.matchMedia = vi.fn(
    () =>
      ({
        matches,
        media: '(prefers-reduced-motion: reduce)',
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }) as unknown as MediaQueryList,
  ) as typeof window.matchMedia;
}

const originalMatchMedia = window.matchMedia;
afterEach(() => {
  window.matchMedia = originalMatchMedia;
  vi.unstubAllGlobals();
});

function parts(container: HTMLElement) {
  return {
    animated: container.querySelector('[data-count-up-animated]')!,
    final: container.querySelector('[data-count-up-final]')!,
  };
}

describe('CountUpNumber', () => {
  it('hides the moving digits and always states the final value', () => {
    mockReducedMotion(false);
    const frames: FrameRequestCallback[] = [];
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      frames.push(cb);
      return frames.length;
    });
    vi.stubGlobal('cancelAnimationFrame', () => {});
    const { container } = render(<CountUpNumber value={1200} format={(n) => n.toLocaleString('en')} />);
    const { animated, final } = parts(container);
    expect(animated).toHaveAttribute('aria-hidden', 'true');
    expect(animated).toHaveClass('tabular-nums');
    expect(animated).toHaveTextContent('0');
    expect(final).toHaveClass('sr-only');
    expect(final).toHaveTextContent('1,200');
    act(() => frames.shift()!(performance.now() + 60));
    expect(final).toHaveTextContent('1,200');
  });

  it('renders the target on the first frame under reduced motion', () => {
    mockReducedMotion(true);
    const { container } = render(<CountUpNumber value={42} />);
    const { animated, final } = parts(container);
    expect(animated).toHaveTextContent('42');
    expect(final).toHaveTextContent('42');
  });
});
