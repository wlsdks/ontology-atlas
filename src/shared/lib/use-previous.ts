import { useEffect, useRef } from "react";

/**
 * Returns the value from the previous render: the ref is updated in an effect after each commit. For
 * effects that must flow one way only when a specific input changed (URL and local state sync).
 * Reading `ref.current` during render is what `react-hooks/refs` warns about, and is the point here.
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => {
    ref.current = value;
  });
  // eslint-disable-next-line react-hooks/refs
  return ref.current;
}
