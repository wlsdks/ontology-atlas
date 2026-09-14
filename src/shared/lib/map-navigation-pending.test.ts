import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginMapNavigation, cancelMapNavigation, completeMapNavigation, readMapNavigationPending } from './map-navigation-pending';

describe('map navigation pending', () => {
  let frames: FrameRequestCallback[];
  const frame = () => frames.shift()?.(0);
  beforeEach(() => {
    vi.useFakeTimers();
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => frames.push(callback));
  });
  afterEach(() => { cancelMapNavigation(); vi.useRealTimers(); vi.unstubAllGlobals(); });

  it('publishes pending before navigation and gives it a paint boundary', () => {
    const navigate = vi.fn();
    const id = beginMapNavigation(navigate, '/mcp/');
    expect(readMapNavigationPending()).toMatchObject({ id, from: '/mcp/', phase: 'preparing' });
    expect(navigate).not.toHaveBeenCalled();
    frame();
    expect(navigate).not.toHaveBeenCalled();
    frame();
    expect(navigate).toHaveBeenCalledOnce();
    expect(readMapNavigationPending()?.id).toBe(id);
    completeMapNavigation(id);
    expect(readMapNavigationPending()).toBeNull();
  });

  it('cancels queued navigation and ignores an earlier frame completion', () => {
    const first = vi.fn();
    const old = beginMapNavigation(first, '/mcp/');
    cancelMapNavigation();
    frame(); frame();
    expect(first).not.toHaveBeenCalled();
    const id = beginMapNavigation(vi.fn(), '/architecture/');
    completeMapNavigation(old);
    expect(readMapNavigationPending()?.id).toBe(id);
    cancelMapNavigation(id);
    expect(readMapNavigationPending()).toBeNull();
  });

  it('reports a stalled navigation without pretending the map is ready', () => {
    beginMapNavigation(vi.fn(), '/mcp/');
    frame(); frame();
    vi.advanceTimersByTime(15_000);
    expect(readMapNavigationPending()).toMatchObject({ phase: 'stalled', from: '/mcp/' });
  });

  it('keeps a synchronous navigation error recoverable', () => {
    beginMapNavigation(() => { throw new Error('navigation rejected'); }, '/mcp/');
    frame(); frame();
    expect(readMapNavigationPending()?.phase).toBe('stalled');
  });
});
