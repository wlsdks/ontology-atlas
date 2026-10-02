import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * Deterministic synthetic graph for the hidden `?synth=N` parameter, to see layout at sizes the
 * sample never reaches. No `Math.random`: the same N derives the same graph, and it never touches
 * the user's vault. The shape mirrors a measured vault (median 3 children per parent, one hub near
 * 92), or performance numbers measure a vault that does not exist: capabilities scale with n
 * (`CAPABILITY_SHARE`) and elements follow a power law. `round(sqrt(n) / 3)` domains, 20%
 * domain-direct, 5% orphans, class by `index % 20`.
 */

/**
 * Too small a share inflates children per parent, and the map gets tuned against a density that
 * does not exist.
 */
const CAPABILITY_SHARE = 0.15;

/**
 * Higher concentrates more into one hub. Fitted to median 3 and max 92 (2.0 gives max 89 at
 * n=3000).
 */
const CAPABILITY_SKEW = 2.0;

export const SYNTH_MIN = 100;
export const SYNTH_MAX = 10000;

const PROJECT_ID = "synth-project";
// Fixed so derivations stay byte-identical.
const FIXED_TS = new Date(0);
const APPROVED_BY = "synth";

export interface SynthVaultCounts {
  project: number;
  domain: number;
  capability: number;
  element: number;
  directElements: number;
  orphanElements: number;
}

export interface SynthVaultGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  counts: SynthVaultCounts;
}

export function clampSynthSize(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded < SYNTH_MIN) return SYNTH_MIN;
  if (rounded > SYNTH_MAX) return SYNTH_MAX;
  return rounded;
}

/** Shared by the synthesizer and its tests. */
export function computeSynthCounts(total: number): SynthVaultCounts {
  const s = Math.sqrt(total);
  const domain = Math.max(1, Math.round(s / 3));
  // sqrt(n) parents would inflate children per parent past any real vault.
  const capability = Math.max(1, Math.min(total - 2 - domain, Math.round(total * CAPABILITY_SHARE)));
  const element = Math.max(0, total - 1 - domain - capability);
  let directElements = 0;
  let orphanElements = 0;
  for (let e = 0; e < element; e += 1) {
    const r = e % 20;
    if (r === 0) orphanElements += 1;
    else if (r === 4 || r === 8 || r === 12 || r === 16) directElements += 1;
  }
  return { project: 1, domain, capability, element, directElements, orphanElements };
}

/** Power law toward the front: a deterministic [0,1) from `hash(e)` raised to `CAPABILITY_SKEW`. */
function skewedCapabilityIndex(e: number, capabilityCount: number): number {
  if (capabilityCount <= 1) return 0;
  // Knuth multiplicative hash keeps adjacent indices off adjacent capabilities.
  const u = ((e * 2654435761) >>> 0) / 4294967296;
  const idx = Math.floor(capabilityCount * Math.pow(u, CAPABILITY_SKEW));
  return Math.min(capabilityCount - 1, idx);
}

function makeNode(
  id: string,
  title: string,
  kind: KnowledgeGraphNode["kind"],
  projectIds: string[],
): KnowledgeGraphNode {
  return {
    id,
    title,
    kind,
    projectIds,
    evidenceIds: [],
    lastApprovedAt: FIXED_TS,
    lastApprovedBy: APPROVED_BY,
  };
}

function makeContainsEdge(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}->${to}`,
    from,
    to,
    type: "contains",
    projectIds: [PROJECT_ID],
    evidenceIds: [],
    lastApprovedAt: FIXED_TS,
    lastApprovedBy: APPROVED_BY,
  };
}

function makeDependsEdge(from: string, to: string): KnowledgeGraphEdge {
  return {
    id: `${from}~>${to}`,
    from,
    to,
    type: "depends_on",
    projectIds: [PROJECT_ID],
    evidenceIds: [],
    lastApprovedAt: FIXED_TS,
    lastApprovedBy: APPROVED_BY,
  };
}

function unitHash(value: number): number {
  let h = Math.imul(value | 0, 0x9e3779b1) ^ 0x6a09e667;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

export const SYNTH_SAME_DOMAIN_DEPENDENCY_SHARE = 0.76;
const SYNTH_NEIGHBOUR_DOMAIN_STEPS = [1, 2, 5] as const;
export const SYNTH_UNKNOWN_EVIDENCE_SHARE = 0.05;

export type SynthShape = "uniform" | "layered";

export interface SynthVaultOptions {
  dependencies?: boolean;
  shape?: SynthShape;
}

const LAYERED_TARGET_DECAY = 1.25;

function permutedDomains(count: number, salt: number): number[] {
  return Array.from({ length: count }, (_, d) => d).sort(
    (a, b) => unitHash(a * 13 + salt) - unitHash(b * 13 + salt) || a - b,
  );
}

function capabilityDomains(counts: SynthVaultCounts, shape: SynthShape): number[] {
  if (shape === "uniform") return Array.from({ length: counts.capability }, (_, c) => c % counts.domain);
  const bySize = permutedDomains(counts.domain, 7);
  return Array.from({ length: counts.capability }, (_, c) => {
    if (c < counts.domain) return bySize[c];
    const rank = Math.floor(counts.domain * Math.pow(unitHash(c * 5 + 11), CAPABILITY_SKEW));
    return bySize[Math.min(counts.domain - 1, rank)];
  });
}

function synthElementDomain(e: number, counts: SynthVaultCounts, capDomain: readonly number[]): number {
  const r = e % 20;
  if (r === 0) return -1;
  if (r === 4 || r === 8 || r === 12 || r === 16) return e % counts.domain;
  return capDomain[skewedCapabilityIndex(e, counts.capability)];
}

function layeredTargetPicker(domainCount: number): (domain: number, u: number) => number {
  const byRank = permutedDomains(domainCount, 3);
  const cumulative: number[] = [];
  let total = 0;
  for (let t = 0; t < domainCount; t += 1) {
    total += 1 / Math.pow(1 + t, LAYERED_TARGET_DECAY);
    cumulative.push(total);
  }
  return (domain, u) => {
    const at = u * total;
    let t = cumulative.findIndex((c) => at < c);
    if (t < 0) t = domainCount - 1;
    const target = byRank[t];
    return target === domain ? byRank[(t + 1) % domainCount] : target;
  };
}

function synthDependencies(counts: SynthVaultCounts, shape: SynthShape, capDomain: readonly number[]): KnowledgeGraphEdge[] {
  const capabilitiesOf: number[][] = Array.from({ length: counts.domain }, () => []);
  const elementsOf: number[][] = Array.from({ length: counts.domain }, () => []);
  for (let c = 0; c < counts.capability; c += 1) capabilitiesOf[capDomain[c]].push(c);
  for (let e = 0; e < counts.element; e += 1) {
    const domain = synthElementDomain(e, counts, capDomain);
    if (domain >= 0) elementsOf[domain].push(e);
  }
  const layeredTarget = shape === "layered" ? layeredTargetPicker(counts.domain) : null;
  const targetDomain = (domain: number, seed: number): number => {
    if (counts.domain === 1 || unitHash(seed * 3) < SYNTH_SAME_DOMAIN_DEPENDENCY_SHARE) return domain;
    if (layeredTarget) return layeredTarget(domain, unitHash(seed * 3 + 1));
    const step = SYNTH_NEIGHBOUR_DOMAIN_STEPS[Math.floor(unitHash(seed * 3 + 1) * SYNTH_NEIGHBOUR_DOMAIN_STEPS.length)];
    return (domain + step) % counts.domain;
  };
  const pick = (list: readonly number[], seed: number): number | undefined =>
    list[Math.floor(unitHash(seed * 3 + 2) * list.length)];
  const edges: KnowledgeGraphEdge[] = [];
  const seen = new Set<string>();
  const add = (from: string, to: string) => {
    const edge = makeDependsEdge(from, to);
    if (from === to || seen.has(edge.id)) return;
    seen.add(edge.id);
    edges.push(edge);
  };
  for (let c = 0; c < counts.capability; c += 1) {
    for (let k = 0; k < 2; k += 1) {
      const seed = c * 2 + k;
      const target = pick(capabilitiesOf[targetDomain(capDomain[c], seed)], seed);
      if (target !== undefined) add(`synth-cap-${c}`, `synth-cap-${target}`);
    }
  }
  for (let e = 0; e < counts.element; e += 1) {
    const domain = synthElementDomain(e, counts, capDomain);
    if (domain < 0 || e % 10 >= 7) continue;
    const seed = counts.capability * 2 + e;
    const target = pick(elementsOf[targetDomain(domain, seed)], seed);
    if (target !== undefined) add(`synth-el-${e}`, `synth-el-${target}`);
  }
  return edges;
}

export function synthesizeEvidenceStates(ids: readonly string[], staleShare: number): Map<string, "current" | "stale"> {
  const states = new Map<string, "current" | "stale">();
  ids.forEach((id, i) => {
    const u = unitHash(i * 7 + 5);
    if (u < staleShare) states.set(id, "stale");
    else if (u >= staleShare + SYNTH_UNKNOWN_EVIDENCE_SHARE) states.set(id, "current");
  });
  return states;
}

/** Same `total` and options, byte-identical node and edge order. */
export function synthesizeVaultGraph(total: number, options: SynthVaultOptions = {}): SynthVaultGraph {
  const n = clampSynthSize(total) ?? SYNTH_MIN;
  const counts = computeSynthCounts(n);
  const shape = options.shape ?? "uniform";
  const capDomain = capabilityDomains(counts, shape);
  const nodes: KnowledgeGraphNode[] = [];
  const edges: KnowledgeGraphEdge[] = [];

  nodes.push(makeNode(PROJECT_ID, "Synthetic vault", "project", [PROJECT_ID]));

  for (let d = 0; d < counts.domain; d += 1) {
    const id = `synth-domain-${d}`;
    nodes.push(makeNode(id, `Domain ${d}`, "domain", [PROJECT_ID]));
    edges.push(makeContainsEdge(PROJECT_ID, id));
  }

  for (let c = 0; c < counts.capability; c += 1) {
    const id = `synth-cap-${c}`;
    const parentDomain = `synth-domain-${capDomain[c]}`;
    nodes.push(makeNode(id, `Capability ${c}`, "capability", [PROJECT_ID]));
    edges.push(makeContainsEdge(parentDomain, id));
  }

  for (let e = 0; e < counts.element; e += 1) {
    const id = `synth-el-${e}`;
    const r = e % 20;
    if (r === 0) {
      nodes.push(makeNode(id, `Element ${e}`, "element", []));
      continue;
    }
    if (r === 4 || r === 8 || r === 12 || r === 16) {
      const parentDomain = `synth-domain-${e % counts.domain}`;
      nodes.push(makeNode(id, `Element ${e}`, "element", [PROJECT_ID]));
      edges.push(makeContainsEdge(parentDomain, id));
      continue;
    }
    const parentCap = `synth-cap-${skewedCapabilityIndex(e, counts.capability)}`;
    nodes.push(makeNode(id, `Element ${e}`, "element", [PROJECT_ID]));
    edges.push(makeContainsEdge(parentCap, id));
  }

  if (options.dependencies === true) edges.push(...synthDependencies(counts, shape, capDomain));

  return { nodes, edges, counts };
}
