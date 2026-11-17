import { act, cleanup, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

describe('GatewayFx under a modal dialog', () => {
  it('fades its cursor ring out while a dialog is open and follows the pointer again once it closes', async () => {
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
    move();
    expect(ring).not.toHaveClass('is-on');

    scrim.remove();
    await flush();
    move();
    expect(ring).toHaveClass('is-on');
  });
});
