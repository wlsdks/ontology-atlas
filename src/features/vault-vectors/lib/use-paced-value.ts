import { useEffect, useRef, useState } from 'react';

export function usePacedValue<T>(value: T, intervalMs: number): T {
  const [shown, setShown] = useState(value);
  const shownAt = useRef<number | null>(null);

  useEffect(() => {
    const now = performance.now();
    const wait = shownAt.current === null ? 0 : Math.max(0, shownAt.current + intervalMs - now);
    const timer = window.setTimeout(() => {
      shownAt.current = performance.now();
      setShown(value);
    }, wait);
    return () => window.clearTimeout(timer);
  }, [value, intervalMs]);

  return shown;
}
