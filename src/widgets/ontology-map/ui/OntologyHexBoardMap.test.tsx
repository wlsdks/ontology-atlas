import { act, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chrome = vi.hoisted(() => ({
  current: { free: { x: 0, y: 0, width: 1000, height: 800 }, blocks: [] as { x: number; y: number; width: number; height: number }[] },
}));

vi.mock("../morph/hex-marks", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../morph/hex-marks")>()),
  hexMapChrome: vi.fn(() => chrome.current),
  hexFreeArea: vi.fn(() => chrome.current.free),
  readHexRoom: vi.fn(() => ({ x: 0, y: 0, width: 800, height: 600 })),
  hexRestCamera: vi.fn(() => ({ R: 20, ox: 300, oy: 300 })),
}));

import { computeHexBoard } from "../model/hex-board";
import type { OntologyMapEdge, OntologyMapNode } from "./OntologyMap";
import { OntologyHexBoardMap, type HexBoardLabels } from "./OntologyHexBoardMap";

const nodes = [
  { id: "project:p", label: "Project", kind: "project" },
  { id: "domain:d", label: "Domain", kind: "domain" },
  ...[0, 1, 2, 3, 4].map((i) => ({ id: `capability:c${i}`, label: `Capability ${i}`, kind: "capability" })),
] as unknown as OntologyMapNode[];
const edges = [
  { source: "project:p", target: "domain:d", kind: "contains", relationType: "contains" },
  ...[0, 1, 2, 3, 4].map((i) => ({ source: "domain:d", target: `capability:c${i}`, kind: "contains", relationType: "contains" })),
  { source: "capability:c1", target: "capability:c0", kind: "depends", relationType: "depends_on" },
] as unknown as OntologyMapEdge[];

const labels: HexBoardLabels = {
  staleOnly: () => "stale",
  regionsOnly: "regions",
  widened: "widened",
  tooltip: ({ name }) => name,
  domainMeta: () => "meta",
  domainStale: () => null,
  projectMeta: null,
  plateSub: () => "sub",
  relief: "relief",
  dependents: (count) => String(count),
  regionDependents: (count) => String(count),
};

const props = { nodes, edges, evidence: new Map(), evidenceMeasured: false, staleFiles: new Map(), labels, placement: null, reducedMotion: true };

function tooltipX(container: HTMLElement): number {
  const tip = container.querySelector<HTMLElement>('[data-testid="hex-board-tooltip"]')!;
  expect(tip.hidden).toBe(false);
  return Number(/translate\((-?[\d.]+)px/.exec(tip.style.transform)![1]);
}

describe("the hex board tooltip after a selection clears", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    vi.stubGlobal("requestAnimationFrame", vi.fn(() => 1));
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    chrome.current = { free: { x: 0, y: 0, width: 1000, height: 800 }, blocks: [] };
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("keeps clear of the chrome as it is now, not as it was while the inspector closed", () => {
    const layout = computeHexBoard(
      nodes.map((n) => ({ id: n.id, label: n.label, kind: n.kind })),
      edges.map((e) => ({ source: e.source, target: e.target, kind: e.kind, relationType: e.relationType })),
      { prior: null, aspect: 800 / 600 },
    );
    const tile = layout.byId.get("capability:c3")!;
    const x = 300 + tile.x * 20;
    const y = 300 + tile.y * 20;

    const { container, rerender } = render(<OntologyHexBoardMap {...props} selectedId={null} />);
    rerender(<OntologyHexBoardMap {...props} selectedId="capability:c0" />);
    act(() => {
      vi.runOnlyPendingTimers();
    });

    chrome.current = { free: { x: 0, y: 0, width: x + 10, height: 800 }, blocks: [] };
    rerender(<OntologyHexBoardMap {...props} selectedId={null} />);
    chrome.current = { free: { x: 0, y: 0, width: 1000, height: 800 }, blocks: [] };

    fireEvent.pointerMove(container.querySelector("canvas")!, { clientX: x, clientY: y, pointerId: 1 });
    expect(tooltipX(container)).toBe(Math.round(x + 20 + 8));
  });
});
