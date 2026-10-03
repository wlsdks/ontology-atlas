import { describe, expect, it } from "vitest";
import { pickNeighborInDirection } from "../interaction/keyboard-walk";
import { liveBandRadius, overviewCamera } from "./cosmos-camera";
import type { CosmosRoom, GalaxyPose } from "./cosmos-types";
import { walkCandidates, walkTarget } from "./cosmos-walk";
import { computeCosmosLayout } from "./layout/cosmos-layout";

const centre = { x: 100, y: 100 };

describe("walkTarget", () => {
  it("picks the candidate nearest the room centre when nothing is selected", () => {
    const candidates = [
      { id: "far", x: 10, y: 10 },
      { id: "near", x: 104, y: 98 },
    ];
    expect(walkTarget({ key: "ArrowRight", selectedId: null, candidates, roomCentre: centre })).toEqual({ id: "near", deadEnd: false });
  });

  it("keeps to the ±60° cone and breaks a tie on the lower id, as the flat walk does", () => {
    const candidates = [
      { id: "from", x: 0, y: 0 },
      { id: "steep", x: 10, y: 30 },
      { id: "b", x: 20, y: 5 },
      { id: "a", x: 20, y: -5 },
    ];
    const step = walkTarget({ key: "ArrowRight", selectedId: "from", candidates, roomCentre: centre });
    expect(step).toEqual({ id: "a", deadEnd: false });
    expect(step.id).toBe(pickNeighborInDirection(candidates[0]!, candidates, "right"));
  });

  it("reports a dead end when nothing lies in that direction", () => {
    const candidates = [
      { id: "from", x: 50, y: 0 },
      { id: "left", x: 0, y: 0 },
    ];
    expect(walkTarget({ key: "ArrowRight", selectedId: "from", candidates, roomCentre: centre })).toEqual({ id: null, deadEnd: true });
  });

  it("walks from the galaxy centre when the selected concept is not drawn", () => {
    const candidates = [
      { id: "west", x: 0, y: 0 },
      { id: "east", x: 200, y: 0 },
    ];
    const step = walkTarget({ key: "ArrowRight", selectedId: "hidden", candidates, roomCentre: centre, galaxyCentreOf: () => ({ x: 100, y: 0 }) });
    expect(step).toEqual({ id: "east", deadEnd: false });
  });

  it("ignores keys that are not arrows", () => {
    expect(walkTarget({ key: "Enter", selectedId: null, candidates: [{ id: "a", x: 0, y: 0 }], roomCentre: centre })).toEqual({ id: null, deadEnd: false });
  });
});

function layoutOf() {
  const nodes: { id: string; label: string; kind: "project" | "domain" | "capability" | "element"; size: number }[] = [];
  const edges: { source: string; target: string; kind: "contains"; relationType: string }[] = [];
  nodes.push({ id: "p", label: "p", kind: "project", size: 1 });
  for (let d = 0; d < 3; d += 1) {
    nodes.push({ id: `d${d}`, label: `d${d}`, kind: "domain", size: 1 });
    edges.push({ source: "p", target: `d${d}`, kind: "contains", relationType: "contains" });
    for (let c = 0; c < 4; c += 1) {
      nodes.push({ id: `d${d}c${c}`, label: `c${c}`, kind: "capability", size: 1 });
      edges.push({ source: `d${d}`, target: `d${d}c${c}`, kind: "contains", relationType: "contains" });
    }
  }
  return computeCosmosLayout(nodes as never, edges as never, {});
}

const restPoses = (n: number): GalaxyPose[] =>
  Array.from({ length: n }, () => ({ x: Number.NaN, y: Number.NaN, theta: 0, wispTheta: 0, wispLight: 1, presence: 1, condense: 1 }));

describe("walkCandidates", () => {
  const layout = layoutOf();
  const poses = restPoses(layout.galaxies.length).map((p, i) => ({ ...p, x: layout.galaxies[i]!.x, y: layout.galaxies[i]!.y }));
  const room: CosmosRoom = { x: 0, y: 0, width: 1200, height: 800 };

  it("offers galaxy nuclei and core stars at the overview", () => {
    const { camera } = overviewCamera(layout.bounds, room);
    const live = liveBandRadius(1);
    expect(layout.galaxies.every((g) => g.radius * camera.scale <= live)).toBe(true);
    const ids = walkCandidates({ layout, poses, camera, room, dpr: 1 }).map((c) => c.id);
    for (const g of layout.galaxies) expect(ids).toContain(g.id);
    expect(ids).toContain("p");
    expect(ids).not.toContain("d0c0");
  });

  it("offers every star of a live galaxy", () => {
    const g = layout.galaxies[0]!;
    const camera = { x: g.x, y: g.y, scale: (liveBandRadius(1) / g.radius) * 4 };
    const ids = walkCandidates({ layout, poses, camera, room: { x: -1e6, y: -1e6, width: 2e6, height: 2e6 }, dpr: 1 }).map((c) => c.id);
    for (const id of g.starIds) expect(ids).toContain(id);
  });

  it("drops points outside the room", () => {
    const { camera } = overviewCamera(layout.bounds, room);
    const all = walkCandidates({ layout, poses, camera, room, dpr: 1 });
    const half: CosmosRoom = { x: 0, y: 0, width: 600, height: 800 };
    const inside = walkCandidates({ layout, poses, camera: { ...camera, x: camera.x - 300 / camera.scale }, room: half, dpr: 1 });
    expect(inside.length).toBeLessThan(all.length);
    for (const c of inside) expect(c.x).toBeLessThanOrEqual(600);
  });
});
