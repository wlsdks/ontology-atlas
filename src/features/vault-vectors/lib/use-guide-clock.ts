import { useEffect, useState, type RefObject } from 'react';

const TICK_MS = 100;

/**
 * Milliseconds into a loop of `loopMs`, advancing only while `playing`, the element is on screen
 * and the window is shown; a paused clock keeps its place. One state update per tick.
 */
export function useGuideClock(element: RefObject<HTMLElement | null>, playing: boolean, loopMs: number): number {
  const [elapsed, setElapsed] = useState(0);
  const [onScreen, setOnScreen] = useState(false);
  const [shown, setShown] = useState(true);

  useEffect(() => {
    const target = element.current;
    if (!target || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(([entry]) => setOnScreen(entry?.isIntersecting ?? false));
    observer.observe(target);
    return () => observer.disconnect();
  }, [element]);

  useEffect(() => {
    const read = () => setShown(document.visibilityState !== 'hidden');
    read();
    document.addEventListener('visibilitychange', read);
    return () => document.removeEventListener('visibilitychange', read);
  }, []);

  const running = playing && onScreen && shown;
  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const now = performance.now();
      const step = now - last;
      last = now;
      setElapsed((value) => (value + step) % loopMs);
      timer = setTimeout(tick, TICK_MS);
    };
    timer = setTimeout(tick, TICK_MS);
    return () => clearTimeout(timer);
  }, [running, loopMs]);

  return elapsed;
}
