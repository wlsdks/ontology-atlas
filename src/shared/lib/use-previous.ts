"use client";

import { useEffect, useRef } from "react";

/**
 * Returns the value from the previous render. The ref is updated after each
 * render, so within one render cycle it reads as "the previous value".
 *
 * Use it for effects that must flow one way only when a specific input changed —
 * URL ↔ local state synchronisation, for example — instead of working around the
 * dependency array.
 *
 * Reading `ref.current` during render is what `react-hooks/refs` warns about, but
 * it is the point of this hook: return the ref value from the previous commit and
 * update it in an effect for the next one. Same pattern as React's own
 * `usePrevious` example.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  // eslint-disable-next-line react-hooks/refs
  return ref.current;
}
