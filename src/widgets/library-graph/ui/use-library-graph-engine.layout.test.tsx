import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LibraryGraph } from "../model/build-library-graph";
import { useLibraryGraphEngine } from "./use-library-graph-engine";

// Two connected components are essential: a single mass never runs a footprint pass.
function folder(size: number): LibraryGraph {
  const nodes: LibraryGraph["nodes"] = [];
  const edges: LibraryGraph["edges"] = [];
  for (let i = 0; i < size; i += 1) {
    nodes.push({ id: `s${i}`, kind: "source", label: `Source ${i}`, ref: `s${i}`, href: null });
  }
  for (let group = 0; group < 2; group += 1) {
    const id = `p${group}`;
    nodes.push({ id, kind: "page", label: `Page ${group}`, ref: id, href: null });
    for (let i = group; i < size; i += 2) {
      edges.push({ id: `${id}-s${i}`, source: id, target: `s${i}`, relation: "cites", certainty: "current" });
    }
  }
  return { nodes, edges, counts: { sources: size, pages: 2, concepts: 0, cites: edges.length, mentions: 0 } };
}

describe("Library prepares only the picture it renders", () => {
  let canvas: HTMLCanvasElement;
  let resize: () => void;
  let width: number;

  beforeEach(() => {
    width = 1300;
    canvas = document.createElement("canvas");
    vi.spyOn(canvas, "getBoundingClientRect").mockImplementation(() => new DOMRect(0, 0, width, 700));
    vi.spyOn(canvas, "getContext").mockReturnValue(null);
    vi.stubGlobal("requestAnimationFrame", () => 1);
    vi.stubGlobal("cancelAnimationFrame", () => undefined);
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) { resize = callback; }
      observe() {}
      disconnect() {}
    });
  });

  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  function mount(graph: LibraryGraph, reducedMotion: boolean, layout: "flow" | "force" = "flow") {
    const canvasRef = { current: canvas };
    const callbacks = { onHover: vi.fn(), onPressMark: vi.fn(), onActivate: vi.fn(), onDismiss: vi.fn() };
    return renderHook((props: { graph: LibraryGraph; layout: "flow" | "force"; overview: boolean }) => useLibraryGraphEngine({
      ...props, ...callbacks, canvasRef, reducedMotion,
      selectedId: null, hoveredId: null, focusedId: null, activeLabel: null, standingLabels: true,
    }), { initialProps: { graph, layout, overview: true } });
  }

  it.each([false, true])("does no component subset scans for fixed layouts, including sync and resize (reduced motion: %s)", (reducedMotion) => {
    const graph = folder(24);
    // settledFootprint scans the original nodes to build a subgraph for every component.
    // Neither fixed layout needs those subgraphs: this measures discarded work, not time.
    const scans = vi.spyOn(graph.nodes, "filter");
    const view = mount(graph, reducedMotion);
    expect(view.result.current.picture).toBe("flow");
    expect(scans).not.toHaveBeenCalled();

    const large = folder(410);
    const largeScans = vi.spyOn(large.nodes, "filter");
    view.rerender({ graph: large, layout: "flow", overview: true });
    expect(view.result.current.picture).toBe("islands");
    expect(largeScans).not.toHaveBeenCalled();

    act(() => { width = 900; resize(); });
    expect(largeScans).not.toHaveBeenCalled();
    view.rerender({ graph: large, layout: "flow", overview: false });
    expect(view.result.current.picture).toBe("flow");
    expect(largeScans).not.toHaveBeenCalled();

    const smaller = folder(12);
    const smallerScans = vi.spyOn(smaller.nodes, "filter");
    view.rerender({ graph: smaller, layout: "flow", overview: true });
    expect(view.result.current.picture).toBe("flow");
    expect(smallerScans).not.toHaveBeenCalled();
    view.unmount();
  });

  it("prepares force footprints on demand, then stops doing so when returning to fixed layout", () => {
    const graph = folder(24);
    const scans = vi.spyOn(graph.nodes, "filter");
    const view = mount(graph, true);
    scans.mockClear();
    view.rerender({ graph, layout: "force", overview: true });
    expect(view.result.current.picture).toBe("force");
    expect(scans.mock.calls.length).toBeGreaterThan(0);

    scans.mockClear();
    view.rerender({ graph, layout: "flow", overview: true });
    expect(view.result.current.picture).toBe("flow");
    expect(scans).not.toHaveBeenCalled();
    view.unmount();
  });

  it("keeps the original force preparation on a force mount and graph update", () => {
    const graph = folder(24);
    const scans = vi.spyOn(graph.nodes, "filter");
    const view = mount(graph, true, "force");
    expect(scans.mock.calls.length).toBeGreaterThan(0);
    const next = folder(26);
    const nextScans = vi.spyOn(next.nodes, "filter");
    view.rerender({ graph: next, layout: "force", overview: true });
    expect(nextScans.mock.calls.length).toBeGreaterThan(0);
    view.unmount();
  });
});
