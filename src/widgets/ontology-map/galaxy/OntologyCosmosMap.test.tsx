import { act, render } from "@testing-library/react";
import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { OntologyMapEdge, OntologyMapNode } from "../ui/OntologyMap";
import { cosmosLayoutFor } from "./layout/cosmos-layout-cache";
import { OntologyCosmosMap, type CosmosPlacementStore } from "./OntologyCosmosMap";

vi.mock("./draw/cosmos-frame", () => ({
  drawCosmosFrame: () => ({ band: "spine", pendingBuilds: 0, buildsStarted: 0, firstDraws: 0, labels: [] }),
}));
vi.mock("./draw/cosmos-labels", () => ({ registerCosmosLabels: () => {} }));
vi.mock("./draw/cosmos-paint", async (importOriginal) => ({ ...(await importOriginal<object>()), buildDeepField: () => null }));
vi.mock("../ui/topology-read-tokens", () => ({ readOntologyMapTokensOrNull: () => new Proxy({}, { get: () => "#336699" }) }));

type Probe = { arrival(): { mode: string; active: boolean }; frames(): number };

const nodes: OntologyMapNode[] = [{ id: "p", label: "Shop", kind: "project" } as OntologyMapNode];
const edges: OntologyMapEdge[] = [];
for (let d = 0; d < 4; d += 1) {
  nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain" } as OntologyMapNode);
  edges.push({ source: "p", target: `d${d}`, kind: "contains", relationType: "contains" } as OntologyMapEdge);
  for (let c = 0; c < 3; c += 1) {
    nodes.push({ id: `d${d}c${c}`, label: `Capability ${d}.${c}`, kind: "capability" } as OntologyMapNode);
    edges.push({ source: `d${d}`, target: `d${d}c${c}`, kind: "contains", relationType: "contains" } as OntologyMapEdge);
  }
}

let frames: FrameRequestCallback[] = [];
let key = 0;

function paint(): void {
  act(() => {
    const queued = frames;
    frames = [];
    for (const cb of queued) cb(performance.now());
  });
}

const probe = () => (window as unknown as { __atlasCosmos?: Probe }).__atlasCosmos;

function open(arrivalKey: string, placement: CosmosPlacementStore | null = null) {
  return render(
    <StrictMode>
      <OntologyCosmosMap nodes={nodes} edges={edges} selectedId={null} arrivalKey={arrivalKey} placement={placement} />
    </StrictMode>,
  );
}

beforeEach(() => {
  frames = [];
  key += 1;
  window.history.replaceState(null, "", "/?e2e=1");
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => frames.push(cb));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({} as never);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({ x: 0, y: 0, left: 0, top: 0, right: 800, bottom: 600, width: 800, height: 600, toJSON: () => ({}) });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  window.history.replaceState(null, "", "/");
});

describe("galaxy arrival across StrictMode's discarded mount", () => {
  it("replays a cold open on the engine that stays mounted", () => {
    open(`vault-${key}`);
    expect(probe()?.arrival()).toMatchObject({ mode: "replay", active: true });
    paint();
    expect(probe()?.frames()).toBeGreaterThan(0);
    expect(probe()?.arrival()).toMatchObject({ mode: "replay", active: true });
  });

  it("condenses a reload with a record on the engine that stays mounted", () => {
    const record = cosmosLayoutFor(nodes, edges, null, false).placement;
    open(`vault-${key}`, { current: () => record, write: () => {}, clear: () => {} });
    expect(probe()?.arrival()).toMatchObject({ mode: "condense", active: true });
  });

  it("does not replay a reopen once the mounted engine has painted", () => {
    const first = open(`vault-${key}`);
    paint();
    first.unmount();
    open(`vault-${key}`);
    expect(probe()?.arrival()).toMatchObject({ mode: "none", active: false });
  });
});
