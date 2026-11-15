import { layoutCone } from './cone-layout';
import { createCouplingCloudRelaxer } from './coupling-cloud';
import { DOME_FIT_RADIUS } from './projection';
import { buildStrataTargets } from './strata';
import type { DomeArrangement, DomeInputNode, DomeModel, DomeSector } from './types';

export const DOME_BUILD_SLICE_MS = 4;

export interface DomeModelBuild {
  /** Drawable from the start: a coupling build rewrites its coords after every finished iteration. */
  model: DomeModel;
  /** null means already complete. */
  step: ((budgetMs: number) => boolean) | null;
}

/**
 * Builds the ownership seed at once and hands only the coupling cloud's relaxation to `step`
 * (see `CouplingCloudRelaxer`).
 */
export function beginDomeModelBuild(
  nodes: readonly DomeInputNode[],
  options?: {
    /** Defaults to `ownership`. */
    arrangement?: DomeArrangement;
    /** Omitted, the coupling arrangement matches ownership. */
    edges?: readonly { sourceId: string; targetId: string }[];
  },
): DomeModelBuild {
  let cx = 0;
  let cy = 0;
  for (const n of nodes) {
    cx += n.x;
    cy += n.y;
  }
  const count = Math.max(1, nodes.length);
  cx /= count;
  cy /= count;
  let radius = 0;
  for (const n of nodes) {
    const d = Math.hypot(n.x - cx, n.y - cy);
    if (d > radius) radius = d;
  }
  // Floor so a tiny vault does not collapse to a point.
  const unit = Math.max(radius, 220) / DOME_FIT_RADIUS;

  const arrangement = options?.arrangement ?? "ownership";
  /* The cone tree seeds both the cone and the coupling cloud's warm start. */
  const { coords, circles, sectors } =
    arrangement === "strata"
      ? buildStrataTargets(nodes, options?.edges ?? [])
      : { ...layoutCone(nodes), sectors: [] as DomeSector[] };

  const model: DomeModel = {
    centerX: cx,
    centerY: cy,
    unit,
    coords,
    arrangement,
    // The cloud has no cone bases, which would assert a coordinate system relations did not
    // produce; Strata's circles are its four planes.
    circles: arrangement === "coupling" ? [] : circles,
    sectors,
  };
  if (arrangement === "coupling" && options?.edges && options.edges.length > 0) {
    const relaxer = createCouplingCloudRelaxer(coords, nodes, options.edges);
    return { model, step: (budgetMs: number) => relaxer.step(budgetMs) };
  }
  return { model, step: null };
}

export function sameDomeLayoutInputs(
  a: { nodes: readonly { id: string; kind: string; parentId: string | null }[]; edges: readonly { sourceId: string; targetId: string }[] },
  b: { nodes: readonly { id: string; kind: string; parentId: string | null }[]; edges: readonly { sourceId: string; targetId: string }[] },
): boolean {
  if (a.nodes.length !== b.nodes.length || a.edges.length !== b.edges.length) return false;
  for (let i = 0; i < a.nodes.length; i += 1) {
    const x = a.nodes[i];
    const y = b.nodes[i];
    if (x.id !== y.id || x.kind !== y.kind || x.parentId !== y.parentId) return false;
  }
  for (let i = 0; i < a.edges.length; i += 1) {
    if (a.edges[i].sourceId !== b.edges[i].sourceId || a.edges[i].targetId !== b.edges[i].targetId) return false;
  }
  return true;
}

export function buildDomeModel(
  nodes: readonly DomeInputNode[],
  options?: {
    /** Defaults to `ownership`. */
    arrangement?: DomeArrangement;
    /** Omitted, the coupling arrangement matches ownership. */
    edges?: readonly { sourceId: string; targetId: string }[];
  },
): DomeModel {
  const build = beginDomeModelBuild(nodes, options);
  if (build.step !== null) {
    while (!build.step(Number.POSITIVE_INFINITY)) {
      // step(∞) finishes in one call.
    }
  }
  return build.model;
}
