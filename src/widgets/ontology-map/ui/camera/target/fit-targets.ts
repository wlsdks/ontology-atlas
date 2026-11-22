import type { CameraTarget } from "../../../engine/camera";
import type { OntologyMapTokens } from "../../../tokens/read-map-tokens";
import { centerForInsets, readSafeInsets, type OverviewFitOptions, type SafeInsetTokens } from "./safe-insets";

/** Centers `bounds` in the viewport, clamped to `[scaleMin, maxScale]`. */
export function fitWorldTarget(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  maxScale: number,
  scaleMin: number,
): CameraTarget {
  const w = Math.max(1, bounds.maxX - bounds.minX);
  const h = Math.max(1, bounds.maxY - bounds.minY);
  let scale = Math.min(viewportWidth / w, viewportHeight / h);
  scale = Math.min(scale, maxScale);
  scale = Math.max(scale, scaleMin);
  return {
    tx: (bounds.minX + bounds.maxX) / 2,
    ty: (bounds.minY + bounds.maxY) / 2,
    tscale: scale,
  };
}

/**
 * A graph with this many nodes or fewer counts as "small" for the overview-fit ceiling: a just-onboarded vault has a
 * minuscule spine bbox that the plain fit blows up to `cameraScaleMax`, so it is capped at `cameraSmallGraphScaleMax`.
 */
const SMALL_GRAPH_NODE_MAX = 5;

/** The screen area the overview fit fills: the viewport less its chrome insets and the fit's pad. */
function overviewFitArea(
  viewportWidth: number,
  viewportHeight: number,
  tokens: SafeInsetTokens,
  fit?: OverviewFitOptions,
): { width: number; height: number } {
  const insets = readSafeInsets(tokens, viewportWidth, viewportHeight, fit?.padPx, fit?.labelBottomAllowance);
  return { width: Math.max(1, viewportWidth - insets.left - insets.right), height: Math.max(1, viewportHeight - insets.top - insets.bottom) };
}

/** The world-to-screen area the overview's entry camera shows: the fit area at the entry ratio. */
export function overviewEntryArea(
  viewportWidth: number,
  viewportHeight: number,
  tokens: SafeInsetTokens & Pick<OntologyMapTokens, "overviewEntryRatio">,
  fit?: OverviewFitOptions,
): { width: number; height: number } {
  const area = overviewFitArea(viewportWidth, viewportHeight, tokens, fit);
  return { width: area.width * tokens.overviewEntryRatio, height: area.height * tokens.overviewEntryRatio };
}

/**
 * The tight-fit scale against the VISIBLE area (viewport minus the fixed
 * chrome). This is the altitude band's "100%" anchor (`overviewScaleRef`) —
 * derived here so the anchor and the panel-aware overview target stay in sync.
 */
export function computeOverviewFitScale(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  tokens: Pick<OntologyMapTokens, "cameraScaleMax" | "cameraScaleMin" | "cameraSmallGraphScaleMax"> & SafeInsetTokens,
  /**
   * Total node count. When ≤ `SMALL_GRAPH_NODE_MAX`, the fit is capped at
   * `cameraSmallGraphScaleMax` so a tiny vault doesn't over-zoom. Omitted: no small-graph clamp.
   */
  nodeCount?: number,
  fit?: OverviewFitOptions,
): number {
  const { width: effW, height: effH } = overviewFitArea(viewportWidth, viewportHeight, tokens, fit);
  const maxScale =
    nodeCount !== undefined && nodeCount <= SMALL_GRAPH_NODE_MAX
      ? Math.min(tokens.cameraScaleMax, tokens.cameraSmallGraphScaleMax)
      : tokens.cameraScaleMax;
  return fitWorldTarget(bounds, effW, effH, maxScale, fit?.scaleFloor ?? tokens.cameraScaleMin).tscale;
}

/**
 * The overview entry scale is the tight fit times `--map-overview-entry-ratio` (0.95), kept
 * above the far-high ratio (0.92) so `farT` lands at 0 on load. It anchors `overviewScaleRef`;
 * zooming out still crosses `farHigh` to `farLow`.
 */
/**
 * Panel-aware overview fit: the zoom is computed against the VISIBLE area (viewport minus the safe
 * insets) and the camera is shifted so the graph's own center lands at that area's center, not the
 * raw screen center, so no part of the graph hides behind a panel. Zero insets is the plain fit.
 */
export function computeOverviewCameraTarget(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  tokens: Pick<OntologyMapTokens, "cameraScaleMax" | "cameraScaleMin" | "cameraSmallGraphScaleMax" | "overviewEntryRatio"> & SafeInsetTokens,
  /** Total node count, forwarded to the small-graph fit clamp. */
  nodeCount?: number,
  fit?: OverviewFitOptions,
): CameraTarget {
  const insets = readSafeInsets(tokens, viewportWidth, viewportHeight, fit?.padPx, fit?.labelBottomAllowance);
  const fitScale = computeOverviewFitScale(bounds, viewportWidth, viewportHeight, tokens, nodeCount, fit);
  const tscale = Math.min(tokens.cameraScaleMax, Math.max(fit?.scaleFloor ?? tokens.cameraScaleMin, fitScale * tokens.overviewEntryRatio));
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  // worldToScreen centers on the raw screen midpoint; offset the camera so the
  // graph center renders at the visible-area midpoint instead.
  return { ...centerForInsets(centerX, centerY, insets, tscale), tscale };
}

/**
 * The lens fit (expand-all, recent-changes spotlight): fits the lens bounds into the width beside
 * the side panels and centres them. Top and bottom lanes are not reserved: the lens bounds carry
 * their own 18% padding (`runSpotlightFit`). With zero insets this is exactly `fitWorldTarget`.
 */
export function computeLensFitTarget(
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  tokens: Pick<OntologyMapTokens, "cameraScaleMax" | "cameraScaleMin"> & SafeInsetTokens,
): CameraTarget {
  const insets = { left: tokens.safeInsetLeft ?? 0, right: tokens.safeInsetRight ?? 0, top: 0, bottom: 0 };
  const fit = fitWorldTarget(
    bounds,
    Math.max(1, viewportWidth - insets.left - insets.right),
    viewportHeight,
    tokens.cameraScaleMax,
    tokens.cameraScaleMin,
  );
  return { ...centerForInsets(fit.tx, fit.ty, insets, fit.tscale), tscale: fit.tscale };
}

/** Half the area a dome fit fills round its centre, in screen px: the free canvas times the fill, less a disc. */
export function domeFitFreeHalfSize(
  viewportWidth: number,
  viewportHeight: number,
  insets: { left: number; right: number; top: number; bottom: number },
  nodeRadiusPx: number,
  tokens: { domeFitFill: number },
): { halfW: number; halfH: number } {
  const effW = Math.max(1, viewportWidth - insets.left - insets.right);
  const effH = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const fill = tokens.domeFitFill > 0 ? tokens.domeFitFill : 1;
  return { halfW: Math.max(1, effW * fill - nodeRadiusPx * 2) / 2, halfH: Math.max(1, effH * fill - nodeRadiusPx * 2) / 2 };
}

/**
 * The cone's own fit: fill the free canvas, not the safe rect, since the overview fit's static insets
 * describe the 2D map. Free canvas = canvas minus measured panels (`interaction/free-area.ts`) minus
 * the `insets` bands; `nodeRadiusPx` is subtracted (`DOME_NODE_PX`). No padding beyond `fill`.
 */
export function computeDomeFitCameraTarget(
  /** The projected bounds of the node **centres** (world units). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
  viewportWidth: number,
  viewportHeight: number,
  /** Live panel obstruction plus the cone's own top/bottom bands, in screen px. */
  insets: { left: number; right: number; top: number; bottom: number },
  /** Half the widest disc the cone draws, in screen px. */
  nodeRadiusPx: number,
  tokens: Pick<OntologyMapTokens, "cameraScaleMax" | "cameraScaleMin"> & { domeFitFill: number },
): CameraTarget {
  const free = domeFitFreeHalfSize(viewportWidth, viewportHeight, insets, nodeRadiusPx, tokens);
  const availW = free.halfW * 2;
  const availH = free.halfH * 2;
  const spanX = Math.max(1e-6, bounds.maxX - bounds.minX);
  const spanY = Math.max(1e-6, bounds.maxY - bounds.minY);
  const tscale = Math.min(
    tokens.cameraScaleMax,
    Math.min(availW / spanX, availH / spanY),
  );
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;
  return { ...centerForInsets(centerX, centerY, insets, tscale), tscale };
}
