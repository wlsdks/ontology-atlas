import { useState } from 'react';

/** The keys of `order` still present, in their order, then the new keys in theirs. */
export function stableOrder(order: readonly string[], keys: readonly string[]): readonly string[] {
  const present = new Set(keys);
  const known = new Set(order);
  const kept = order.filter(key => present.has(key));
  const added = keys.filter(key => !known.has(key));
  return kept.length === order.length && added.length === 0 ? order : [...kept, ...added];
}

/**
 * The items in the order they first appeared, new ones last. A room moves by `transform`, so its
 * place among its siblings draws nothing; keeping it means React never moves a room's element, which
 * would detach and restyle its whole subtree in one frame.
 */
export function useStableOrder<T>(items: readonly T[], keyOf: (item: T) => string): T[] {
  const keys = items.map(keyOf);
  const [order, setOrder] = useState<readonly string[]>(keys);
  const next = stableOrder(order, keys);
  if (next !== order) setOrder(next);
  const rank = new Map(next.map((key, index) => [key, index]));
  return [...items].sort((a, b) => (rank.get(keyOf(a)) ?? 0) - (rank.get(keyOf(b)) ?? 0));
}
