export const DOMAIN_HUE_COUNT = 8;

/**
 * Domains take hue indices in circular order. A remembered hue is kept unless another kept domain
 * already holds it while a free index remains. Every other domain takes the least-used index no
 * neighbour holds, preferring its circular one, so eight or fewer domains never share a hue and
 * past eight a hue repeats only on clusters that are not adjacent. O(D²) through `adjacent`.
 */
export function assignDomainHues(
  order: readonly string[],
  adjacent: (a: string, b: string) => boolean,
  remembered: ReadonlyMap<string, number> | null,
): Map<string, number> {
  const hues = new Map<string, number>();
  const uses = new Array<number>(DOMAIN_HUE_COUNT).fill(0);
  const crowded = order.length > DOMAIN_HUE_COUNT;
  const neighbourHues = (id: string) => {
    const taken = new Set<number>();
    for (const [other, hue] of hues) if (adjacent(id, other)) taken.add(hue);
    return taken;
  };
  const give = (id: string, hue: number) => {
    hues.set(id, hue);
    uses[hue]! += 1;
  };
  for (const id of order) {
    const kept = remembered?.get(id);
    if (kept === undefined || kept < 0 || kept >= DOMAIN_HUE_COUNT) continue;
    if (uses[kept] === 0 || (crowded && !neighbourHues(id).has(kept))) give(id, kept);
  }
  order.forEach((id, k) => {
    if (hues.has(id)) return;
    const taken = neighbourHues(id);
    const preferred = k % DOMAIN_HUE_COUNT;
    let best = -1;
    for (let step = 0; step < DOMAIN_HUE_COUNT; step += 1) {
      const hue = (preferred + step) % DOMAIN_HUE_COUNT;
      if (taken.has(hue)) continue;
      if (best < 0 || uses[hue]! < uses[best]!) best = hue;
    }
    give(id, best >= 0 ? best : preferred);
  });
  return hues;
}
