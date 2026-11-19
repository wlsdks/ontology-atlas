import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setMotionPaused } from '@/shared/motion/motion-pause';

import { GatewayFx } from './GatewayFx';

/** A 2D context whose every method is a no-op, enough for the field to paint its first frame. */
function fakeContext(): CanvasRenderingContext2D {
  const gradient = { addColorStop: vi.fn() };
  return new Proxy({} as Record<string, unknown>, {
    get: (target, key) => {
      if (key in target) return target[key as string];
      if (key === 'createRadialGradient' || key === 'createLinearGradient') return () => gradient;
      return vi.fn();
    },
    set: (target, key, value) => {
      target[key as string] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

const flush = () => act(() => Promise.resolve());
const move = () => act(() => {
  window.dispatchEvent(new PointerEvent('pointermove', { clientX: 200, clientY: 120 }));
});

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext());
  vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('pointer: fine'), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
});

afterEach(() => {
  cleanup();
  document.body.querySelectorAll('[data-test-modal]').forEach((node) => node.remove());
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const pointerShown = () => document.documentElement.hasAttribute('data-gateway-cursor');

describe('the download page pointer', () => {
  afterEach(() => act(() => setMotionPaused(false)));

  it('replaces the system pointer once the mouse moves, and wraps a control it points at', () => {
    const { container } = render(
      <>
        <GatewayFx />
        <button type="button">Download</button>
      </>,
    );
    expect(pointerShown()).toBe(false);
    move();
    expect(pointerShown()).toBe(true);
    expect(container.querySelector('.gateway-cursor')).toHaveClass('is-on');
    act(() => {
      container.querySelector('button')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(container.querySelector('.gateway-cursor > i')).toHaveAttribute('data-state', 'wrap');
  });

  it('gives the system pointer back over text entry and while the page motion is paused', () => {
    const { container } = render(
      <>
        <GatewayFx />
        <input aria-label="Search" />
      </>,
    );
    move();
    act(() => {
      container.querySelector('input')!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 }));
    });
    expect(pointerShown()).toBe(false);
    move();
    expect(pointerShown()).toBe(true);
    act(() => setMotionPaused(true));
    expect(pointerShown()).toBe(false);
    move();
    expect(pointerShown()).toBe(false);
  });

  it('leaves the system pointer alone under reduced motion', () => {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: query.includes('pointer: fine') || query.includes('reduce'), addEventListener: vi.fn(), removeEventListener: vi.fn() })));
    render(<GatewayFx />);
    move();
    expect(pointerShown()).toBe(false);
  });
});

describe('GatewayFx under a modal dialog', () => {
  it('steps its pointer aside while a dialog is open and takes it back once it closes', async () => {
    const { container } = render(<GatewayFx />);
    const ring = container.querySelector<HTMLElement>('.gateway-cursor')!;
    move();
    expect(ring).toHaveClass('is-on');

    const scrim = document.createElement('div');
    scrim.dataset.testModal = '';
    scrim.innerHTML = '<div role="dialog" aria-modal="true"></div>';
    document.body.append(scrim);
    await flush();
    expect(ring).not.toHaveClass('is-on');
    expect(pointerShown()).toBe(false);
    move();
    expect(ring).not.toHaveClass('is-on');

    scrim.remove();
    await flush();
    move();
    expect(ring).toHaveClass('is-on');
  });
});
