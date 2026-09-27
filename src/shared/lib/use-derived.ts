import { useMemo } from 'react';

export function useDerived<A, R>(derive: (a: A) => R, a: A): R;
export function useDerived<A, B, R>(derive: (a: A, b: B) => R, a: A, b: B): R;
export function useDerived<A, B, R>(derive: (a: A, b?: B) => R, a: A, b?: B): R {
  return useMemo(() => derive(a, b), [derive, a, b]);
}
