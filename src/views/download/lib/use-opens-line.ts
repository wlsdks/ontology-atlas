import { useLayoutEffect, useState } from 'react';

export function useOpensLine(element: HTMLElement | null): boolean {
  const [opens, setOpens] = useState(false);
  useLayoutEffect(() => {
    const row = element?.parentElement;
    if (!element || !row) return;
    const read = () => {
      const prev = element.previousElementSibling as HTMLElement | null;
      setOpens(prev !== null && element.offsetTop > prev.offsetTop + prev.offsetHeight / 2);
    };
    read();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(read);
    observer.observe(row);
    return () => observer.disconnect();
  }, [element]);
  return opens;
}
