import { typeAllowed } from '../query-operation/query-primitives.mjs';

export function pageRankScores(nodes, outgoingEdgesBySlug, iterations) {
  const totalNodes = nodes.length;
  if (totalNodes === 0) return new Map();
  const damping = 0.85;
  let scores = new Map(nodes.map((node) => [node.slug, 1 / totalNodes]));
  const slugs = nodes.map((node) => node.slug);
  const uniqueTargetsBySlug = new Map(
    slugs.map((slug) => [
      slug,
      [...new Set((outgoingEdgesBySlug.get(slug) || []).map((edge) => edge.to))],
    ]),
  );

  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const nextScores = new Map(slugs.map((slug) => [slug, (1 - damping) / totalNodes]));
    let danglingMass = 0;
    for (const slug of slugs) {
      const score = scores.get(slug) || 0;
      const uniqueTargets = uniqueTargetsBySlug.get(slug) || [];
      if (uniqueTargets.length === 0) {
        danglingMass += score;
        continue;
      }
      const share = score / uniqueTargets.length;
      for (const target of uniqueTargets) {
        nextScores.set(target, nextScores.get(target) + damping * share);
      }
    }
    if (danglingMass > 0) {
      const danglingShare = (damping * danglingMass) / totalNodes;
      for (const target of slugs) {
        nextScores.set(target, nextScores.get(target) + danglingShare);
      }
    }
    scores = nextScores;
  }

  return scores;
}

export function undirectedAdjacencyFrom(nodes, edges, typeSet) {
  const adjacency = new Map(nodes.map((node) => [node.slug, new Set()]));
  for (const edge of edges) {
    if (!edge.resolved || !typeAllowed(edge.via, typeSet)) continue;
    adjacency.get(edge.from)?.add(edge.to);
    adjacency.get(edge.to)?.add(edge.from);
  }
  return adjacency;
}

export function propagateCommunityLabels(adjacency, iterations) {
  const labels = new Map([...adjacency.keys()].map((slug) => [slug, slug]));
  const slugs = [...adjacency.keys()].sort();
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    let changed = false;
    for (const slug of slugs) {
      const counts = new Map();
      for (const neighbor of [...(adjacency.get(slug) || [])].sort()) {
        const label = labels.get(neighbor) || neighbor;
        counts.set(label, (counts.get(label) || 0) + 1);
      }
      if (counts.size === 0) continue;
      const nextLabel = [...counts.entries()].sort(
        ([leftLabel, leftCount], [rightLabel, rightCount]) =>
          rightCount - leftCount || leftLabel.localeCompare(rightLabel),
      )[0][0];
      if (labels.get(slug) !== nextLabel) {
        labels.set(slug, nextLabel);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return labels;
}

export function similarityScore(source, target, sourceNeighbors, targetNeighbors) {
  const slug = tokenJaccard(source.slug, target.slug) * 0.35;
  const title = tokenJaccard(source.title, target.title) * 0.35;
  const kind = source.kind && target.kind && source.kind === target.kind ? 0.1 : 0;
  const domain = source.domain && target.domain && source.domain === target.domain ? 0.1 : 0;
  const neighbors = setJaccard(sourceNeighbors, targetNeighbors) * 0.1;
  return {
    slug,
    title,
    kind,
    domain,
    neighbors,
    total: slug + title + kind + domain + neighbors,
  };
}

function tokenJaccard(left, right) {
  return setJaccard(new Set(textTokens(left)), new Set(textTokens(right)));
}

function textTokens(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 2);
}

function setJaccard(left, right) {
  // O(min(|left|, |right|)) work and O(1) extra space.
  if (!left || !right || left.size === 0 || right.size === 0) return 0;
  let intersection = 0;
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  for (const value of smaller) {
    if (larger.has(value)) intersection += 1;
  }
  const union = left.size + right.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export function roundScore(value) {
  return Number(value.toFixed(6));
}
