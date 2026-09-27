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

/** Same `total`, byte-identical node and edge order. */
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
      // Orphans (5%): no parent edge, empty `projectIds`.
      nodes.push(makeNode(id, `Element ${e}`, "element", []));
      continue;
    }
    if (r === 4 || r === 8 || r === 12 || r === 16) {
      // Domain-direct (20%).
      const parentDomain = `synth-domain-${e % counts.domain}`;
      nodes.push(makeNode(id, `Element ${e}`, "element", [PROJECT_ID]));
      edges.push(makeContainsEdge(parentDomain, id));
      continue;
    }
    // Capability-direct (75%), concentrated on low indices by the power law.
    const parentCap = `synth-cap-${skewedCapabilityIndex(e, counts.capability)}`;
    nodes.push(makeNode(id, `Element ${e}`, "element", [PROJECT_ID]));
    edges.push(makeContainsEdge(parentCap, id));
  }

  return { nodes, edges, counts };
}
