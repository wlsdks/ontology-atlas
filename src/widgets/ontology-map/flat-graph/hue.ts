export const DOMAIN_HUE_COUNT = 8;

/**
 * Domains take hue indices in circular order; a domain whose preferred index an already-coloured
 * neighbour holds takes the lowest index no neighbour holds, so past eight domains hues repeat but
 * never on adjacent clusters while a free index exists. A remembered hue is kept as is.
 * O(D²) through `adjacent`.
 */
export function assignDomainHues(
  order: readonly string[],
  adjacent: (a: string, b: string) => boolean,
  remembered: ReadonlyMap<string, number> | null,
): Map<string, number> {
  const hues = new Map<string, number>();
  for (const id of order) {
    const kept = remembered?.get(id);
    if (kept !== undefined && kept >= 0 && kept < DOMAIN_HUE_COUNT) hues.set(id, kept);
  }
  order.forEach((id, k) => {
    if (hues.has(id)) return;
    const taken = new Set<number>();
    for (const [other, hue] of hues) if (adjacent(id, other)) taken.add(hue);
    const preferred = remembered === null || remembered.size === 0 ? k % DOMAIN_HUE_COUNT : -1;
    if (preferred >= 0 && !taken.has(preferred)) {
      hues.set(id, preferred);
      return;
    }
    let free = 0;
    while (free < DOMAIN_HUE_COUNT && taken.has(free)) free += 1;
    hues.set(id, free < DOMAIN_HUE_COUNT ? free : Math.max(0, preferred));
  });
  return hues;
}
