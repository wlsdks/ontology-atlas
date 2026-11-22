import type { ConeCircle, ConeCoord, ConeInputNode, ConeKind } from './cone-layout';

/**
 * The opt-in 3D view, where height and bearing carry typed facts or relations place nodes.
 * Opt-in because 3D multiplies edge crossings (`docs/DECISIONS.md`). Draw, hit test and
 * instrumentation share one frame map (`DomeRuntime.frame`). A node drags only within its kind plane.
 */
export type DomeViewKind = ConeKind;
export type DomeInputNode = ConeInputNode;
export type DomeCoord = ConeCoord;
export type DomeCircle = ConeCircle;

/** The spine order of `docs/ONTOLOGY-ATLAS-SPEC.md` §2: the fact height carries. */
export const KIND_DEPTH: Readonly<Record<DomeViewKind, number>> = {
  project: 0,
  domain: 1,
  capability: 2,
  element: 3,
};

export interface DomeModel {
  /** A coupling cloud has no kind planes, so drawing latitude rings would be a lie. */
  arrangement: DomeArrangement;
  /** The dome sits on it, for camera continuity. */
  centerX: number;
  centerY: number;
  /** Sized so the element ring overlaps the 2D layout radius. */
  unit: number;
  coords: Map<string, DomeCoord>;
  /** Ownership only; empty for the cloud. */
  circles: DomeCircle[];
  /** Strata only, else empty. */
  sectors: DomeSector[];
}

/**
 * The bearing arc `[from, to)` a node's whole subtree is dealt into. `buildStrataTargets`
 * keeps descendants inside and siblings disjoint, so drawing it shows a proven fact.
 */
export interface DomeSector {
  id: string;
  kind: DomeViewKind;
  from: number;
  to: number;
}

/**
 * Arrangement `ownership` (default) is the cone: height is the tier and bearing comes from
 * containment. `coupling` is the cloud: a deterministic force layout lets relations decide all three
 * coordinates, a genuinely different question.
 */
/**
 * Arrangement `strata` answers the same containment question as `ownership`, drawn as stacked labelled
 * planes (`buildStrataTargets`; `docs/DECISIONS.md` for the declined three.js probe).
 */
export type DomeArrangement = "ownership" | "coupling" | "strata";
