import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { aimTreeProjector, createTreeProjector } from "../../model/tree-view/tree-camera";
import { cutTreeDetail, TREE_MARK_BUDGET } from "../../model/tree-view/tree-detail";
import {
  createTreeCrowns,
  findTreeCrowns,
  placeTreeNames,
  treeDomainOf,
  treeNameCandidates,
  trunkBlockReservePx,
  type TreeCrowns,
} from "../../model/tree-view/tree-names";
import type {
  TreeDrawList,
  TreeFocus,
  TreeLayout,
  TreeModel,
  TreeNameCandidate,
  TreeNamePlacement,
  TreeNameSide,
  TreeNodeKind,
  TreePose,
  TreeProjector,
  TreeRect,
  TreeScreenPoint,
} from "../../model/tree-view/tree-shapes";
import { hexMapChrome } from "../../morph/hex-marks";
import type { TreeTokens } from "../../tokens/read-tree-tokens";
import { paintTreeFrame, treeNameFont } from "../../tree-view/tree-paint";

/** The tree keeps this far (CSS px) above its own legend. */
const FOOTER_CLEAR_PX = 8;

/**
 * The map the tree may fill, relative to the canvas: the canvas less the chrome over it (the
 * chrome inside `board` excepted), and less everything from the board's own footer down.
 */
export function readTreeFreeArea(canvas: HTMLCanvasElement | null, board: Element | null, footerTopPx: number | null): TreeRect | null {
  const free = hexMapChrome(canvas, board)?.free;
  if (!free) return null;
  if (footerTopPx == null) return free;
  const bottom = Math.min(free.y + free.height, footerTopPx - FOOTER_CLEAR_PX);
  return bottom - free.y > 0 ? { x: free.x, y: free.y, width: free.width, height: bottom - free.y } : free;
}

/** The rectangle the camera fits: `free` less the room the trunk's name block needs under the base. */
export function treeFitRect(free: TreeRect, trunkReservePx: number): TreeRect {
  return trunkReservePx > 0 && trunkReservePx < free.height ? { ...free, height: free.height - trunkReservePx } : free;
}

/** Aims `projector` at `pose` to fit the tree in `fit`, and cuts its detail for a canvas of `width` x `height` CSS px. */
export function cutTreeAtPose(
  layout: TreeLayout,
  tokens: Pick<TreeTokens, "marks" | "detail">,
  pose: TreePose,
  canvas: { width: number; height: number },
  fit: TreeRect,
  reveal: readonly number[],
  projector: TreeProjector,
  out: TreeDrawList,
): void {
  aimTreeProjector(projector, layout, pose, canvas, fit);
  cutTreeDetail(
    {
      layout,
      projector,
      view: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      marks: tokens.marks,
      openPitchPx: tokens.detail.openPitchPx,
      leafPitchPx: tokens.detail.leafPitchPx,
      markBudget: TREE_MARK_BUDGET,
      reveal,
    },
    out,
  );
}

/** Writes `treeFitRect(free, trunkReservePx)` into `out`, so a per-frame caller allocates nothing. */
function fitInto(free: TreeRect, trunkReservePx: number, out: TreeRect): TreeRect {
  const shrinks = trunkReservePx > 0 && trunkReservePx < free.height;
  out.x = free.x;
  out.y = free.y;
  out.width = free.width;
  out.height = shrinks ? free.height - trunkReservePx : free.height;
  return out;
}

let measureContext: CanvasRenderingContext2D | null | undefined;
/** Width of `text` in `font`; a rough per-character width where no canvas can measure. */
function measureInFont(text: string, font: string, fontPx: number): number {
  if (measureContext === undefined) measureContext = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!measureContext) return text.length * fontPx * 0.6;
  measureContext.font = font;
  return measureContext.measureText(text).width;
}

const KIND_FONT_PX: Record<TreeNodeKind, (tokens: TreeTokens) => number> = {
  project: (t) => t.names.project,
  domain: (t) => t.names.domain,
  capability: (t) => t.names.capability,
  element: (t) => t.names.element,
  fork: (t) => t.names.capability,
};

/** A name's measured width per kind and text, in the font the painter draws it in; cached per text. */
function createNameMeasure(tokens: TreeTokens, family: string): (text: string, kind: TreeNodeKind) => number {
  const widths = new Map<string, number>();
  return (text, kind) => {
    const key = `${kind}\u0000${text}`;
    let width = widths.get(key);
    if (width === undefined) {
      width = measureInFont(text, treeNameFont(kind, tokens, family), KIND_FONT_PX[kind](tokens));
      widths.set(key, width);
    }
    return width;
  };
}

const measureNothing = () => 0;

export interface TreeFrameSources {
  layout: TreeLayout | null;
  /** The model whose labels name the marks; the loose shoot's caption is set here, not in the layout. */
  nameModel: TreeModel | null;
  tokens: TreeTokens | null;
  /** CSS pixels. */
  size: { width: number; height: number } | null;
  dpr: number;
  stale: Uint8Array | null;
  focus: TreeFocus | null;
  subOf: (node: number) => string | null;
  /** The family names are measured and painted in. */
  fontFamily: string;
}

export interface TreeFrame {
  /**
   * Draws one frame at `pose` fitted to `free` and grown to `growth` (0..1). `keep` re-checks the
   * names it holds and adds none; null places names afresh. False while a source is missing.
   */
  draw: (pose: TreePose, keep: ReadonlyMap<number, TreeNameSide> | null, growth: number, free: TreeRect) => boolean;
  /** Where `node`'s mark would stand at `pose` fitted to `free`, without drawing; false while a source is missing. */
  locate: (pose: TreePose, node: number, free: TreeRect, out: TreeScreenPoint) => boolean;
  /** The rectangle the camera fits for `free`, the anchor `zoomTreePoseAbout` needs. Pooled: read it at once. */
  fitOf: (free: TreeRect) => TreeRect;
  list: RefObject<TreeDrawList>;
  names: RefObject<TreeNamePlacement>;
  projector: RefObject<TreeProjector>;
  frames: RefObject<number>;
}

interface CutKey {
  layout: TreeLayout | null;
  tokens: TreeTokens | null;
  width: number;
  height: number;
  freeX: number;
  freeY: number;
  freeWidth: number;
  freeHeight: number;
  trunkReservePx: number;
  reveal: number;
  yaw: number;
  pitch: number;
  zoom: number;
  panX: number;
  panY: number;
}

interface NamesKey {
  cut: number;
  nameModel: TreeModel | null;
  focus: TreeFocus | null;
  subOf: TreeFrameSources["subOf"] | null;
  measure: ((text: string, kind: TreeNodeKind) => number) | null;
  keep: ReadonlyMap<number, TreeNameSide> | null;
}

const sameCut = (a: CutKey, b: CutKey) =>
  a.layout === b.layout && a.tokens === b.tokens && a.width === b.width && a.height === b.height &&
  a.freeX === b.freeX && a.freeY === b.freeY && a.freeWidth === b.freeWidth && a.freeHeight === b.freeHeight &&
  a.trunkReservePx === b.trunkReservePx && a.reveal === b.reveal &&
  a.yaw === b.yaw && a.pitch === b.pitch && a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY;

const sameNames = (a: NamesKey, b: NamesKey) =>
  a.cut === b.cut && a.nameModel === b.nameModel && a.focus === b.focus && a.subOf === b.subOf && a.measure === b.measure && a.keep === b.keep;

/**
 * Assembles a frame from its sources: aim and cut, then names, then paint. The cut and the names
 * are redone only when their own inputs changed, so a new stale set or focus ring repaints without
 * cutting again. Pooled lists live in refs for the interaction that drives other poses.
 */
export function useTreeFrame(canvasRef: RefObject<HTMLCanvasElement | null>, sources: TreeFrameSources): TreeFrame {
  const { layout, nameModel, tokens, size, dpr, stale, focus, subOf, fontFamily } = sources;
  const list = useRef<TreeDrawList>({ marks: [], count: 0, visited: 0, folded: 0 });
  const names = useRef<TreeNamePlacement>({ boxes: [], count: 0, dropped: 0, tested: 0 });
  const [pooledProjector] = useState(createTreeProjector);
  const projector = useRef<TreeProjector>(pooledProjector);
  const [locator] = useState(createTreeProjector);
  const [fit] = useState<TreeRect>(() => ({ x: 0, y: 0, width: 0, height: 0 }));
  const frames = useRef(0);
  const candidates = useRef<TreeNameCandidate[]>([]);
  const crowns = useRef<TreeCrowns | null>(null);
  const reveal = useRef<number[]>([]);
  const cutVersion = useRef(0);
  const cutKey = useRef<CutKey | null>(null);
  const namesKey = useRef<NamesKey | null>(null);
  const measure = useMemo(() => (tokens ? createNameMeasure(tokens, fontFamily) : measureNothing), [tokens, fontFamily]);
  const domainOf = useMemo(() => (layout ? treeDomainOf(layout.model) : null), [layout]);
  const trunkReservePx = useMemo(
    () => (nameModel && tokens ? trunkBlockReservePx(nameModel, subOf, tokens.names, tokens.marks.project) : 0),
    [nameModel, subOf, tokens],
  );

  const draw = useCallback(
    (pose: TreePose, keep: ReadonlyMap<number, TreeNameSide> | null, growth: number, free: TreeRect): boolean => {
      const canvas = canvasRef.current;
      if (!canvas || !layout || !domainOf || !nameModel || !tokens || !size || size.width <= 0 || size.height <= 0) return false;
      const revealNode = focus ? focus.node : -1;
      const nextCut: CutKey = {
        layout, tokens, width: size.width, height: size.height,
        freeX: free.x, freeY: free.y, freeWidth: free.width, freeHeight: free.height, trunkReservePx, reveal: revealNode,
        yaw: pose.yaw, pitch: pose.pitch, zoom: pose.zoom, panX: pose.panX, panY: pose.panY,
      };
      if (!cutKey.current || !sameCut(cutKey.current, nextCut)) {
        reveal.current.length = 0;
        if (revealNode >= 0) reveal.current.push(revealNode);
        cutTreeAtPose(layout, tokens, pose, size, fitInto(free, trunkReservePx, fit), reveal.current, projector.current, list.current);
        if (!crowns.current || crowns.current.radius.length < layout.model.count) crowns.current = createTreeCrowns(layout.model.count);
        findTreeCrowns(layout.model, layout.position, domainOf, list.current, projector.current, crowns.current);
        cutKey.current = nextCut;
        cutVersion.current += 1;
      }
      const nextNames: NamesKey = { cut: cutVersion.current, nameModel, focus, subOf, measure, keep };
      if (!namesKey.current || !sameNames(namesKey.current, nextNames)) {
        const count = treeNameCandidates(list.current, nameModel, focus, measure, subOf, tokens.names, tokens.detail.elementNamePitchPx, candidates.current);
        placeTreeNames(candidates.current, count, list.current, free, keep, names.current, tokens.names, crowns.current);
        namesKey.current = nextNames;
      }
      const backingWidth = Math.round(size.width * dpr);
      const backingHeight = Math.round(size.height * dpr);
      if (canvas.width !== backingWidth) canvas.width = backingWidth;
      if (canvas.height !== backingHeight) canvas.height = backingHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        paintTreeFrame(
          ctx,
          { width: size.width, height: size.height, dpr, layout, list: list.current, names: names.current, projector: projector.current, stale, focus, growth },
          tokens,
        );
      }
      frames.current += 1;
      return true;
    },
    [canvasRef, layout, domainOf, nameModel, tokens, size, dpr, stale, focus, subOf, measure, trunkReservePx, fit],
  );

  const locate = useCallback(
    (pose: TreePose, node: number, free: TreeRect, out: TreeScreenPoint): boolean => {
      if (!layout || !size || node < 0 || node >= layout.model.count) return false;
      aimTreeProjector(locator, layout, pose, size, fitInto(free, trunkReservePx, fit));
      if (node === 0) locator.project(0, 0, 0, out);
      else locator.project(layout.position[node * 3]!, layout.position[node * 3 + 1]!, layout.position[node * 3 + 2]!, out);
      return true;
    },
    [layout, size, trunkReservePx, locator, fit],
  );

  const fitOf = useCallback((free: TreeRect): TreeRect => fitInto(free, trunkReservePx, fit), [trunkReservePx, fit]);

  return { draw, locate, fitOf, list, names, projector, frames };
}
