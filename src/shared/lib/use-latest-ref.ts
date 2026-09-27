import { useInsertionEffect, useRef, type RefObject } from 'react';

/**
 * The latest committed `value`. A callback that outlives its render keeps that render's whole
 * scope, so it reads big state through this ref rather than holding an old copy. Written here, in
 * this hook's scope, before layout effects run.
 */
export function useLatestRef<T>(value: T): RefObject<T> {
  const ref = useRef(value);
  useInsertionEffect(() => {
    ref.current = value;
  });
  return ref;
}
