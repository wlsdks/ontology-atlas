import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { beginMapNavigation, cancelMapNavigation, completeMapNavigation, readMapNavigationPending } from './map-navigation-pending';
import { ROUTE_VIEW_TRANSITION_CROSSFADE_FALLBACK_MS as COVER_MS } from './route-view-transition';

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
    expect(navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(COVER_MS);
    expect(navigate).toHaveBeenCalledOnce();
    expect(readMapNavigationPending()?.id).toBe(id);
    completeMapNavigation(id);
    expect(readMapNavigationPending()).toBeNull();
  });

  it('leaves the old pane only once the cover has faded in and a frame has painted', () => {
    const navigate = vi.fn();
    beginMapNavigation(navigate, '/mcp/');
    vi.advanceTimersByTime(COVER_MS - 1);
    frame(); frame();
    expect(navigate).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(navigate).toHaveBeenCalledOnce();

    cancelMapNavigation();
    const later = vi.fn();
    beginMapNavigation(later, '/mcp/');
    vi.advanceTimersByTime(COVER_MS);
    expect(later).not.toHaveBeenCalled();
    frame(); frame();
    expect(later).toHaveBeenCalledOnce();
  });

  it('cancels queued navigation and ignores an earlier frame completion', () => {
    const first = vi.fn();
    const old = beginMapNavigation(first, '/mcp/');
    cancelMapNavigation();
    frame(); frame();
    vi.advanceTimersByTime(COVER_MS);
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
    vi.advanceTimersByTime(COVER_MS);
    expect(readMapNavigationPending()?.phase).toBe('stalled');
  });
});
