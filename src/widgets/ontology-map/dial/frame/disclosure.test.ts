import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode,
} from "../../model/containment-tree";
import { buildDialModel, resolveDialAttention } from "../dial-model";
import { RESOLVE_SLIDE_PX, resolveDialDisclosure, type DialCamera } from "./disclosure";
import { layoutDial } from "../layout";
import { circularDomainOrder } from "../order";
import { resolveDialTokens } from "../tokens";
import type { Box, DialModel, DialScene } from "../types";

const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const TOKENS = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#ececf0" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));
const W = 1000;
const H = 800;
const FREE: Box = { minX: 0, minY: 0, maxX: W, maxY: H };

function modelOf(domains: number, caps: number, deps: [string, string][]): DialModel {
  const nodes: TreeInputNode[] = [{ id: "p", label: "P", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  for (let d = 0; d < domains; d += 1) {
    nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain" });
    edges.push({ source: "p", target: `d${d}`, kind: "contains", relationType: "contains" });
    for (let c = 0; c < caps; c += 1) {
      nodes.push({ id: `d${d}c${c}`, label: `Cap ${d}.${c}`, kind: "capability" });
      edges.push({ source: `d${d}`, target: `d${d}c${c}`, kind: "contains", relationType: "contains" });
      for (let e = 0; e < 2; e += 1) {
        nodes.push({ id: `d${d}c${c}e${e}`, label: `El ${d}.${c}.${e}`, kind: "element" });
        edges.push({ source: `d${d}c${c}`, target: `d${d}c${c}e${e}`, kind: "contains", relationType: "contains" });
      }
    }
  }
  for (const [s, t] of deps) edges.push({ source: s, target: t, kind: "depends", relationType: "depends_on" });
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  return buildDialModel({
    tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)),
    elementIds: nodes.filter((n) => n.kind === "element").map((n) => n.id),
  });
}

function sceneOf(model: DialModel): DialScene {
  return layoutDial(model, circularDomainOrder(model, null).order, TOKENS, null);
}

function camera(scene: DialScene, pitchPx: number, at: { x: number; y: number } = { x: 0, y: 0 }): DialCamera {
  const scale = pitchPx / TOKENS.pitch;
  return { scale, viewportWidth: W, viewportHeight: H, toScreen: (x, y) => ({ x: W / 2 + (x - at.x) * scale, y: H / 2 + (y - at.y) * scale }) };
}

const RING_DEPS: [string, string][] = [["d0c0", "d1c0"], ["d1c1", "d2c0"], ["d2c1", "d3c0"], ["d3c1", "d0c1"]];

describe("resolveDialDisclosure", () => {
  const model = modelOf(4, 6, RING_DEPS);
  const scene = sceneOf(model);
  const rest = resolveDialAttention(model, null, null);

  it("derives every alpha from the camera scale alone", () => {
    const ramp = (pitch: number) => {
      const d = resolveDialDisclosure(model, scene, camera(scene, pitch), FREE, rest, TOKENS);
      return [d.capAlpha, d.plateAlpha, d.elementsAlpha, d.orphanAlpha, d.elementAlphaFor(scene.clusters[0]!.items[0]!)];
    };
    const pitches = [4, TOKENS.capOnFrom, TOKENS.capOnFrom + 1, TOKENS.capOnFull, 30, TOKENS.elementsAfterCapFrom + 8, 80];
    const forward = pitches.map(ramp);
    const backward = [...pitches].reverse().map(ramp).reverse();
    expect(backward).toEqual(forward);
    const elsewhere = resolveDialDisclosure(model, scene, camera(scene, 30, { x: 400, y: -300 }), FREE, resolveDialAttention(model, "d2", null), TOKENS);
    expect([elsewhere.capAlpha, elsewhere.plateAlpha, elsewhere.elementsAlpha]).toEqual(forward[4]!.slice(0, 3));
  });

  it("dissolves the plate before the discs fill and holds elements until capabilities stand apart", () => {
    const at = (pitch: number) => resolveDialDisclosure(model, scene, camera(scene, pitch), FREE, rest, TOKENS);
    expect(at(TOKENS.capOnFrom - 1)).toMatchObject({ capAlpha: 0, plateAlpha: 1, elementsAlpha: 0 });
    expect(at(TOKENS.capOnFrom + 2).plateAlpha).toBe(0);
    expect(at(TOKENS.capOnFrom + 2).capAlpha).toBeLessThan(0.5);
    expect(at(TOKENS.capOnFull).capAlpha).toBe(1);
    expect(at(TOKENS.elementsAfterCapFrom).elementsAlpha).toBe(0);
    expect(at(TOKENS.elementsAfterCapFull).elementsAlpha).toBe(1);
    const item = scene.clusters[0]!.items[0]!;
    const roomy = (TOKENS.elementOnFull / item.elementPitch) * TOKENS.pitch;
    expect(at(Math.max(roomy, TOKENS.elementsAfterCapFull)).elementAlphaFor(item)).toBe(1);
    const tight = (TOKENS.elementOnFrom / item.elementPitch) * TOKENS.pitch;
    if (tight > TOKENS.elementsAfterCapFull) expect(at(tight).elementAlphaFor(item)).toBe(0);
    expect(at(TOKENS.elementsAfterCapFrom).elementAlphaFor(item)).toBe(0);
  });

  it("enters the attended domain first, else the drawn chip nearest the free-rect centre", () => {
    const pitch = 20;
    const target = scene.clusterByDomain.get("d2")!.chip;
    const cam = camera(scene, pitch, target);
    expect(resolveDialDisclosure(model, scene, cam, FREE, rest, TOKENS).entered).toBe("d2");
    const shiftedFree = { ...FREE, minX: 600 };
    const moved = resolveDialDisclosure(model, scene, cam, shiftedFree, rest, TOKENS).entered;
    const fc = { x: (shiftedFree.minX + shiftedFree.maxX) / 2, y: (shiftedFree.minY + shiftedFree.maxY) / 2 };
    const nearest = [...scene.clusters]
      .map((c) => ({ id: c.domainId, p: cam.toScreen(c.chip.x, c.chip.y), r: c.footprint * cam.scale }))
      .filter(({ p, r }) => p.x + r >= 0 && p.x - r <= W && p.y + r >= 0 && p.y - r <= H)
      .sort((a, b) => Math.hypot(a.p.x - fc.x, a.p.y - fc.y) - Math.hypot(b.p.x - fc.x, b.p.y - fc.y))[0]!.id;
    expect(moved).toBe(nearest);
    const attended = scene.clusters.find((c) => c.domainId !== "d2" && (() => { const p = cam.toScreen(c.chip.x, c.chip.y); const r = c.footprint * cam.scale; return p.x + r >= 0 && p.x - r <= W && p.y + r >= 0 && p.y - r <= H; })());
    if (attended) expect(resolveDialDisclosure(model, scene, cam, FREE, resolveDialAttention(model, attended.domainId, null), TOKENS).entered).toBe(attended.domainId);
  });

  it("enters nothing at rest while capabilities are not drawn, but keeps an attended domain", () => {
    const cam = camera(scene, TOKENS.capOnFrom - 1);
    expect(resolveDialDisclosure(model, scene, cam, FREE, rest, TOKENS).entered).toBeNull();
    expect(resolveDialDisclosure(model, scene, cam, FREE, resolveDialAttention(model, "d1", null), TOKENS).entered).toBe("d1");
  });

  it("resolves from the resolve pitch and slides the endpoints over the next 12 px", () => {
    const target = scene.clusterByDomain.get("d0")!.chip;
    const at = (pitch: number) => resolveDialDisclosure(model, scene, camera(scene, pitch, target), FREE, rest, TOKENS);
    expect(at(TOKENS.resolve - 1)).toMatchObject({ entered: "d0", resolved: false, endpointSlide: 0 });
    expect(at(TOKENS.resolve)).toMatchObject({ entered: "d0", resolved: true, endpointSlide: 0 });
    expect(at(TOKENS.resolve + RESOLVE_SLIDE_PX / 2).endpointSlide).toBeCloseTo(0.5);
    expect(at(TOKENS.resolve + RESOLVE_SLIDE_PX + 5).endpointSlide).toBe(1);
  });

  it("refuses resolution when the entered domain's own links exceed the budget", () => {
    const many: [string, string][] = [];
    for (let c = 0; c < TOKENS.resolveBudget + 1; c += 1) many.push([`d0c${c}`, `d1c${c}`]);
    const big = modelOf(2, TOKENS.resolveBudget + 1, many);
    const bigScene = sceneOf(big);
    const cam = camera(bigScene, TOKENS.resolve + 20, bigScene.clusterByDomain.get("d0")!.chip);
    expect(resolveDialDisclosure(big, bigScene, cam, FREE, resolveDialAttention(big, null, null), TOKENS)).toMatchObject({ entered: "d0", resolved: false, endpointSlide: 0 });
    const fits = modelOf(2, TOKENS.resolveBudget, many.slice(0, TOKENS.resolveBudget));
    const fitsScene = sceneOf(fits);
    const fitsCam = camera(fitsScene, TOKENS.resolve + 20, fitsScene.clusterByDomain.get("d0")!.chip);
    expect(resolveDialDisclosure(fits, fitsScene, fitsCam, FREE, resolveDialAttention(fits, null, null), TOKENS)).toMatchObject({ entered: "d0", resolved: true });
  });
});
