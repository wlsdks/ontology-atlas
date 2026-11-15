"use client";

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { aimTreeProjector, createTreeProjector } from "../../model/tree-view/tree-camera";
import { cutTreeDetail, TREE_MARK_BUDGET } from "../../model/tree-view/tree-detail";
import { placeTreeNames, treeNameCandidates, type TreeCrownCircles } from "../../model/tree-view/tree-names";
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
} from "../../model/tree-view/types";
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

/** Aims `projector` at `pose` and cuts the tree's detail for a canvas of `width` x `height` CSS px. */
export function cutTreeAtPose(
  layout: TreeLayout,
  tokens: Pick<TreeTokens, "marks" | "detail">,
  pose: TreePose,
  canvas: { width: number; height: number },
  free: TreeRect,
  reveal: readonly number[],
  projector: TreeProjector,
  out: TreeDrawList,
): void {
  aimTreeProjector(projector, layout, pose, canvas, free);
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

/** Pooled crown circles; `written` lists the nodes set last time so a refill clears only those. */
interface CrownScratch { circles: TreeCrownCircles; written: number[]; point: TreeScreenPoint }

function createCrownScratch(): CrownScratch {
  return { circles: { x: new Float32Array(0), y: new Float32Array(0), radius: new Float32Array(0) }, written: [], point: { x: 0, y: 0, scale: 0, depth: 0 } };
}

/** Projects the bound sphere of each drawn domain's subtree to a screen circle. O(drawn marks). */
function projectTreeCrowns(layout: TreeLayout, list: TreeDrawList, projector: TreeProjector, scratch: CrownScratch): TreeCrownCircles {
  const { circles, written, point } = scratch;
  const { model, bound } = layout;
  if (circles.radius.length < model.count) {
    circles.x = new Float32Array(model.count);
    circles.y = new Float32Array(model.count);
    circles.radius = new Float32Array(model.count);
    written.length = 0;
  }
  for (const node of written) circles.radius[node] = 0;
  written.length = 0;
  for (let i = 0; i < list.count; i += 1) {
    const node = list.marks[i]!.node;
    if (model.kinds[node] !== "domain") continue;
    projector.project(bound[node * 4]!, bound[node * 4 + 1]!, bound[node * 4 + 2]!, point);
    circles.x[node] = point.x;
    circles.y[node] = point.y;
    circles.radius[node] = bound[node * 4 + 3]! * projector.unit * point.scale;
    written.push(node);
  }
  return circles;
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
  free: TreeRect | null;
  stale: Uint8Array | null;
  focus: TreeFocus | null;
  subOf: (node: number) => string | null;
  /** The family names are measured and painted in. */
  fontFamily: string;
}

export interface TreeFrame {
  /** Draws one frame at `pose`; false when a source is still missing. */
  draw: (pose: TreePose, keep: ReadonlyMap<number, TreeNameSide> | null) => boolean;
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
  free: TreeRect | null;
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
  a.layout === b.layout && a.tokens === b.tokens && a.width === b.width && a.height === b.height && a.free === b.free && a.reveal === b.reveal &&
  a.yaw === b.yaw && a.pitch === b.pitch && a.zoom === b.zoom && a.panX === b.panX && a.panY === b.panY;

const sameNames = (a: NamesKey, b: NamesKey) =>
  a.cut === b.cut && a.nameModel === b.nameModel && a.focus === b.focus && a.subOf === b.subOf && a.measure === b.measure && a.keep === b.keep;

/**
 * Assembles a frame from its sources: aim and cut, then names, then paint. The cut and the names
 * are redone only when their own inputs changed, so a new stale set or focus ring repaints without
 * cutting again. Pooled lists live in refs for the interaction that drives other poses.
 */
export function useTreeFrame(canvasRef: RefObject<HTMLCanvasElement | null>, sources: TreeFrameSources): TreeFrame {
  const { layout, nameModel, tokens, size, dpr, free, stale, focus, subOf, fontFamily } = sources;
  const list = useRef<TreeDrawList>({ marks: [], count: 0, visited: 0, folded: 0 });
  const names = useRef<TreeNamePlacement>({ boxes: [], count: 0, dropped: 0, tested: 0 });
  const [pooledProjector] = useState(createTreeProjector);
  const projector = useRef<TreeProjector>(pooledProjector);
  const frames = useRef(0);
  const candidates = useRef<TreeNameCandidate[]>([]);
  const crowns = useRef<CrownScratch | null>(null);
  const reveal = useRef<number[]>([]);
  const cutVersion = useRef(0);
  const cutKey = useRef<CutKey | null>(null);
  const namesKey = useRef<NamesKey | null>(null);
  const measure = useMemo(() => (tokens ? createNameMeasure(tokens, fontFamily) : measureNothing), [tokens, fontFamily]);

  const draw = useCallback(
    (pose: TreePose, keep: ReadonlyMap<number, TreeNameSide> | null): boolean => {
      const canvas = canvasRef.current;
      if (!canvas || !layout || !nameModel || !tokens || !size || !free || size.width <= 0 || size.height <= 0) return false;
      const revealNode = focus ? focus.node : -1;
      const nextCut: CutKey = { layout, tokens, width: size.width, height: size.height, free, reveal: revealNode, yaw: pose.yaw, pitch: pose.pitch, zoom: pose.zoom, panX: pose.panX, panY: pose.panY };
      if (!cutKey.current || !sameCut(cutKey.current, nextCut)) {
        reveal.current.length = 0;
        if (revealNode >= 0) reveal.current.push(revealNode);
        cutTreeAtPose(layout, tokens, pose, size, free, reveal.current, projector.current, list.current);
        projectTreeCrowns(layout, list.current, projector.current, (crowns.current ??= createCrownScratch()));
        cutKey.current = nextCut;
        cutVersion.current += 1;
      }
      const nextNames: NamesKey = { cut: cutVersion.current, nameModel, focus, subOf, measure, keep };
      if (!namesKey.current || !sameNames(namesKey.current, nextNames)) {
        const count = treeNameCandidates(list.current, nameModel, focus, measure, subOf, tokens.names, tokens.detail.elementNamePitchPx, candidates.current);
        placeTreeNames(candidates.current, count, list.current, free, keep, names.current, tokens.names, crowns.current?.circles ?? null);
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
          { width: size.width, height: size.height, dpr, layout, list: list.current, names: names.current, projector: projector.current, stale, focus, growth: 1 },
          tokens,
        );
      }
      frames.current += 1;
      return true;
    },
    [canvasRef, layout, nameModel, tokens, size, dpr, free, stale, focus, subOf, measure],
  );

  return { draw, list, names, projector, frames };
}
