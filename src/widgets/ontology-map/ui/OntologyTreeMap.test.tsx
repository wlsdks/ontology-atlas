import { readFileSync } from "node:fs";
import path from "node:path";
import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TREE_POSE_REST, treePoseFacing } from "../model/tree-view/tree-camera";
import { layoutTree } from "../model/tree-view/tree-layout";
import type { TreeDrawMark, TreeFrameInput, TreePose } from "../model/tree-view/types";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";
import { OntologyTreeMap, type TreeMapLabels, type TreeTooltipLabels } from "./OntologyTreeMap";

const chrome = vi.hoisted(() => ({ free: { x: 0, y: 0, width: 1000, height: 800 } }));
vi.mock("../morph/hex-marks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../morph/hex-marks")>()),
  hexMapChrome: vi.fn(() => ({ free: chrome.free, blocks: [] })),
}));
/** What each painted frame was asked to draw: its growth and its marks. */
const painted = vi.hoisted(() => ({ frames: [] as { growth: number; marks: TreeDrawMark[] }[] }));
vi.mock("../tree-view/tree-paint", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../tree-view/tree-paint")>()),
  paintTreeFrame: vi.fn((_ctx: unknown, frame: TreeFrameInput) => {
    painted.frames.push({ growth: frame.growth, marks: frame.list.marks.slice(0, frame.list.count).map((m) => ({ ...m })) });
  }),
}));
vi.mock("../model/tree-view/tree-layout", async (importOriginal) => {
  const real = await importOriginal<typeof import("../model/tree-view/tree-layout")>();
  return { ...real, layoutTree: vi.fn(real.layoutTree) };
});

const BORROWED: Record<string, string> = {
  "--map-graph-project": "#9aa2ff",
  "--map-graph-disc-fill": "#0b0c12",
  "--map-graph-name": "#c9cdd8",
  "--map-graph-name-strong": "#f4f5f9",
  "--map-graph-halo": "#07080c",
  "--map-graph-arc": "#cfd3ff",
  "--map-graph-reach": "#eeaa86",
  "--color-status-warning": "#f4b731",
  "--map-canvas-bg-near": "#0a0a0d",
  "--map-camera-release-velocity-window-ms": "80",
  "--map-camera-flick-min-speed": "0.05",
};

function stubTreeTokens(): void {
  const css = readFileSync(path.join(process.cwd(), "app/styles/map-tree-tokens.css"), "utf8");
  const values: Record<string, string> = {
    ...Object.fromEntries([...css.matchAll(/(--map-tree-[\w-]+):\s*([^;]+);/g)].map((m) => [m[1]!, m[2]!.trim()])),
    ...BORROWED,
  };
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
    const style = real(element, pseudo);
    return new Proxy(style, {
      get: (target, key) => {
        if (key === "getPropertyValue") return (name: string) => values[name] ?? target.getPropertyValue(name);
        const value: unknown = Reflect.get(target, key);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
  });
}

/** A 1000 x 800 map, a 2D context that measures names, and a frame clock the test advances by hand. */
function stubSurface() {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, width: 1000, height: 800, right: 1000, bottom: 800, toJSON: () => ({}) });
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({ font: "", measureText: (text: string) => ({ width: text.length * 7 }) } as unknown as CanvasRenderingContext2D);
  const pending = new Map<number, FrameRequestCallback>();
  let next = 1;
  let now = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    pending.set(next, callback);
    return next++;
  });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => pending.delete(id));
  return {
    get pending() {
      return pending.size;
    },
    step() {
      now += 16;
      const due = [...pending.values()];
      pending.clear();
      act(() => {
        for (const callback of due) callback(now);
      });
    },
    settle() {
      for (let frames = 0; pending.size > 0 && frames < 500; frames += 1) this.step();
    },
  };
}

const node = (id: string, kind: OntologyMapNode["kind"]) => ({ id, label: id, kind }) as unknown as OntologyMapNode;
const contains = (source: string, target: string) => ({ source, target, kind: "contains", relationType: "contains" }) as unknown as OntologyMapEdge;
const depends = (source: string, target: string) => ({ source, target, kind: "depends", relationType: "depends_on" }) as unknown as OntologyMapEdge;

const nodes = [
  node("project:p", "project"),
  node("domain:d", "domain"),
  node("capability:c1", "capability"),
  node("capability:c2", "capability"),
  node("element:e1", "element"),
  node("element:e2", "element"),
  node("element:e3", "element"),
];
const edges = [
  contains("project:p", "domain:d"),
  contains("domain:d", "capability:c1"),
  contains("domain:d", "capability:c2"),
  contains("capability:c1", "element:e1"),
  contains("capability:c1", "element:e2"),
  contains("capability:c2", "element:e3"),
  depends("capability:c1", "capability:c2"),
];

const labels: TreeMapLabels = {
  domainMeta: () => "meta",
  projectMeta: () => "meta",
  looseCaption: () => "loose",
};
const tooltipLabels: TreeTooltipLabels = {
  concept: ({ name, needs, users, elements }) => `${name} · needs ${needs} · used by ${users} · elements ${elements}`,
  folded: ({ name, capabilities, elements }) => `${name} · folded ${capabilities} capabilities ${elements} elements`,
};

const props = { nodes, edges, evidence: new Map(), evidenceMeasured: false, labels, tooltipLabels };

interface TreeHooks {
  pose: () => TreePose;
  setPose: (pose: TreePose) => void;
}
const tree = () => (window as unknown as { __atlasTree: TreeHooks }).__atlasTree;
const canvasOf = (container: HTMLElement) => container.querySelector<HTMLCanvasElement>('[data-testid="tree-map"] canvas')!;

function markOf(container: HTMLElement, id: string): { x: number; y: number; r: number } {
  const mark = container.querySelector<HTMLElement>(`[data-tree-id="${id}"]`)!.dataset.mark!;
  const [x, y, r] = mark.split(",").map(Number);
  return { x: x!, y: y!, r: r! };
}

function click(canvas: HTMLCanvasElement, x: number, y: number) {
  fireEvent.pointerDown(canvas, { clientX: x, clientY: y, pointerId: 1, button: 0 });
  fireEvent.pointerUp(canvas, { clientX: x, clientY: y, pointerId: 1, button: 0 });
}

function listedIds(container: HTMLElement): string[] {
  return [...container.querySelectorAll<HTMLElement>('[data-testid="tree-map-list"] [data-tree-id]')].map((el) => el.dataset.treeId!).sort();
}

describe("the tree's accessible list", () => {
  beforeEach(stubTreeTokens);
  afterEach(() => vi.restoreAllMocks());

  it("holds the trunk, domains and capabilities, and the selected capability's elements", () => {
    const { container, rerender } = render(<OntologyTreeMap {...props} nodes={nodes} selectedId={null} />);
    expect(listedIds(container)).toEqual(["capability:c1", "capability:c2", "domain:d", "project:p"]);

    rerender(<OntologyTreeMap {...props} nodes={nodes} selectedId="capability:c1" />);
    expect(listedIds(container)).toEqual(["capability:c1", "capability:c2", "domain:d", "element:e1", "element:e2", "project:p"]);
  });

  it("rebuilds the tree when the vault changes", () => {
    const { container, rerender } = render(<OntologyTreeMap {...props} nodes={nodes} selectedId={null} />);
    rerender(
      <OntologyTreeMap
        {...props}
        nodes={[...nodes, node("domain:d2", "domain"), node("capability:c3", "capability")]}
        edges={[...edges, contains("project:p", "domain:d2"), contains("domain:d2", "capability:c3")]}
        selectedId={null}
      />,
    );
    expect(listedIds(container)).toEqual(["capability:c1", "capability:c2", "capability:c3", "domain:d", "domain:d2", "project:p"]);
  });
});

describe("turning, pointing at and walking the tree", () => {
  let clock: ReturnType<typeof stubSurface>;
  beforeEach(() => {
    stubTreeTokens();
    clock = stubSurface();
    painted.frames.length = 0;
    window.history.replaceState(null, "", "/?e2e=1");
    chrome.free = { x: 0, y: 0, width: 1000, height: 800 };
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.replaceState(null, "", "/");
  });

  it("turns the tree on a drag and moves no concept", () => {
    const { container } = render(<OntologyTreeMap {...props} selectedId={null} />);
    clock.settle();
    const laidOut = vi.mocked(layoutTree).mock.results.at(-1)!.value as ReturnType<typeof layoutTree>;
    const positions = laidOut.position.slice();
    const layouts = vi.mocked(layoutTree).mock.calls.length;
    const canvas = canvasOf(container);

    fireEvent.pointerDown(canvas, { clientX: 500, clientY: 400, pointerId: 1, button: 0 });
    for (let x = 520; x <= 700; x += 20) {
      fireEvent.pointerMove(canvas, { clientX: x, clientY: 400, pointerId: 1 });
      clock.step();
    }
    fireEvent.pointerUp(canvas, { clientX: 700, clientY: 400, pointerId: 1 });
    clock.settle();

    expect(tree().pose().yaw).toBeGreaterThan(0.5);
    expect(vi.mocked(layoutTree).mock.calls.length).toBe(layouts);
    expect(laidOut.position).toEqual(positions);
  });

  it("selects the concept under a click and clears the selection on a click on empty canvas", () => {
    const onSelect = vi.fn();
    const onPaneClick = vi.fn();
    const { container } = render(<OntologyTreeMap {...props} selectedId={null} onSelect={onSelect} onPaneClick={onPaneClick} />);
    clock.settle();
    const c1 = markOf(container, "capability:c1");

    click(canvasOf(container), c1.x, c1.y);
    click(canvasOf(container), 4, 4);

    expect(onSelect.mock.calls).toEqual([["capability:c1"]]);
    expect(onPaneClick).toHaveBeenCalledTimes(1);
  });

  it("flies in until a closed mark opens, and selects nothing", () => {
    const crowded = [node("project:p", "project"), node("domain:d", "domain"), ...Array.from({ length: 6 }, (_, k) => node(`capability:c${k}`, "capability"))];
    const crowdedEdges = [contains("project:p", "domain:d"), ...crowded.slice(2).map((c) => contains("domain:d", c.id))];
    for (let k = 0; k < 6; k += 1) {
      for (let e = 0; e < 60; e += 1) {
        crowded.push(node(`element:c${k}e${e}`, "element"));
        crowdedEdges.push(contains(`capability:c${k}`, `element:c${k}e${e}`));
      }
    }
    const onSelect = vi.fn();
    const { container } = render(<OntologyTreeMap {...props} nodes={crowded} edges={crowdedEdges} selectedId={null} onSelect={onSelect} />);
    clock.settle();
    const closed = painted.frames.at(-1)!.marks.findLast((m) => m.closed && m.node > 1)!;
    expect(closed).toBeDefined();

    click(canvasOf(container), closed.x, closed.y);
    clock.settle();

    expect(onSelect).not.toHaveBeenCalled();
    expect(tree().pose().zoom).toBeGreaterThan(1);
    const after = painted.frames.at(-1)!.marks;
    expect(after.find((m) => m.node === closed.node)?.closed).toBe(false);
    expect(after.some((m) => m.node === closed.node + 1)).toBe(true);
  });

  it("names the hovered concept and its facts in the tooltip", () => {
    const { container } = render(<OntologyTreeMap {...props} selectedId={null} />);
    clock.settle();
    const c1 = markOf(container, "capability:c1");

    fireEvent.pointerMove(canvasOf(container), { clientX: c1.x, clientY: c1.y, pointerId: 1 });

    const tip = container.querySelector<HTMLElement>('[data-testid="tree-map-tooltip"]')!;
    expect(tip.hidden).toBe(false);
    expect(tip.textContent).toBe("capability:c1 · needs 1 · used by 0 · elements 2");
  });

  it.each([
    { reducedMotion: false, framesToArrive: (n: number) => n > 1 },
    { reducedMotion: true, framesToArrive: (n: number) => n === 1 },
  ])("flies to the selection on Enter (reduced motion $reducedMotion)", ({ reducedMotion, framesToArrive }) => {
    const { container } = render(<OntologyTreeMap {...props} selectedId="element:e3" reducedMotion={reducedMotion} />);
    clock.settle();
    act(() => tree().setPose({ ...TREE_POSE_REST }));
    clock.settle();
    const facing = { ...TREE_POSE_REST };
    treePoseFacing(vi.mocked(layoutTree).mock.results.at(-1)!.value as ReturnType<typeof layoutTree>, 6, TREE_POSE_REST, facing);
    expect(facing.yaw).not.toBeCloseTo(0);

    fireEvent.keyDown(canvasOf(container), { key: "Enter" });
    let frames = 0;
    while (clock.pending > 0 && Math.abs(tree().pose().yaw - facing.yaw) > 1e-6) {
      clock.step();
      frames += 1;
    }

    expect(tree().pose().yaw).toBeCloseTo(facing.yaw);
    expect(framesToArrive(frames)).toBe(true);
  });

  it("grows the tree the first time a folder opens, not again, and not after a view switch", () => {
    const first = render(<OntologyTreeMap {...props} selectedId={null} arrivalKey="folder-a" />);
    clock.settle();
    expect(painted.frames[0]!.growth).toBe(0);
    expect(painted.frames.at(-1)!.growth).toBe(1);
    first.unmount();

    painted.frames.length = 0;
    const again = render(<OntologyTreeMap {...props} selectedId={null} arrivalKey="folder-a" />);
    clock.settle();
    again.unmount();
    render(<OntologyTreeMap {...props} selectedId={null} arrivalKey="folder-b" arrivedByMorph />);
    clock.settle();

    expect(painted.frames.length).toBeGreaterThan(0);
    expect(painted.frames.every((frame) => frame.growth === 1)).toBe(true);
  });

  it("returns to the rest pose from the Fit tile", () => {
    const { rerender } = render(<OntologyTreeMap {...props} selectedId={null} fitToken={0} />);
    clock.settle();
    act(() => tree().setPose({ yaw: 1.2, pitch: 0.6, zoom: 3, panX: 80, panY: -40 }));
    clock.settle();

    rerender(<OntologyTreeMap {...props} selectedId={null} fitToken={1} />);
    clock.settle();

    expect(tree().pose()).toEqual(TREE_POSE_REST);
  });

  it("brings a selected concept the opening panel would cover back into the free area", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const { container } = render(<OntologyTreeMap {...props} selectedId="capability:c1" />);
    clock.settle();
    const at = markOf(container, "capability:c1");
    act(() => tree().setPose({ ...tree().pose(), zoom: 3, panX: 3 * (500 - at.x) + 360, panY: 0 }));
    clock.settle();
    const before = markOf(container, "capability:c1");
    expect(before.x).toBeGreaterThan(620);

    chrome.free = { x: 0, y: 0, width: 600, height: 800 };
    document.documentElement.setAttribute("data-topology-index", "toggled");
    await act(async () => {
      await Promise.resolve();
      vi.advanceTimersByTime(450);
    });
    clock.settle();
    document.documentElement.removeAttribute("data-topology-index");

    const after = markOf(container, "capability:c1");
    expect(after.x).toBeGreaterThanOrEqual(0);
    expect(after.x).toBeLessThanOrEqual(600);
  });
});
