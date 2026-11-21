"use client";

import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { isImeComposing } from "@/shared/lib/keyboard/ime-composition";
import type { MapNavigationSpeed } from "@/shared/lib/preferences/map-navigation-speed-preferences";
import { keyboardZoomIntent } from "../../interaction/keyboard-zoom";
import type { TreeDrawList, TreeModel } from "../../model/tree-view/tree-shapes";
import { treeMarkOf } from "./use-tree-input";
import type { TreeMotion } from "./use-tree-motion";

type TreeWalkKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight";

const isConcept = (model: TreeModel, node: number) => model.ids[node] != null;
/** A synthetic fork groups siblings; walking passes through it. */
const isFork = (model: TreeModel, node: number) => model.kinds[node] === "fork" && model.ids[node] == null;

/** The first concept inside `node`, entering forks: O(depth + forks passed). */
function firstConceptIn(model: TreeModel, node: number): number {
  const end = model.subtreeEnd[node]!;
  for (let i = node + 1; i < end; ) {
    if (isConcept(model, i)) return i;
    i = isFork(model, i) ? i + 1 : model.subtreeEnd[i]!;
  }
  return -1;
}

/** The concept before (`step` -1) or after (+1) `node` among those sharing its nearest non-fork parent. O(children through forks). */
function siblingConcept(model: TreeModel, node: number, step: -1 | 1): number {
  let holder = model.parent[node]!;
  while (holder >= 0 && isFork(model, holder)) holder = model.parent[holder]!;
  if (holder < 0) return -1;
  const end = model.subtreeEnd[holder]!;
  let previous = -1;
  let passed = false;
  for (let i = holder + 1; i < end; ) {
    if (isFork(model, i)) {
      i += 1;
      continue;
    }
    if (i === node) {
      if (step === -1) return previous;
      passed = true;
    } else if (isConcept(model, i)) {
      if (passed) return i;
      previous = i;
    }
    i = model.subtreeEnd[i]!;
  }
  return -1;
}

/** Where a walk key moves from `node`, skipping forks; -1 when nothing lies that way. */
export function treeWalkTarget(model: TreeModel, node: number, key: TreeWalkKey): number {
  if (node < 0 || node >= model.count) return -1;
  if (key === "ArrowDown") return firstConceptIn(model, node);
  if (key === "ArrowLeft") return siblingConcept(model, node, -1);
  if (key === "ArrowRight") return siblingConcept(model, node, 1);
  let up = model.parent[node]!;
  while (up >= 0 && !isConcept(model, up)) up = model.parent[up]!;
  return up;
}

const WALK_KEYS = new Set<string>(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"]);

export interface TreeKeyboardSources {
  model: TreeModel;
  motion: TreeMotion;
  list: { current: TreeDrawList };
  selectedNode: number;
  navigationSpeed: MapNavigationSpeed;
  /** A concept chosen on the canvas. */
  onPick: (node: number) => void;
  onPaneClick?: () => void;
}

/**
 * Keys on the canvas: arrows walk the tree (up the parent, down the first child, sideways the
 * siblings), Enter flies to the selection, Escape clears it, `+ - 0` zoom and fit.
 */
export function useTreeKeyboard({ model, motion, list, selectedNode, navigationSpeed, onPick, onPaneClick }: TreeKeyboardSources) {
  return (e: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const zoom = keyboardZoomIntent(e, navigationSpeed.zoom);
    if (zoom) {
      e.preventDefault();
      if (zoom.kind === "fit") {
        motion.fit();
        return;
      }
      const mark = selectedNode >= 0 ? treeMarkOf(list.current, selectedNode) : null;
      const free = motion.free;
      if (mark) motion.zoomAbout(zoom.factor, mark.x, mark.y);
      else if (free) motion.zoomAbout(zoom.factor, free.x + free.width / 2, free.y + free.height / 2);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onPaneClick?.();
      return;
    }
    if (e.key === "Enter") {
      if (selectedNode < 0 || isImeComposing(e)) return;
      e.preventDefault();
      motion.flyTo(selectedNode);
      return;
    }
    if (!WALK_KEYS.has(e.key) || model.count === 0) return;
    e.preventDefault();
    if (selectedNode < 0) {
      const start = isConcept(model, 0) ? 0 : firstConceptIn(model, 0);
      if (start >= 0) onPick(start);
      return;
    }
    const next = treeWalkTarget(model, selectedNode, e.key as TreeWalkKey);
    if (next >= 0) onPick(next);
  };
}
