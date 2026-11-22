import { useLayoutEffect, useState } from "react";

/**
 * Whether one line of text is cut by its box. The sentence carries a `title` only then: a whole
 * sentence's title repeats it, and WebKit can raise a native title away from the element it names.
 */
export function useTextCut(element: HTMLElement | null, text: string): boolean {
  const [cut, setCut] = useState(false);
  useLayoutEffect(() => {
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const measure = () => setCut(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [element, text]);
  return cut;
}
