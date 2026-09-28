import { useMemo } from 'react';

export function derivedHook<A, R>(derive: (a: A) => R): (a: A) => R;
export function derivedHook<A, B, R>(derive: (a: A, b: B) => R): (a: A, b: B) => R;
export function derivedHook<A, B, R>(derive: (a: A, b?: B) => R) {
  return function useDerivedValue(a: A, b?: B): R {
    return useMemo(() => derive(a, b), [a, b]);
  };
}
