import type { Ref, RefCallback } from 'react';

/**
 * Combine several refs into one callback ref — for the case where an element already
 * carries an owner's ref (`containerRef`, `panelRef`, `dialogRef`, …) and a second
 * consumer (such as {@link import('@/shared/motion').useExitLockout}) also needs the
 * node. React only accepts one `ref` prop per element, so both callers' refs are
 * populated from the same callback rather than one silently overwriting the other.
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
