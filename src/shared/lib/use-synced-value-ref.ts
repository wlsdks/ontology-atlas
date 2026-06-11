import { useEffect, useRef, type MutableRefObject } from "react";

/**
 * Keep the latest render value available to long-lived callbacks without
 * forcing expensive effects to re-subscribe on every value change.
 */
export function useSyncedValueRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}
