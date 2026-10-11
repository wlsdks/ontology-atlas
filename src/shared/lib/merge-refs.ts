import type { Ref, RefCallback } from 'react';

/**
 * Combine several refs into one callback ref: React accepts one `ref` prop per element, so both
 * consumers' refs are populated from the same callback instead of one overwriting the other.
 */
export function mergeRefs<T>(...refs: Array<Ref<T> | undefined | null>): RefCallback<T> {
  return (node) => {
    for (const ref of refs) {
      if (!ref) continue;
      if (typeof ref === 'function') ref(node);
      else (ref as { current: T | null }).current = node;
    }
  };
}
