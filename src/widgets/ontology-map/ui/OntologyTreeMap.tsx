"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/map-canvas/focus-map-canvas";
import {
  DEFAULT_MAP_NAVIGATION_SPEED,
  type MapNavigationSpeed,
} from "@/shared/lib/preferences/map-navigation-speed-preferences";
import { layoutTree } from "../model/tree-view/tree-layout";
import { buildTreeModel, readTreeFocus } from "../model/tree-view/tree-model";
import type { TreeDrawList, TreeDrawMark, TreeModel, TreeNamePlacement, TreePose, TreeRect } from "../model/tree-view/tree-shapes";
import { treeMarks } from "../morph/tree-marks";
import { adoptBodyLabelFont, labelFontFamily } from "../render/labels";
import { readTreeTokens } from "../tokens/read-tree-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";
import { readTreeFreeArea, useTreeFrame } from "./tree-view/use-tree-frame";
import { treeMarkOf, useTreeInput } from "./tree-view/use-tree-input";
import { useTreeKeyboard } from "./tree-view/use-tree-keyboard";
import { useTreeMorphSnapshot } from "./tree-view/use-tree-morph-snapshot";
import { useTreeMotion } from "./tree-view/use-tree-motion";

export type TreeEvidenceState = "current" | "stale" | "unknown";

export interface TreeMapLabels {
  /** A domain's meta line; `stale` is null when evidence was not measured. */
  domainMeta: (facts: { capabilities: number; elements: number; stale: number | null }) => string;
  /** The trunk's meta line. */
  projectMeta: (facts: { concepts: number; stale: number | null }) => string;
  /** The caption of the shoot holding every concept under no domain. */
  looseCaption: (concepts: number) => string;
}

export interface TreeTooltipLabels {
  /** The hovered concept's name and facts; `stale` only when evidence was measured. */
  concept: (facts: { name: string; stale: boolean; needs: number; users: number; elements: number }) => string;
  /** A closed mark's name (empty for a fork) and what is folded inside it. */
  folded: (facts: { name: string; capabilities: number; elements: number }) => string;
}

export interface OntologyTreeMapProps {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  selectedId: string | null;
  /** Node id to evidence state; absent ids are unknown. */
  evidence: ReadonlyMap<string, TreeEvidenceState>;
  evidenceMeasured: boolean;
  labels: TreeMapLabels;
  /** Without them the hover draws the focus but shows no tooltip. */
  tooltipLabels?: TreeTooltipLabels;
  onSelect?: (id: string) => void;
  onPaneClick?: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  canvasLabel?: string;
  listLabel?: string;
  legend?: (state: { focused: boolean }) => ReactNode;
  fitToken?: number;
  replayToken?: number;
  onGrowthReplayingChange?: (replaying: boolean) => void;
  /** The folder's identity: the tree grows the first time a folder opens in 3D in a session. */
  arrivalKey?: string | null;
  reducedMotion?: boolean;
  arrivedByMorph?: boolean;
  navigationSpeed?: MapNavigationSpeed;
}

/** Chrome that moves with a selection or the INDEX panel has settled by then. */
const CHROME_SETTLE_MS = 450;
/** The tooltip keeps this far (CSS px) from its mark and from the free area's edge. */
const TOOLTIP_GAP_PX = 8;

/** Folders whose tree has grown (or arrived grown) in this session. */
const grownKeys = new Set<string>();

const sameRect = (a: TreeRect | null, b: TreeRect | null) =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height);

/** The capability a node belongs to: itself, its nearest capability ancestor, or -1. O(depth). */
function capabilityOf(model: TreeModel, node: number): number {
  for (let n = node; n >= 0; n = model.parent[n]!) if (model.kinds[n] === "capability") return n;
  return -1;
}

/** The trunk, every domain and capability, and the elements of the selected concept's capability, in preorder. O(n). */
function listedNodes(model: TreeModel, selected: number): number[] {
  const openCapability = selected >= 0 ? capabilityOf(model, selected) : -1;
  const out: number[] = [];
  for (let i = 0; i < model.count; i += 1) {
    const kind = model.kinds[i];
    if (model.ids[i] === null) continue;
    if (kind === "element" ? openCapability >= 0 && capabilityOf(model, i) === openCapability : kind !== "fork") out.push(i);
  }
  return out;
}

/**
 * The 3D view: the containment drawn as a tree the person turns, zooms and walks. Frames are drawn
 * only while the pose, the growth or the free area moves, or when a source changes.
 */
export function OntologyTreeMap({
  nodes,
  edges,
  selectedId,
  evidence,
  evidenceMeasured,
  labels,
  tooltipLabels,
  onSelect,
  onPaneClick,
  onDrawnCountChange,
  canvasLabel,
  listLabel,
  legend,
  fitToken = 0,
  replayToken = 0,
  onGrowthReplayingChange,
  arrivalKey = null,
  reducedMotion = false,
  arrivedByMorph = false,
  navigationSpeed = DEFAULT_MAP_NAVIGATION_SPEED,
}: OntologyTreeMapProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [free, setFree] = useState<TreeRect | null>(null);
  const [dpr, setDpr] = useState(() => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  const [tokens] = useState(() => (typeof document === "undefined" ? null : readTreeTokens()));
  const [fontFamily, setFontFamily] = useState(() => (typeof document === "undefined" ? "" : labelFontFamily()));
  const [hover, setHover] = useState(-1);
  const readChromeRef = useRef<() => void>(() => {});
  const drawnRef = useRef(-1);
  const hoverRef = useRef(-1);
  /** The concept the canvas itself just chose: revealed in place, not flown to. */
  const pickedRef = useRef(-1);
  const replayingRef = useRef(false);

  const model = useMemo(() => buildTreeModel(nodes, edges), [nodes, edges]);
  const layout = useMemo(() => layoutTree(model), [model]);
  const nameModel = useMemo((): TreeModel => {
    if (model.looseRoot < 0) return model;
    const named = model.labels.slice();
    named[model.looseRoot] = labels.looseCaption(model.concepts[model.looseRoot]!);
    return { ...model, labels: named };
  }, [model, labels]);

  const selectedNode = selectedId == null ? -1 : (model.indexOf.get(selectedId) ?? -1);
  const focusNode = hover >= 0 ? hover : selectedNode;
  const focus = useMemo(() => (focusNode >= 0 ? readTreeFocus(model, focusNode, focusNode === selectedNode) : null), [model, focusNode, selectedNode]);

  const stale = useMemo(() => {
    if (!evidenceMeasured) return null;
    const out = new Uint8Array(model.count);
    for (let i = 0; i < model.count; i += 1) {
      const id = model.ids[i];
      if (id != null && evidence.get(id) === "stale") out[i] = 1;
    }
    return out;
  }, [model, evidence, evidenceMeasured]);

  const subs = useMemo(() => {
    const out: (string | null)[] = new Array<string | null>(model.count).fill(null);
    const staleBefore = new Int32Array(model.count + 1);
    for (let i = 0; i < model.count; i += 1) staleBefore[i + 1] = staleBefore[i]! + (stale?.[i] ?? 0);
    const staleIn = (node: number) => (stale ? staleBefore[model.subtreeEnd[node]!]! - staleBefore[node]! : null);
    for (let i = 0; i < model.count; i += 1) {
      if (model.kinds[i] === "domain") out[i] = labels.domainMeta({ capabilities: model.capabilities[i]!, elements: model.elements[i]!, stale: staleIn(i) });
      else if (i === 0 && model.ids[0] != null) out[i] = labels.projectMeta({ concepts: model.concepts[0]!, stale: staleIn(0) });
    }
    return out;
  }, [model, labels, stale]);
  const subOf = useMemo(() => (node: number) => subs[node] ?? null, [subs]);

  const frame = useTreeFrame(canvasRef, { layout, nameModel, tokens, size, dpr, stale, focus, subOf, fontFamily });
  const { draw, locate, fitOf, list, names, projector, frames } = frame;
  useTreeMorphSnapshot(canvasRef, () => (tokens ? treeMarks(list.current, model, tokens) : []), tokens?.inks.ground ?? "transparent");

  const listed = useMemo(() => listedNodes(model, selectedNode), [model, selectedNode]);

  /** The list's `data-mark` / `data-name-box`, the e2e frame record and the drawn count: written at rest only. */
  const writeMirror = useCallback(
    (drawn: TreeDrawList, placed: TreeNamePlacement) => {
      writeTreeMirror(listRef.current, canvasRef.current, model, drawn, placed);
      if (drawn.count !== drawnRef.current) {
        drawnRef.current = drawn.count;
        onDrawnCountChange?.(drawn.count);
      }
    },
    [model, onDrawnCountChange],
  );

  /** The hovered concept's tooltip; hidden for the selection, which the panel names. */
  const placeTip = useCallback(
    (node: number, area: TreeRect | null, drawn: TreeDrawList, placed: TreeNamePlacement) => {
      const tip = tipRef.current;
      if (tip) placeTreeTooltip(tip, node >= 0 && node !== selectedNode ? treeMarkOf(drawn, node) : null, area, placed);
    },
    [selectedNode],
  );

  const wrapReady = () => {
    const wrap = wrapRef.current;
    if (wrap && wrap.dataset.treeReady !== "true") wrap.dataset.treeReady = "true";
  };
  const motion = useTreeMotion(
    {
      layout,
      draw,
      locate,
      fitOf,
      names,
      reducedMotion,
      onDrawn: (rest) => {
        wrapReady();
        if (rest) writeMirror(list.current, names.current);
        if (hoverRef.current >= 0) placeTip(hoverRef.current, motion.free, list.current, names.current);
      },
      onGrowing: (growing) => {
        if (growing && arrivalKey != null) grownKeys.add(arrivalKey);
        if (!replayingRef.current) return;
        if (!growing) replayingRef.current = false;
        onGrowthReplayingChange?.(growing);
      },
    },
    () => arrivalKey != null && !reducedMotion && !arrivedByMorph && !grownKeys.has(arrivalKey),
  );

  useEffect(() => {
    if (arrivalKey != null && (reducedMotion || arrivedByMorph)) grownKeys.add(arrivalKey);
  }, [reducedMotion, arrivedByMorph, arrivalKey]);

  const labelText = useMemo(() => nodes.map((node) => node.label).join(" "), [nodes]);
  useEffect(() => {
    let live = true;
    void adoptBodyLabelFont(labelText).then((adopted) => {
      if (live && adopted) setFontFamily(labelFontFamily());
    });
    return () => {
      live = false;
    };
  }, [labelText]);

  useEffect(() => {
    const query = window.matchMedia?.(`(resolution: ${dpr}dppx)`);
    if (!query) return;
    const onChange = () => setDpr(window.devicePixelRatio || 1);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [dpr]);

  /* The canvas size and the free map: on resize, and once the INDEX panel has settled after a toggle. */
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const read = () => {
      const r = wrap.getBoundingClientRect();
      setSize((prev) => (prev && prev.width === r.width && prev.height === r.height ? prev : { width: r.width, height: r.height }));
      const footer = footerRef.current?.getBoundingClientRect();
      const next = readTreeFreeArea(canvasRef.current, wrap, footer ? footer.top - r.top : null);
      setFree((prev) => (sameRect(prev, next) ? prev : next));
    };
    read();
    let settle: number | null = null;
    const readWhenSettled = () => {
      if (settle != null) window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        settle = null;
        read();
      }, CHROME_SETTLE_MS);
    };
    readChromeRef.current = readWhenSettled;
    const ro = new ResizeObserver(read);
    ro.observe(wrap);
    if (footerRef.current) ro.observe(footerRef.current);
    const mo = new MutationObserver(readWhenSettled);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-topology-index"] });
    return () => {
      ro.disconnect();
      mo.disconnect();
      if (settle != null) window.clearTimeout(settle);
    };
  }, []);

  useEffect(() => {
    readChromeRef.current();
  }, [selectedId]);

  /* A free area that changes within the same canvas (a panel opening or closing) is moved to; a resize jumps. */
  const sizeAtFreeRef = useRef(size);
  const selectedNodeRef = useRef(selectedNode);
  useLayoutEffect(() => {
    selectedNodeRef.current = selectedNode;
  }, [selectedNode]);
  useLayoutEffect(() => {
    if (!free) return;
    const sameCanvas = sizeAtFreeRef.current !== null && sizeAtFreeRef.current === size;
    sizeAtFreeRef.current = size;
    motion.setFree(free, sameCanvas, selectedNodeRef.current);
  }, [free, size, motion]);

  /* A selection from outside the canvas flies to its concept; one chosen on the canvas is revealed in place. */
  useEffect(() => {
    const picked = pickedRef.current;
    pickedRef.current = -1;
    if (selectedNode < 0) return;
    if (picked === selectedNode) motion.reveal(selectedNode);
    else motion.flyTo(selectedNode);
  }, [selectedNode, motion]);

  const fitTokenRef = useRef(fitToken);
  useEffect(() => {
    if (fitTokenRef.current === fitToken) return;
    fitTokenRef.current = fitToken;
    motion.fit();
  }, [fitToken, motion]);

  const replayTokenRef = useRef(replayToken);
  useEffect(() => {
    if (replayTokenRef.current === replayToken) return;
    replayTokenRef.current = replayToken;
    if (reducedMotion) return;
    replayingRef.current = true;
    motion.replayGrowth();
  }, [replayToken, reducedMotion, motion]);

  useLayoutEffect(() => {
    motion.redraw();
  }, [draw, motion]);

  useLayoutEffect(() => {
    if (!motion.busy) writeMirror(list.current, names.current);
  }, [listed, writeMirror, motion, list, names]);

  useLayoutEffect(() => {
    hoverRef.current = hover;
    const tip = tipRef.current;
    if (!tip) return;
    const text = hover >= 0 && tooltipLabels ? tooltipText(nameModel, hover, list.current, tooltipLabels, stale) : "";
    if (tip.textContent !== text) tip.textContent = text;
    placeTip(text ? hover : -1, motion.free, list.current, names.current);
  }, [hover, nameModel, tooltipLabels, stale, list, names, placeTip, motion]);

  const pick = useCallback(
    (node: number) => {
      const id = model.ids[node];
      if (id == null) return;
      if (node !== selectedNode) pickedRef.current = node;
      onSelect?.(id);
    },
    [model, selectedNode, onSelect],
  );

  const input = useTreeInput({
    canvasRef,
    motion,
    layout,
    list,
    projector,
    tokens,
    selectedNode,
    navigationSpeed,
    onPick: pick,
    onPaneClick,
    onHover: setHover,
  });
  const onKeyDown = useTreeKeyboard({ model, motion, list, selectedNode, navigationSpeed, onPick: pick, onPaneClick });

  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("e2e")) return;
    const w = window as unknown as { __atlasTree?: unknown };
    w.__atlasTree = {
      pose: (): TreePose => ({ ...motion.pose }),
      setPose: (pose: TreePose) => motion.setPose(pose),
      flyTo: (id: string) => motion.flyTo(model.indexOf.get(id) ?? -1),
      frames: () => frames.current,
    };
    return () => {
      delete w.__atlasTree;
    };
  }, [frames, motion, model]);

  const conceptList = (
    <ul ref={listRef} className="sr-only" aria-label={listLabel} data-testid="tree-map-list">
      {listed.map((node) => {
        const id = model.ids[node]!;
        return (
          <li key={id}>
            <button
              type="button"
              tabIndex={-1}
              data-tree-id={id}
              data-tree-kind={model.kinds[node]}
              data-evidence={evidence.get(id) ?? "unknown"}
              aria-pressed={selectedId === id}
              onClick={() => onSelect?.(id)}
            >
              {model.labels[node]}
            </button>
          </li>
        );
      })}
    </ul>
  );

  return (
    <div ref={wrapRef} className="absolute inset-0" data-testid="tree-map" data-tree-ready="false" data-tree-evidence={evidenceMeasured ? "measured" : "unknown"}>
      <canvas
        ref={canvasRef}
        data-role={MAP_CANVAS_SURFACE_ROLE}
        role={canvasLabel ? "img" : undefined}
        aria-label={canvasLabel}
        tabIndex={0}
        className="absolute inset-0 h-full w-full touch-none outline-none"
        style={{ cursor: "grab" }}
        onPointerDown={input.onPointerDown}
        onPointerMove={input.onPointerMove}
        onPointerUp={input.onPointerUp}
        onPointerCancel={input.onPointerCancel}
        onPointerLeave={input.onPointerLeave}
        onKeyDown={onKeyDown}
      />
      <div
        ref={tipRef}
        hidden
        role="tooltip"
        data-testid="tree-map-tooltip"
        className="pointer-events-none absolute left-0 top-0 max-w-[22rem] truncate rounded-chip border border-[color:var(--color-border-soft)] bg-[color:var(--chrome-surface)] px-2.5 py-1.5 text-label text-[color:var(--map-panel-text-secondary)] shadow-[var(--shadow-elevation-2)]"
      />
      <div
        ref={footerRef}
        data-testid="tree-map-footer"
        className="pointer-events-none absolute bottom-4 left-[calc(var(--map-safe-inset-left)*1px)] right-[calc(var(--map-safe-inset-right)*1px)] flex min-h-12 flex-col items-center justify-end"
      >
        {legend?.({ focused: focus !== null })}
      </div>
      {conceptList}
    </div>
  );
}

/** Writes each listed concept's drawn mark and name box, and under `?e2e` the frame record. O(listed + marks + names). */
function writeTreeMirror(listEl: HTMLUListElement | null, canvas: HTMLCanvasElement | null, model: TreeModel, drawn: TreeDrawList, placed: TreeNamePlacement): void {
  const markOf = new Map<number, number>();
  for (let i = 0; i < drawn.count; i += 1) markOf.set(drawn.marks[i]!.node, i);
  const boxOf = new Map<number, number>();
  for (let i = 0; i < placed.count; i += 1) boxOf.set(placed.boxes[i]!.node, i);
  for (const el of listEl?.querySelectorAll<HTMLElement>("[data-tree-id]") ?? []) {
    const node = model.indexOf.get(el.dataset.treeId!) ?? -1;
    const mark = markOf.has(node) ? drawn.marks[markOf.get(node)!]! : null;
    el.dataset.mark = mark ? `${Math.round(mark.x)},${Math.round(mark.y)},${Math.round(mark.radius)}` : "";
    const box = boxOf.has(node) ? placed.boxes[boxOf.get(node)!]! : null;
    el.dataset.nameBox = box ? `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}` : "";
  }
  if (canvas && new URLSearchParams(window.location.search).has("e2e")) {
    canvas.dataset.frame = JSON.stringify({ marks: drawn.count, visited: drawn.visited, folded: drawn.folded, names: placed.count, dropped: placed.dropped });
  }
}

/** Beside `mark` (right, left, below, above), inside `area`, clear of the placed names where a side allows. */
function placeTreeTooltip(tip: HTMLElement, mark: TreeDrawMark | null, area: TreeRect | null, placed: TreeNamePlacement): void {
  if (!mark || !area) {
    tip.hidden = true;
    return;
  }
  tip.hidden = false;
  const w = tip.offsetWidth;
  const h = tip.offsetHeight;
  const reach = mark.radius + TOOLTIP_GAP_PX;
  const spots = [
    [mark.x + reach, mark.y - h / 2],
    [mark.x - reach - w, mark.y - h / 2],
    [mark.x - w / 2, mark.y + reach],
    [mark.x - w / 2, mark.y - reach - h],
  ] as const;
  const inside = ([x, y]: readonly [number, number]) =>
    x >= area.x + TOOLTIP_GAP_PX && y >= area.y + TOOLTIP_GAP_PX && x + w <= area.x + area.width - TOOLTIP_GAP_PX && y + h <= area.y + area.height - TOOLTIP_GAP_PX;
  const clear = ([x, y]: readonly [number, number]) => {
    for (let i = 0; i < placed.count; i += 1) {
      const b = placed.boxes[i]!;
      if (b.x < x + w && x < b.x + b.width && b.y < y + h && y < b.y + b.height) return false;
    }
    return true;
  };
  const [x, y] = spots.find((s) => inside(s) && clear(s)) ?? spots.find(inside) ?? spots[0];
  tip.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
}

/** A closed mark names what is folded in it; a concept its stale state and dependency facts. */
function tooltipText(
  model: TreeModel,
  node: number,
  list: TreeDrawList,
  labels: TreeTooltipLabels,
  stale: Uint8Array | null,
): string {
  const name = model.labels[node] ?? "";
  const ownCapability = model.kinds[node] === "capability" ? 1 : 0;
  const ownElement = model.kinds[node] === "element" ? 1 : 0;
  if (treeMarkOf(list, node)?.closed) {
    return labels.folded({ name, capabilities: model.capabilities[node]! - ownCapability, elements: model.elements[node]! - ownElement });
  }
  return labels.concept({
    name,
    stale: stale?.[node] === 1,
    needs: model.needsStart[node + 1]! - model.needsStart[node]!,
    users: model.usedByStart[node + 1]! - model.usedByStart[node]!,
    elements: model.elements[node]! - ownElement,
  });
}
