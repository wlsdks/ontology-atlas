import { yieldToFrame } from './yield-to-frame';

/** Items one slice may run however cheap they are, so a pass over every document yields often. */
export const RUN_SLICED_MAX_ITEMS = 64;

export type RunSlicedOptions = {
  /** Checked before every item; an aborted pass rejects with the signal's reason. */
  signal?: AbortSignal;
  /** Injected by tests; the browser's clock and `yieldToFrame` otherwise. */
  now?: () => number;
  yieldNow?: () => Promise<void>;
};

/**
 * Runs `work` over `items` in order on the calling thread, yielding whenever a slice has run for
 * `budgetMs` or for {@link RUN_SLICED_MAX_ITEMS} items, and resolves with the results in order.
 * One item longer than the budget still runs whole: the budget bounds the slice, not the item.
 */
export async function runSliced<T, R>(
  items: readonly T[],
  work: (item: T, index: number) => R,
  budgetMs = 8,
  { signal, now = () => performance.now(), yieldNow = yieldToFrame }: RunSlicedOptions = {},
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let sliceStart = now();
  let inSlice = 0;
  for (let index = 0; index < items.length; index += 1) {
    signal?.throwIfAborted();
    results[index] = work(items[index], index);
    inSlice += 1;
    const last = index === items.length - 1;
    if (!last && (inSlice >= RUN_SLICED_MAX_ITEMS || now() - sliceStart >= budgetMs)) {
      await yieldNow();
      sliceStart = now();
      inSlice = 0;
    }
  }
  return results;
}
