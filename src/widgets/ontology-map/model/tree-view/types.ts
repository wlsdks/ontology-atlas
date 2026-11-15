export type TreeNodeKind = "project" | "domain" | "capability" | "element" | "fork";

/** Preorder: a node's subtree is the index range [i, subtreeEnd[i]). Index 0 is the trunk. */
export interface TreeModel {
  count: number;
  /** Null for a fork and for the trunk of a vault with no project. */
  ids: readonly (string | null)[];
  labels: readonly string[];
  kinds: readonly TreeNodeKind[];
  parent: Int32Array;
  subtreeEnd: Int32Array;
  /** Counts over the subtree, the node included when it is of that kind. */
  concepts: Int32Array;
  capabilities: Int32Array;
  elements: Int32Array;
  indexOf: ReadonlyMap<string, number>;
  /** Directed `depends` relations as CSR lists over node indices. */
  needsStart: Int32Array;
  needs: Int32Array;
  usedByStart: Int32Array;
  usedBy: Int32Array;
  /** The fork holding every concept under no domain, or -1. */
  looseRoot: number;
}

export interface TreeLayout {
  model: TreeModel;
  /** 3 per node: x, y up, z. The trunk base is the origin; node 0 sits at the top of the trunk. */
  position: Float32Array;
  /** 6 per node: the inner control points of the cubic from the parent (the origin for node 0). */
  control: Float32Array;
  /** Branch thickness at the parent end and at the node end, world units. */
  widthStart: Float32Array;
  widthEnd: Float32Array;
  /** 4 per node: centre and radius of the sphere holding the subtree. */
  bound: Float32Array;
  /** Least distance between two children, world units; 0 for a leaf. */
  childPitch: Float32Array;
  /** Path length from the trunk base, 0..1. */
  reach: Float32Array;
  centre: readonly [number, number, number];
  radius: number;
}

/**
 * `x`, `y` are CSS pixels on the canvas. `scale` is perspective times zoom: 1 at the tree
 * centre's depth when zoom is 1. `depth` is the distance along the view axis; greater is farther.
 */
export interface TreeScreenPoint { x: number; y: number; scale: number; depth: number }
export interface TreeProjector {
  project(x: number, y: number, z: number, out: TreeScreenPoint): void;
  /** CSS pixels per world unit where `scale` is 1, so a world length shows as length * unit * scale. */
  unit: number;
  /** Depth of the tree sphere's nearest and farthest point; the same for every yaw. */
  near: number;
  far: number;
}
export interface TreePose { yaw: number; pitch: number; zoom: number; panX: number; panY: number }
export interface TreeRect { x: number; y: number; width: number; height: number }

export const TREE_TONE_STEPS = 8;
/** Dependency arcs drawn for one focus, and the arc ends whose names are pinned. */
export const TREE_ARC_BUDGET = 64;
export interface TreeDrawMark {
  node: number;
  /** CSS pixels; `radius` is the kind's size from `TreeMarkSizes` scaled for this depth and zoom. */
  x: number; y: number; radius: number; scale: number; depth: number;
  /** 0 far .. TREE_TONE_STEPS - 1 near. */
  tone: number;
  /** Its subtree is folded into this mark. */
  closed: boolean;
}
/** Pooled: marks[0..count) are valid, far to near. Node 0's mark is at the trunk base. */
export interface TreeDrawList { marks: TreeDrawMark[]; count: number; visited: number; folded: number }

/** Mark radii in CSS pixels where the projector's `scale` is 1; `bud` is a closed fork. */
export interface TreeMarkSizes { project: number; domain: number; capability: number; element: number; bud: number }
/**
 * Font sizes, the gap from a mark to its name and the padding kept around a name, CSS pixels;
 * `leading` is the line height as a multiple of the font size.
 */
export interface TreeNameSizes {
  project: number; domain: number; domainSub: number; capability: number; element: number;
  gap: number; pad: number; leading: number;
}
export interface TreeDetailInput {
  layout: TreeLayout; projector: TreeProjector; view: TreeRect; marks: TreeMarkSizes;
  openPitchPx: number; leafPitchPx: number; markBudget: number;
  /** Nodes given a mark of their own whatever the spacing: their ancestors open for them. */
  reveal: readonly number[];
}

export interface TreeFocus { node: number; selected: boolean; needs: readonly number[]; usedBy: readonly number[]; path: readonly number[] }

/** Where a name sits from its mark: 0 right, 1 left, 2 above, 3 below. */
export type TreeNameSide = 0 | 1 | 2 | 3;
/** `x`, `y`, `radius` are the mark's; `width`, `height` the measured text block. */
export interface TreeNameCandidate {
  node: number; text: string; sub: string | null;
  x: number; y: number; radius: number; width: number; height: number;
  priority: number; pinned: boolean;
}
/** `x`, `y` are the block's top-left corner, CSS pixels. */
export interface TreeNameBox { node: number; text: string; sub: string | null; x: number; y: number; width: number; height: number; side: TreeNameSide }
export interface TreeNamePlacement { boxes: TreeNameBox[]; count: number; dropped: number; tested: number }

export interface TreeFrameInput {
  width: number; height: number; dpr: number;
  layout: TreeLayout; list: TreeDrawList; names: TreeNamePlacement; projector: TreeProjector;
  /** By node index, 1 for a stale concept; null when evidence was not measured. */
  stale: Uint8Array | null;
  focus: TreeFocus | null;
  /** 0..1; 1 at rest. */
  growth: number;
}
