import type { DialModel } from "../dial/types";

/** How a lit line reads: what the focus needs, what needs it, a symmetric relation, a broader concept. */
export type GraphLineKind = "needs" | "neededBy" | "relates" | "broader";

/** Bits of the frame summary's `lineKinds`: the line kinds the map draws now, resting arcs included. */
export const FLAT_LINE_BITS: Readonly<Record<GraphLineKind | "rest", number>> = { needs: 1, neededBy: 2, relates: 4, broader: 8, rest: 16 };

/** One relation drawn for the focus; a taper is wide at `from` and points at `to`. */
export interface GraphLine {
  from: string;
  to: string;
  kind: GraphLineKind;
  /** `kind:from>to`, built once so a frame can report the line without allocating. */
  key: string;
}

export interface GraphAttention {
  key: string;
  focusId: string | null;
  selected: boolean;
  /** Concepts drawn at full ink; null means the rest picture, where everything is. */
  lit: ReadonlySet<string> | null;
  /** The relations the focus draws, one per far capability. */
  lines: readonly GraphLine[];
  /** Distinct capabilities a focused capability needs and is needed by; null for other kinds. */
  reach: { needs: number; neededBy: number } | null;
  /** Concepts a lit picture must name: the focus and every line's far end. */
  named: ReadonlySet<string>;
}

const NONE: ReadonlySet<string> = new Set();
const REST: GraphAttention = { key: "rest", focusId: null, selected: false, lit: null, lines: [], reach: null, named: NONE };

function domainMembers(model: DialModel, domainId: string, into: Set<string>): void {
  const d = model.domainById.get(domainId);
  if (!d) return;
  into.add(domainId);
  for (const id of d.capabilityIds) {
    into.add(id);
    for (const el of model.capabilityById.get(id)?.elementIds ?? []) into.add(el);
  }
  for (const el of d.directElementIds) into.add(el);
}

/**
 * One capability's own relations as lines, the connections its detail panel lists
 * (`groupConnectionsByRole`): one line per far concept per side, outgoing and incoming apart. A
 * dependency outranks `is_a` toward the same concept, and either outranks a symmetric relation.
 * O(capability relations).
 */
export function capabilityLines(model: DialModel, capabilityId: string): GraphLine[] {
  const lines: GraphLine[] = [];
  const seen = new Set<string>();
  const relations = model.capabilityRelations ?? [];
  const add = (from: string, to: string, kind: GraphLineKind) => {
    const outgoing = from === capabilityId;
    const far = outgoing ? to : from;
    const side = kind === "relates" ? "" : outgoing ? ">" : "<";
    if (seen.has(`${side}${far}`) || (kind === "relates" && (seen.has(`>${far}`) || seen.has(`<${far}`)))) return;
    seen.add(`${side}${far}`);
    lines.push({ from, to, kind, key: `${kind}:${from}>${to}` });
  };
  for (const r of relations) {
    if (r.kind !== "depends") continue;
    if (r.from === capabilityId) add(r.from, r.to, "needs");
    else if (r.to === capabilityId) add(r.from, r.to, "neededBy");
  }
  for (const r of relations) {
    if (r.kind === "broader" && (r.from === capabilityId || r.to === capabilityId)) add(r.from, r.to, "broader");
  }
  for (const r of relations) {
    if (r.kind !== "relates") continue;
    if (r.from === capabilityId) add(r.from, r.to, "relates");
    else if (r.to === capabilityId) add(r.to, r.from, "relates");
  }
  return lines;
}

/** The panel's two directed totals: distinct concepts the focus points at, and that point at it. */
export function reachCounts(lines: readonly GraphLine[], capabilityId: string): { needs: number; neededBy: number } {
  let needs = 0;
  let neededBy = 0;
  for (const line of lines) {
    if (line.kind === "relates") continue;
    if (line.from === capabilityId) needs += 1;
    else neededBy += 1;
  }
  return { needs, neededBy };
}

function capabilityReach(model: DialModel, capabilityId: string, into: Set<string>, named: Set<string>): GraphLine[] {
  const cap = model.capabilityById.get(capabilityId);
  if (!cap) return [];
  into.add(capabilityId);
  into.add(cap.domainId);
  for (const el of cap.elementIds) into.add(el);
  const lines = capabilityLines(model, capabilityId);
  for (const line of lines) {
    const far = line.from === capabilityId ? line.to : line.from;
    into.add(far);
    named.add(far);
  }
  return lines;
}

/**
 * The lit set: a domain lights itself and its members, a capability its domain, elements and every
 * capability it needs, is needed by, relates to or sits under, an element its capability's set.
 * The project sinks with the rest; pointing at the project lights nothing and brings back its spokes.
 * O(relations) per call; the frame caches by key.
 */
export function resolveGraphAttention(model: DialModel, focusId: string | null, selected: boolean): GraphAttention {
  if (focusId === null) return REST;
  const key = `${focusId}|${selected ? 1 : 0}`;
  if (focusId === model.projectId) return { ...REST, key, focusId, selected };
  const lit = new Set<string>();
  const named = new Set<string>([focusId]);
  let lines: GraphLine[] = [];
  if (model.domainById.has(focusId)) domainMembers(model, focusId, lit);
  else if (model.capabilityById.has(focusId)) lines = capabilityReach(model, focusId, lit, named);
  else {
    const owner = model.capabilityOf.get(focusId);
    if (owner) {
      lines = capabilityReach(model, owner, lit, named);
      named.add(owner);
    } else {
      const domain = model.domainOf.get(focusId);
      if (domain) lit.add(domain);
    }
    lit.add(focusId);
  }
  const reach = model.capabilityById.has(focusId) ? reachCounts(lines, focusId) : null;
  return { key, focusId, selected, lit, lines, reach, named };
}

const attentionCache = new WeakMap<DialModel, Map<string, GraphAttention>>();
const ATTENTION_CACHE_MAX = 64;

export function cachedGraphAttention(model: DialModel, focusId: string | null, selected: boolean): GraphAttention {
  let cache = attentionCache.get(model);
  if (!cache) {
    cache = new Map();
    attentionCache.set(model, cache);
  }
  const key = `${focusId ?? ""}|${selected ? 1 : 0}`;
  let hit = cache.get(key);
  if (!hit) {
    if (cache.size >= ATTENTION_CACHE_MAX) cache.clear();
    hit = resolveGraphAttention(model, focusId, selected);
    cache.set(key, hit);
  }
  return hit;
}

/** Ink of one concept under an attention: `rest` with nothing lit, full when lit, `sink` otherwise. */
export function inkUnder(attention: GraphAttention, id: string, sink: number, rest = 1): number {
  return attention.lit === null ? rest : attention.lit.has(id) ? 1 : sink;
}
