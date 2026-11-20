// @vitest-environment node
import { describe, expect, it } from "vitest";

import type { LibraryGraphEdge, LibraryGraphNode } from "../model/build-library-graph";
import type { LayoutPoint } from "../model/library-graph-layout";
import { drawLibraryGraph, type LibraryGraphFrame } from "./draw-library-graph";
import type { LibraryGraphInk } from "./library-graph-ink";

const INK: LibraryGraphInk = {
  ground: "ground", page: "page", source: "source", concept: "concept", edge: "edge",
  hoverRing: "hover", selected: "selected", selectedRing: "ring", danger: "danger", stale: "stale",
  pageHalo: "halo", sourceLabel: "label", labelSurface: "surface", labelBorder: "border",
  labelInk: "ink", fontFamily: "Test", pageLabelPx: 11, labelPx: 11, captionPx: 9.5,
};

type Command = [string, ...number[]];
interface Stroke {
  style: string;
  width: number;
  dash: number[];
  alpha: number;
  path: Command[];
}

/** A context that keeps every stroked path with the state it was stroked in. */
function strokeRecorder(): { ctx: CanvasRenderingContext2D; strokes: Stroke[] } {
  const strokes: Stroke[] = [];
  let path: Command[] = [];
  const state: Record<string | symbol, unknown> = { font: "10px Test", globalAlpha: 1, lineWidth: 1, strokeStyle: "" };
  let dash: number[] = [];
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === "measureText") return (text: string) => ({ width: text.length * 5 });
      if (key === "setLineDash") return (pattern: number[]) => void (dash = [...pattern]);
      if (key === "beginPath") return () => void (path = []);
      if (key === "moveTo" || key === "lineTo" || key === "quadraticCurveTo" || key === "bezierCurveTo") {
        return (...args: number[]) => void path.push([key, ...args]);
      }
      if (key === "stroke") {
        return () =>
          void strokes.push({
            style: String(target.strokeStyle),
            width: Number(target.lineWidth),
            dash,
            alpha: Number(target.globalAlpha),
            path,
          });
      }
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) {
      target[key] = value;
      return true;
    },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, strokes };
}

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => (state = (Math.imul(state, 1664525) + 1013904223) >>> 0) / 4294967296;
}

const WIDTH = 640;
const HEIGHT = 400;

/**
 * Marks scattered over three canvases each way around the visible one, so edges lie wholly
 * off screen, cross it with both ends outside, or end on it; a quarter are unverified mentions.
 */
function scattered(edgeCount: number, layout: "force" | "flow", seed = 5): LibraryGraphFrame {
  const next = random(seed);
  const nodes: LibraryGraphNode[] = [];
  const positions = new Map<string, LayoutPoint>();
  const markCount = Math.ceil(edgeCount * 0.8);
  for (let index = 0; index < markCount; index += 1) {
    const kind = index % 2 === 0 ? "page" : "source";
    const id = `${kind}:${index}`;
    nodes.push({ id, kind, label: id, ref: id, href: null });
    positions.set(id, { x: (next() * 3 - 1) * WIDTH, y: (next() * 3 - 1) * HEIGHT });
  }
  const edges: LibraryGraphEdge[] = [];
  for (let index = 0; index < edgeCount; index += 1) {
    const source = nodes[Math.floor(next() * markCount)].id;
    const target = nodes[Math.floor(next() * markCount)].id;
    edges.push({
      id: `e${index}`,
      source,
      target,
      relation: index % 3 === 0 ? "mentions" : "cites",
      certainty: index % 4 === 0 ? "unverified" : "current",
    });
  }
  return {
    nodes, edges, positions, width: WIDTH, height: HEIGHT, ink: INK, layout,
    selectedId: null, hoveredId: null, focusedId: null, activeLabel: null,
    standingLabels: false, sourceLabels: false,
  };
}

/** The same frame on a canvas that holds every mark, moved by `offset`: nothing can be culled. */
function unculled(frame: LibraryGraphFrame, offset: number): LibraryGraphFrame {
  const positions = new Map<string, LayoutPoint>();
  for (const node of frame.nodes) {
    const point = frame.positions.get(node.id)!;
    positions.set(node.id, { x: point.x + offset, y: point.y + offset });
  }
  return { ...frame, positions, width: frame.width + offset * 2, height: frame.height + offset * 2 };
}

function edgeStrokes(frame: LibraryGraphFrame): Stroke[] {
  const { ctx, strokes } = strokeRecorder();
  drawLibraryGraph(ctx, frame);
  return strokes.filter((stroke) => stroke.style === INK.edge);
}

function shifted(stroke: Stroke, by: number): Stroke {
  return { ...stroke, path: stroke.path.map(([name, ...args]) => [name, ...args.map((value) => value + by)] as Command) };
}

function sameStroke(a: Stroke, b: Stroke): boolean {
  if (a.width !== b.width || a.alpha !== b.alpha || a.dash.join() !== b.dash.join() || a.path.length !== b.path.length) return false;
  return a.path.every((command, i) => {
    const other = b.path[i];
    return command[0] === other[0] && command.length === other.length && command.every((value, j) => j === 0 || Math.abs(Number(value) - Number(other[j])) < 1e-6);
  });
}

/** Points along the stroke's own path, so whether it reaches the canvas is judged from what was drawn. */
function samples(stroke: Stroke): LayoutPoint[] {
  const points: LayoutPoint[] = [];
  let at: LayoutPoint = { x: 0, y: 0 };
  for (const [name, ...args] of stroke.path) {
    if (name === "moveTo") at = { x: args[0], y: args[1] };
    else {
      const end = { x: args[args.length - 2], y: args[args.length - 1] };
      for (let i = 0; i <= 64; i += 1) {
        const t = i / 64;
        const u = 1 - t;
        if (name === "lineTo") points.push({ x: at.x + (end.x - at.x) * t, y: at.y + (end.y - at.y) * t });
        else if (name === "quadraticCurveTo") {
          points.push({ x: u * u * at.x + 2 * u * t * args[0] + t * t * end.x, y: u * u * at.y + 2 * u * t * args[1] + t * t * end.y });
        } else {
          points.push({
            x: u * u * u * at.x + 3 * u * u * t * args[0] + 3 * u * t * t * args[2] + t * t * t * end.x,
            y: u * u * u * at.y + 3 * u * u * t * args[1] + 3 * u * t * t * args[3] + t * t * t * end.y,
          });
        }
      }
      at = end;
    }
  }
  return points;
}

function reachesCanvas(stroke: Stroke): boolean {
  const reach = stroke.width / 2 + 1;
  return samples(stroke).some((point) => point.x >= -reach && point.x <= WIDTH + reach && point.y >= -reach && point.y <= HEIGHT + reach);
}

describe("edges outside the canvas", () => {
  it.each(["force", "flow"] as const)("%s: draws every edge that reaches the canvas exactly as an unculled frame does, and skips the rest", (layout) => {
    const frame = scattered(900, layout);
    const offset = 4096;
    const reference = edgeStrokes(unculled(frame, offset)).map((stroke) => shifted(stroke, -offset));
    const culled = edgeStrokes(frame);
    const onScreen = reference.filter(reachesCanvas);

    // Every culled stroke is the reference's stroke, in the reference's order.
    let cursor = 0;
    for (const stroke of culled) {
      while (cursor < reference.length && !sameStroke(reference[cursor], stroke)) cursor += 1;
      expect(cursor, "a drawn edge the unculled frame does not draw").toBeLessThan(reference.length);
      cursor += 1;
    }
    // And none that reaches the canvas is missing.
    const missing = onScreen.filter((stroke) => !culled.some((drawn) => sameStroke(drawn, stroke)));
    expect(missing).toEqual([]);
    expect(culled.length).toBeLessThan(reference.length * 0.75);
  });
});
