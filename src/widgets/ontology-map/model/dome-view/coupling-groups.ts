/**
 * Layout-only communities from actual adjacency, never declared domains: at most 24 local
 * modularity passes (Blondel et al., 2008), each O(N + E), then 64 single best-pair merges,
 * each O(community links) over a community adjacency kept up to date across merges. Stable
 * visitation by id rank and strict positive gains keep reloads deterministic.
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
    // Reciprocal facts do not double physical affinity.
    adjacent[a].add(b);
    adjacent[b].add(a);
  }
  const visit = ids.map((_, i) => i).sort((a, b) => ids[a] < ids[b] ? -1 : ids[a] > ids[b] ? 1 : 0);
  const rank = new Int32Array(ids.length);
  visit.forEach((i, position) => {
    rank[i] = position;
  });
  const degree = adjacent.map(neighbours => neighbours.size);
  const total = Float64Array.from(degree);
  const community = Int32Array.from(ids.map((_, i) => i));
  const twiceEdges = degree.reduce((sum, count) => sum + count, 0);
  const weight = new Float64Array(ids.length);
  const touched: number[] = [];
  const byRank = (a: number, b: number) => rank[a] - rank[b];
  for (let pass = 0; twiceEdges > 0 && pass < 24; pass += 1) {
    let moved = false;
    for (const i of visit) {
      if (degree[i] === 0) continue;
      const previous = community[i];
      touched.length = 0;
      for (const neighbour of adjacent[i]) {
        const group = community[neighbour];
        if (weight[group] === 0) touched.push(group);
        weight[group] += 1;
      }
      total[previous] -= degree[i];
      let best = previous;
      let bestScore = weight[previous] - degree[i] * total[previous] / twiceEdges;
      touched.sort(byRank);
      for (const group of touched) {
        const candidate = weight[group] - degree[i] * total[group] / twiceEdges;
        if (candidate > bestScore + 1e-9) {
          best = group;
          bestScore = candidate;
        }
      }
      for (const group of touched) weight[group] = 0;
      community[i] = best;
      total[best] += degree[i];
      if (best !== previous) moved = true;
    }
    if (!moved) break;
  }

  // Aggregate communities by the same positive-gain rule: local moves alone can strand a
  // small triangle at the end of a long branch. The pass count is a fixed work ceiling.
  const links = new Map<number, Map<number, number>>();
  const linksOf = (group: number): Map<number, number> => {
    let row = links.get(group);
    if (row === undefined) {
      row = new Map<number, number>();
      links.set(group, row);
    }
    return row;
  };
  for (const i of visit) {
    for (const j of adjacent[i]) {
      const a = community[i];
      const b = community[j];
      if (rank[a] >= rank[b]) continue;
      linksOf(a).set(b, (linksOf(a).get(b) ?? 0) + 1);
      linksOf(b).set(a, (linksOf(b).get(a) ?? 0) + 1);
    }
  }
  for (let pass = 0; twiceEdges > 0 && pass < 64; pass += 1) {
    let bestA = -1;
    let bestB = -1;
    let bestGain = 1e-9;
    for (const [a, row] of links) {
      for (const [b, count] of row) {
        if (rank[a] >= rank[b]) continue;
        const gain = count - total[a] * total[b] / twiceEdges;
        const earlier = bestA >= 0 && (rank[a] < rank[bestA] || (a === bestA && rank[b] < rank[bestB]));
        if (gain > bestGain || (gain === bestGain && earlier)) {
          bestA = a;
          bestB = b;
          bestGain = gain;
        }
      }
    }
    if (bestA < 0) break;
    const merged = links.get(bestB)!;
    const survivor = links.get(bestA)!;
    links.delete(bestB);
    survivor.delete(bestB);
    for (const [other, count] of merged) {
      if (other === bestA) continue;
      survivor.set(other, (survivor.get(other) ?? 0) + count);
      const row = links.get(other)!;
      row.delete(bestB);
      row.set(bestA, (row.get(bestA) ?? 0) + count);
    }
    for (const i of visit) if (community[i] === bestB) community[i] = bestA;
    total[bestA] += total[bestB];
    total[bestB] = 0;
  }

  // Split disconnected remnants a bridge left behind, or spatial cohesion would imply a
  // path that does not exist.
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
