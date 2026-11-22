import type { HexBoardLayout } from "./hex-board";
import type { HexRouteJob } from "./hex-router";

/** Domain-to-domain canals drawn at rest, at every band (spec §7). */
const REST_CANALS = 14;

export type FocusJob = HexRouteJob<"need" | "use" | "need-inside">;
export type CanalJob = HexRouteJob<"canal">;

export interface CanalPlan {
  jobs: CanalJob[];
  /** `from>to` domain ids → the flow a laid route draws. */
  flows: Map<string, { count: number; twoWay: boolean }>;
}

export interface FocusPlan {
  lit: Set<string> | null;
  jobs: FocusJob[];
  region: string | null;
}

export const NO_FOCUS: FocusPlan = { lit: null, jobs: [], region: null };

/** The resting canals as routing jobs: the busiest domain pairs, up to `REST_CANALS`. */
export function planCanals(layout: HexBoardLayout | null): CanalPlan {
  const plan: CanalPlan = { jobs: [], flows: new Map() };
  if (!layout) return plan;
  const regionById = new Map(layout.regions.map((r) => [r.domainId, r] as const));
  for (const flow of layout.canals.slice(0, REST_CANALS)) {
    const a = regionById.get(flow.fromDomain);
    const b = regionById.get(flow.toDomain);
    if (!a || !b) continue;
    const bundle = `${a.domainId}>${b.domainId}`;
    plan.jobs.push({ from: [a.domainId, ...a.capabilityIds], to: [b.domainId, ...b.capabilityIds], bundle, role: "canal" });
    plan.flows.set(bundle, { count: flow.count, twoWay: flow.twoWay });
  }
  return plan;
}

/**
 * Who stays lit, and the focus routes, for the selection, or for the hover when nothing is
 * selected. Stale-only with no selection lights every stale capability and its domain, with no
 * routes. A project or element tile focuses nothing.
 */
export function computeFocusPlan(
  layout: HexBoardLayout | null,
  selectedId: string | null,
  hoverId: string | null,
  staleOnly: boolean,
  evidence: ReadonlyMap<string, string>,
): FocusPlan {
  if (!layout) return NO_FOCUS;
  const id = selectedId && layout.byId.has(selectedId) ? selectedId : null;
  const subject = id ?? hoverId;
  if (staleOnly && !id) {
    const lit = new Set<string>();
    for (const c of layout.capabilities)
      if (evidence.get(c.id) === "stale") {
        lit.add(c.id);
        if (c.domainId) lit.add(c.domainId);
      }
    return { lit, jobs: [], region: null };
  }
  if (!subject) return NO_FOCUS;
  const tile = layout.byId.get(subject);
  if (!tile) return NO_FOCUS;
  const jobs: FocusJob[] = [];
  const lit = new Set<string>([subject]);
  if (tile.kind === "capability") {
    if (tile.domainId) lit.add(tile.domainId);
    const needs = layout.dependencies.filter((d) => d.from === subject).sort((a, b) => ((layout.byId.get(a.to)?.domainId ?? "") < (layout.byId.get(b.to)?.domainId ?? "") ? -1 : 1));
    for (const d of needs) {
      lit.add(d.to);
      jobs.push({ from: [subject], to: [d.to], bundle: `need:${layout.byId.get(d.to)?.domainId}`, role: "need" });
    }
    for (const d of layout.dependencies.filter((x) => x.to === subject)) {
      lit.add(d.from);
      jobs.push({ from: [d.from], to: [subject], bundle: "use", role: "use" });
    }
  } else if (tile.kind === "domain") {
    const region = layout.regions.find((r) => r.domainId === subject);
    const found: { from: string; to: string; inside: boolean }[] = [];
    for (const capId of region?.capabilityIds ?? []) {
      lit.add(capId);
      for (const d of layout.dependencies.filter((x) => x.from === capId)) {
        const inside = layout.byId.get(d.to)?.domainId === subject;
        found.push({ from: capId, to: d.to, inside });
        lit.add(d.to);
      }
    }
    found.sort((a, b) => Number(a.inside) - Number(b.inside));
    if (id)
      for (const j of found)
        jobs.push({ from: [j.from], to: [j.to], bundle: j.inside ? "inside" : `need:${layout.byId.get(j.to)?.domainId}`, role: j.inside ? "need-inside" : "need" });
    return { lit: id ? lit : null, jobs, region: id ? subject : null };
  } else {
    return NO_FOCUS;
  }
  return { lit: id ? lit : null, jobs, region: null };
}
