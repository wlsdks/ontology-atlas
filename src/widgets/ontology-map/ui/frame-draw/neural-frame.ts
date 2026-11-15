import type { NeuralImpact } from "../../model/dome-view/neural-impact";
import type { NeuralTokens } from "../../tokens/read-neural-tokens";

/** One cluster's soft light and the screen box of its cells, which a domain's title stands above. */
export interface NeuralPool {
  domainId: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  /** The highest cell top in the cluster. */
  top: number;
  /** The domain cell's alpha before the focus veil, and its depth. */
  alpha: number;
  depth: number;
  /** The light: centre, radius and alpha. */
  x: number;
  y: number;
  reachPx: number;
  lightAlpha: number;
}

/**
 * What Neural draws this frame, in screen CSS px with depth `u` from the dome frame (0 near, 1 far).
 * Every painter strokes this one description, so a click selects the painted cell. Buffers are reused
 * across frames and grow only with the graph; cells are indexed like `world.nodes`.
 */
export interface NeuralFrame {
  width: number;
  height: number;
  /** Neural's ramp: 1 when it paints alone, below 1 while it crossfades with the flat map. */
  neural: number;
  tokens: NeuralTokens;

  cellCount: number;
  cellX: Float64Array;
  cellY: Float64Array;
  cellR: Float64Array;
  cellU: Float64Array;
  /** Alpha after depth and the focus veil; `cellRestAlpha` is before the veil. */
  cellAlpha: Float64Array;
  cellRestAlpha: Float64Array;
  /** 0 element, 1 capability, 2 domain, 3 project. */
  cellKind: Uint8Array;
  /** 1 when the cell's evidence is stale: drawn in the warning ink. */
  cellStale: Uint8Array;
  /** 1 for the focus and the direct ends it lights at full strength. */
  cellLit: Uint8Array;
  /** A selection's distance per cell: 0 the focus, k a dependent k hops out, −1 outside or no selection. */
  cellHop: Int32Array;
  /** The cells to draw, far to near, already culled by alpha and the viewport. */
  drawOrder: Int32Array;
  drawCount: number;

  /** Each drawn axon's end a (dependent), control and end b (dependency). */
  axonCount: number;
  axonAX: Float64Array;
  axonAY: Float64Array;
  axonCX: Float64Array;
  axonCY: Float64Array;
  axonBX: Float64Array;
  axonBY: Float64Array;
  /** Rest batch: `(between clusters × depth tones + tone) × 2 + from a capability`, −1 when drawn lit only. */
  axonGroup: Int8Array;
  /** Alpha per rest batch, indexed by `axonGroup`. */
  groupAlpha: Float64Array;
  /** Lit axons: drawn axon index, far end's cell, world edge index, hop (0 a need, k ≥ 1 a dependent), alpha. */
  litCount: number;
  litAxon: Int32Array;
  litFarNode: Int32Array;
  litEdge: Int32Array;
  litHop: Int32Array;
  litAlpha: Float64Array;

  pools: NeuralPool[];
  poolCount: number;

  focusId: string | null;
  /** The focus's cell index, −1 when none. */
  focusIndex: number;
  /** The ring around a lit focus; `alpha` 0 when none is drawn. */
  focusRing: { x: number; y: number; r: number; alpha: number };
  /** The focus ramp, 0 at rest and 1 when the focus is fully lit. */
  ramp: number;
  /** The ends a lit focus or axon lights, null at rest. */
  sets: { needs: ReadonlySet<string>; usedBy: ReadonlySet<string> } | null;
  impact: NeuralImpact | null;
  /** How many hops a selection's spread has travelled. */
  spread: number;
  /** How far a direct signal has run along each lit axon, 1 when it has arrived. */
  travel: number;
  /** What the focus leaves of an unlit cell's and an unlit axon's alpha. */
  veilCell: number;
  veilAxon: number;
  /** How much zooming in past the whole-cloud fit has grown the cells. */
  zoomGrowth: number;
}

/**
 * A painter that draws a {@link NeuralFrame} instead of the canvas-2D strokes. It returns the context
 * names are drawn on, or null when it cannot paint this frame and the canvas-2D strokes must.
 */
export interface NeuralSurface {
  paint(frame: NeuralFrame): CanvasRenderingContext2D | null;
}
