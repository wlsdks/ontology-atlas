import { domainFlows, type FilmVault } from '../film-vault';

export function slotOrder(vault: FilmVault, first: string | null): string[] {
  const ids = vault.domains.map((d) => d.id);
  if (ids.length <= 1) return ids;
  const flows = domainFlows(vault);
  const pair = (a: string, b: string) =>
    flows.filter((f) => (f.from === a && f.to === b) || (f.from === b && f.to === a)).reduce((sum, f) => sum + f.count, 0);
  const head = first && ids.includes(first) ? first : ids[0]!;
  const rest = ids.filter((id) => id !== head);
  const cost = (ring: string[]) => {
    let c = 0;
    for (let i = 0; i < ring.length; i += 1)
      for (let j = i + 1; j < ring.length; j += 1) c += pair(ring[i]!, ring[j]!) * Math.min(j - i, ring.length - (j - i));
    return c;
  };
  if (ids.length <= 6) {
    const perms = (xs: string[]): string[][] =>
      xs.length <= 1 ? [xs] : xs.flatMap((x, i) => perms([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
    let best: string[] = [head, ...rest];
    let least = Infinity;
    for (const p of perms(rest)) {
      const ring = [head, ...p];
      const c = cost(ring);
      if (c < least - 1e-9) {
        least = c;
        best = ring;
      }
    }
    return best;
  }
  const ring = [head];
  const left = new Set(rest);
  while (left.size) {
    const last = ring[ring.length - 1]!;
    const next = [...left].sort((a, b) => pair(last, b) - pair(last, a) || (a < b ? -1 : 1))[0]!;
    ring.push(next);
    left.delete(next);
  }
  return ring;
}
