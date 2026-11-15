"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MAP_CANVAS_SURFACE_ROLE } from "@/shared/lib/map-canvas/focus-map-canvas";
import type { MapNavigationSpeed } from "@/shared/lib/preferences/appearance-preferences";
import { TREE_POSE_REST } from "../model/tree-view/tree-camera";
import { layoutTree } from "../model/tree-view/tree-layout";
import { buildTreeModel, readTreeFocus } from "../model/tree-view/tree-model";
import type { TreeModel, TreeRect } from "../model/tree-view/types";
import { adoptBodyLabelFont, labelFontFamily } from "../render/labels";
import { readTreeTokens } from "../tokens/read-tree-tokens";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";
import { readTreeFreeArea, useTreeFrame } from "./tree-view/use-tree-frame";

export type TreeEvidenceState = "current" | "stale" | "unknown";

export interface TreeMapLabels {
  /** A domain's meta line; `stale` is null when evidence was not measured. */
  domainMeta: (facts: { capabilities: number; elements: number; stale: number | null }) => string;
  /** The trunk's meta line. */
  projectMeta: (facts: { concepts: number; stale: number | null }) => string;
  /** The caption of the shoot holding every concept under no domain. */
  looseCaption: (concepts: number) => string;
}

export interface OntologyTreeMapProps {
  nodes: readonly OntologyMapNode[];
  edges: readonly OntologyMapEdge[];
  selectedId: string | null;
  /** Node id to evidence state; absent ids are unknown. */
  evidence: ReadonlyMap<string, TreeEvidenceState>;
  evidenceMeasured: boolean;
  labels: TreeMapLabels;
  onSelect?: (id: string) => void;
  onPaneClick?: () => void;
  onDrawnCountChange?: (drawn: number) => void;
  canvasLabel?: string;
  listLabel?: string;
  legend?: (state: { focused: boolean }) => ReactNode;
  fitToken?: number;
  replayToken?: number;
  reducedMotion?: boolean;
  arrivedByMorph?: boolean;
  navigationSpeed?: MapNavigationSpeed;
}

/** Chrome that moves with a selection or the INDEX panel has settled by then. */
const CHROME_SETTLE_MS = 450;

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
 * The 3D view: the containment drawn as a tree at its rest pose. A frame is drawn only when a
 * source changes (vault, size, pixel ratio, evidence, selection, the label font).
 */
export function OntologyTreeMap({
  nodes,
  edges,
  selectedId,
  evidence,
  evidenceMeasured,
  labels,
  onSelect,
  onDrawnCountChange,
  canvasLabel,
  listLabel,
  legend,
}: OntologyTreeMapProps) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const footerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const [free, setFree] = useState<TreeRect | null>(null);
  const [dpr, setDpr] = useState(() => (typeof window === "undefined" ? 1 : window.devicePixelRatio || 1));
  const [tokens] = useState(() => (typeof document === "undefined" ? null : readTreeTokens()));
  const [fontFamily, setFontFamily] = useState(() => (typeof document === "undefined" ? "" : labelFontFamily()));
  const readChromeRef = useRef<() => void>(() => {});
  const drawnRef = useRef(-1);

  const model = useMemo(() => buildTreeModel(nodes, edges), [nodes, edges]);
  const layout = useMemo(() => layoutTree(model), [model]);
  const nameModel = useMemo((): TreeModel => {
    if (model.looseRoot < 0) return model;
    const named = model.labels.slice();
    named[model.looseRoot] = labels.looseCaption(model.concepts[model.looseRoot]!);
    return { ...model, labels: named };
  }, [model, labels]);

  const selectedNode = selectedId == null ? -1 : (model.indexOf.get(selectedId) ?? -1);
  const focus = useMemo(() => (selectedNode >= 0 ? readTreeFocus(model, selectedNode, true) : null), [model, selectedNode]);

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

  const frame = useTreeFrame(canvasRef, { layout, nameModel, tokens, size, dpr, free, stale, focus, subOf, fontFamily });

  useEffect(() => {
    let live = true;
    void adoptBodyLabelFont().then((adopted) => {
      if (live && adopted) setFontFamily(labelFontFamily());
    });
    return () => {
      live = false;
    };
  }, []);

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

  const listed = useMemo(() => listedNodes(model, selectedNode), [model, selectedNode]);

  const { draw, list, names } = frame;
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    const canvas = canvasRef.current;
    if (!wrap || !canvas) return;
    if (!draw(TREE_POSE_REST, null)) {
      wrap.dataset.treeReady = "false";
      return;
    }
    const drawn = list.current;
    const placed = names.current;
    const markOf = new Map<number, number>();
    for (let i = 0; i < drawn.count; i += 1) markOf.set(drawn.marks[i]!.node, i);
    const boxOf = new Map<number, number>();
    for (let i = 0; i < placed.count; i += 1) boxOf.set(placed.boxes[i]!.node, i);
    for (const el of listRef.current?.querySelectorAll<HTMLElement>("[data-tree-id]") ?? []) {
      const node = model.indexOf.get(el.dataset.treeId!) ?? -1;
      const mark = markOf.has(node) ? drawn.marks[markOf.get(node)!]! : null;
      el.dataset.mark = mark ? `${Math.round(mark.x)},${Math.round(mark.y)},${Math.round(mark.radius)}` : "";
      const box = boxOf.has(node) ? placed.boxes[boxOf.get(node)!]! : null;
      el.dataset.nameBox = box ? `${Math.round(box.x)},${Math.round(box.y)},${Math.round(box.width)},${Math.round(box.height)}` : "";
    }
    if (new URLSearchParams(window.location.search).has("e2e")) {
      canvas.dataset.frame = JSON.stringify({ marks: drawn.count, visited: drawn.visited, folded: drawn.folded, names: placed.count, dropped: placed.dropped });
    }
    wrap.dataset.treeReady = "true";
    if (drawn.count !== drawnRef.current) {
      drawnRef.current = drawn.count;
      onDrawnCountChange?.(drawn.count);
    }
  }, [draw, list, names, model, listed, onDrawnCountChange]);

  const { frames } = frame;
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has("e2e")) return;
    const w = window as unknown as { __atlasTree?: unknown };
    w.__atlasTree = { pose: () => ({ ...TREE_POSE_REST }), frames: () => frames.current };
    return () => {
      delete w.__atlasTree;
    };
  }, [frames]);

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
      />
      <div
        ref={footerRef}
        data-testid="tree-map-footer"
        className="pointer-events-none absolute bottom-4 left-[calc(var(--map-safe-inset-left)*1px)] right-[calc(var(--map-safe-inset-right)*1px)] flex flex-col items-center"
      >
        {legend?.({ focused: focus !== null })}
      </div>
      {conceptList}
    </div>
  );
}
