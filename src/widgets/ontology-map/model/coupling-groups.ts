/**
 * Layout-only communities from actual adjacency, never declared domains.
 * A bounded local modularity pass (Blondel et al., 2008, section 2) keeps dense
 * neighbourhoods together without adding relations or assigning product meaning.
 * Stable visitation and strict positive gains preserve reload determinism.
 */
export function findCouplingGroups(
  ids: readonly string[],
  edges: readonly { sourceId: string; targetId: string }[],
): Int32Array {
  const index = new Map(ids.map((id, i) => [id, i]));
  const adjacent = ids.map(() => new Set<number>());
  for (const edge of edges) {
    const a = index.get(edge.sourceId);
    const b = index.get(edge.targetId);
    if (a === undefined || b === undefined || a === b) continue;
    // Reciprocal facts still draw separately, but do not double physical affinity.
    adjacent[a].add(b);
    adjacent[b].add(a);
  }
  const visit = ids.map((_, i) => i).sort((a, b) => ids[a] < ids[b] ? -1 : ids[a] > ids[b] ? 1 : 0);
  const degree = adjacent.map(neighbours => neighbours.size);
  const total = Float64Array.from(degree);
  const community = Int32Array.from(ids.map((_, i) => i));
  const twiceEdges = degree.reduce((sum, count) => sum + count, 0);
  for (let pass = 0; twiceEdges > 0 && pass < 24; pass += 1) {
    let moved = false;
    for (const i of visit) {
      if (degree[i] === 0) continue;
      const previous = community[i];
      const weights = new Map<number, number>();
      for (const neighbour of adjacent[i]) {
        const group = community[neighbour];
        weights.set(group, (weights.get(group) ?? 0) + 1);
      }
      total[previous] -= degree[i];
      const score = (group: number) => (weights.get(group) ?? 0) - degree[i] * total[group] / twiceEdges;
      let best = previous;
      let bestScore = score(previous);
      const candidates = [...weights.keys()].sort((a, b) => ids[a] < ids[b] ? -1 : 1);
      for (const group of candidates) {
        const candidate = score(group);
        if (candidate > bestScore + 1e-9) {
          best = group;
          bestScore = candidate;
        }
      }
      community[i] = best;
      total[best] += degree[i];
      if (best !== previous) moved = true;
    }
    if (!moved) break;
  }

  // Local moves can strand a small triangle at the end of a long branch even
  // when moving that whole triangle improves modularity. Aggregate communities
  // by the same positive-gain criterion, with a fixed work ceiling.
  for (let pass = 0; twiceEdges > 0 && pass < 64; pass += 1) {
    const between = new Map<number, Map<number, number>>();
    for (const i of visit) {
      for (const j of adjacent[i]) {
        const a = community[i];
        const b = community[j];
        if (ids[a] >= ids[b]) continue;
        const row = between.get(a) ?? new Map<number, number>();
        row.set(b, (row.get(b) ?? 0) + 1);
        between.set(a, row);
      }
    }
    let bestA = -1;
    let bestB = -1;
    let bestGain = 1e-9;
    const ordered = [...between.keys()].sort((a, b) => ids[a] < ids[b] ? -1 : 1);
    for (const a of ordered) {
      const row = between.get(a)!;
      const neighbours = [...row.keys()].sort((a, b) => ids[a] < ids[b] ? -1 : 1);
      for (const b of neighbours) {
        const gain = row.get(b)! - total[a] * total[b] / twiceEdges;
        if (gain > bestGain) { bestA = a; bestB = b; bestGain = gain; }
      }
    }
    if (bestA < 0) break;
    for (const i of visit) if (community[i] === bestB) community[i] = bestA;
    total[bestA] += total[bestB];
    total[bestB] = 0;
  }

  // A bridge can leave its old community during a local move. Split disconnected
  // remnants: spatial cohesion must never imply a path which does not exist.
  const result = new Int32Array(ids.length).fill(-1);
  let group = 0;
  for (const start of visit) {
    if (result[start] !== -1) continue;
    const queue = [start];
    result[start] = group;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      for (const neighbour of adjacent[queue[cursor]]) {
        if (result[neighbour] !== -1 || community[neighbour] !== community[start]) continue;
        result[neighbour] = group;
        queue.push(neighbour);
      }
    }
    group += 1;
  }
  return result;
}
