import type { KnowledgeGraphEdge, KnowledgeGraphNode } from "@/entities/knowledge-graph";

/**
 * Deterministic synthetic graph for the map's hidden `?synth=N` parameter — the
 * only way to see `computeConcentricLayout` / `relaxCollisions` at node counts
 * the bundled dogfood sample never reaches. No `Math.random`: the same N always
 * derives the same graph.
 *
 * It ships in the production demo but never runs without the parameter and is
 * documented nowhere but here. The derived graph flows into the map adapter only
 * — it never touches the user's vault or the single source of truth on disk.
 *
 * **The distribution is the shape of a real vault (corrected 2026-07-31).**
 * The old distribution derived `round(sqrt(n) / 2)` capabilities and spread
 * elements over them round-robin, so n=3000 gave 27 capabilities holding 2954
 * elements — **82 children per capability on average**. This repo's own vault
 * (dogfood, 98 nodes) measures very differently:
 *
 * | | direct children |
 * |---|---|
 * | median | **3** |
 * | mean | 7.2 |
 * | max | **92** (`capabilities/cli-developer-entry`, the only one) |
 * | second | 54 |
 * | the other 42 parents | single digits to mid-teens |
 *
 * So reality is one or two hubs plus an extreme long tail, and the old synth
 * built a world where 27 hubs coexist — a vault that does not exist. Every
 * performance number taken on it was a phantom baseline (steward ruling,
 * 2026-07-31).
 *
 * Both halves had to change: swapping the distribution function alone cannot
 * help, because with only 27 capabilities **any** distribution still averages 82.
 *
 * 1. Capability count is **proportional to node count** (`CAPABILITY_SHARE`).
 * 2. Element assignment follows a **power law**, so one capability becomes a hub
 *    and the rest stay in single digits.
 *
 * The rest is unchanged: `round(sqrt(n) / 3)` domains, 20% of elements attached
 * straight to a domain, 5% orphaned, class decided by `index % 20`.
 */

/**
 * Capability share of all nodes, taken from the measured vault (38 capabilities
 * / 98 nodes ~= 0.39). Too small a share inflates children per parent, and the
 * map then gets tuned against a density that does not exist.
 */
const CAPABILITY_SHARE = 0.15;

/**
 * Power-law exponent — higher concentrates more into a single hub.
 *
 * **Fitted, not picked.** The target was the measured vault's two numbers
 * (median 3, max 92), found by sweeping a `CAPABILITY_SHARE` x skew grid for the
 * combination that hits both (1.8 -> max 65 / 2.2 -> 119 / **2.0 -> 89**).
 * Measured at n=3000: median 3, p90 8, max 89. As n grows the median stays at 3
 * and only the hub grows, the way `cli-developer-entry` accumulated over rounds.
 */
const CAPABILITY_SKEW = 2.0;

export const SYNTH_MIN = 100;
export const SYNTH_MAX = 10000;

const PROJECT_ID = "synth-project";
// Fixed timestamp so successive derivations stay byte-identical (no `Date.now`).
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

/** Clamps raw `?synth=` input into [SYNTH_MIN, SYNTH_MAX]; null when not a number. */
export function clampSynthSize(raw: number): number | null {
  if (!Number.isFinite(raw)) return null;
  const rounded = Math.round(raw);
  if (rounded < SYNTH_MIN) return SYNTH_MIN;
  if (rounded > SYNTH_MAX) return SYNTH_MAX;
  return rounded;
}

/** Pure count derivation — the one source shared by the synthesizer and its tests. */
export function computeSynthCounts(total: number): SynthVaultCounts {
  const s = Math.sqrt(total);
  const domain = Math.max(1, Math.round(s / 3));
  // Proportional to node count: sqrt(n) yields too few parents, and children per
  // parent then inflate past anything a real vault shows (table above).
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

/**
 * Maps an element index to a capability index under a power law biased toward
 * the front: a deterministic [0,1) from `hash(e)`, raised to `CAPABILITY_SKEW`.
 * Capabilities 0-1 become hubs and the tail thins out sharply — the measured
 * vault's shape.
 */
function skewedCapabilityIndex(e: number, capabilityCount: number): number {
  if (capabilityCount <= 1) return 0;
  // Knuth multiplicative hash — keeps adjacent indices off adjacent capabilities.
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

/** Same `total` derives a byte-identical node/edge order; re-clamps defensively. */
export function synthesizeVaultGraph(total: number): SynthVaultGraph {
  const n = clampSynthSize(total) ?? SYNTH_MIN;
  const counts = computeSynthCounts(n);
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
    const parentDomain = `synth-domain-${c % counts.domain}`;
    nodes.push(makeNode(id, `Capability ${c}`, "capability", [PROJECT_ID]));
    edges.push(makeContainsEdge(parentDomain, id));
  }

  for (let e = 0; e < counts.element; e += 1) {
    const id = `synth-el-${e}`;
    const r = e % 20;
    if (r === 0) {
      // Orphans (5%) — outside containment: no parent edge, empty `projectIds`.
      nodes.push(makeNode(id, `Element ${e}`, "element", []));
      continue;
    }
    if (r === 4 || r === 8 || r === 12 || r === 16) {
      // Domain-direct (20%) — contained by a domain with no capability in between.
      const parentDomain = `synth-domain-${e % counts.domain}`;
      nodes.push(makeNode(id, `Element ${e}`, "element", [PROJECT_ID]));
      edges.push(makeContainsEdge(parentDomain, id));
      continue;
    }
    // Capability-direct (75%), power-law. Round-robin (`e % capability`) inflates
    // every capability equally; the measured vault is one hub (92) plus a long
    // tail (median 3), so the mapping concentrates on the low indices.
    const parentCap = `synth-cap-${skewedCapabilityIndex(e, counts.capability)}`;
    nodes.push(makeNode(id, `Element ${e}`, "element", [PROJECT_ID]));
    edges.push(makeContainsEdge(parentCap, id));
  }

  return { nodes, edges, counts };
}
