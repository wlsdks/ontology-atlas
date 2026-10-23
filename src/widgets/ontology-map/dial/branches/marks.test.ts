import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readContainmentTree, rollDirectedDomainFlows, rollDomainDependencies, rollRelatesDomainPairs, type TreeInputEdge, type TreeInputNode } from "../../model/containment-tree";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { buildDialModel, dialEvidenceView, resolveDialAttention } from "../dial-model";
import { resolveDialDisclosure } from "../frame/disclosure";
import { buildDialMarks, emptyDialFrameMarks, type DialMarksInput } from "../frame/marks";
import { resolveDialInks } from "../ink";
import { layoutDial } from "../layout";
import { resolveDialTokens } from "../tokens";

const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const tokens = resolveDialTokens((v) => v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? "");
const map = { canvasBgNear: "#101014", edgeDepends: "#8a8fa8", indigoBright: "#8b8cff", edgeSelected: "#7882ff", labelDomain: "#d0d2dc", labelElement: "#9a9caa", labelCapability: "#b8bac8", labelProject: "#e8e8f0", edgeContainsL2: "#3a3c48", nodeFillCapability: "#20222c", nodeStrokeCapability: "#7a7e96", nodeFillElement: "#1a1c24", nodeStrokeElement: "#6a6e80", statusWarning: "#e0a040", nodeStrokeDim: "#44465a", nodeFillDim: "#18181c", nodeFillDomain: "#262836", egoRestAlpha: 0.32, radiusProject: 22, radiusCapability: 11 } as unknown as OntologyMapTokens;

function frame(focus: string | null, scale = 2, longName = false) {
  const nodes: TreeInputNode[] = [{ id: "p", label: "Project", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const contains = (source: string, target: string) => edges.push({ source, target, kind: "contains", relationType: "contains" });
  for (let d = 0; d < 3; d++) {
    nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain" });
    contains("p", `d${d}`);
    for (let c = 0; c < 3; c++) {
      nodes.push({ id: `d${d}c${c}`, label: longName ? "긴 이름을 가진 개념을 선택하고 관계와 구현 근거를 모두 읽는 경우" : `Capability ${d}.${c}`, kind: "capability" });
      contains(`d${d}`, `d${d}c${c}`);
      if (d) edges.push({ source: `d${d}c${c}`, target: `d0c${c}`, kind: "depends", relationType: "depends_on" });
    }
  }
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  const model = buildDialModel({ tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)), elementIds: [] });
  const scene = layoutDial(model, model.domains.map((d) => d.id), tokens, null);
  const toScreen = (x: number, y: number) => ({ x: 1800 + x * scale, y: 900 + y * scale });
  const attention = resolveDialAttention(model, null, focus);
  const freeRect = { minX: 0, minY: 0, maxX: 3600, maxY: 1800 };
  const input: DialMarksInput = {
    model, scene, tokens, mapTokens: map, inks: resolveDialInks({ ...map, nodeHoleFill: "#0c0c10" }, tokens), labels: null,
    evidence: dialEvidenceView(model, new Map([["d0c0", "stale"]])), attention, inkAttention: attention, previous: null, inkMix: 1, chordPresence: 1,
    scale, zoomRatio: 2, viewportWidth: 3600, viewportHeight: 1800, freeRect,
    nodeScreen: (id) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen,
    appearOf: () => 1, measureText: (s) => s.length * 7, elementLabel: () => null,
    hoveredNodeId: null, agentFocusNodeId: null, selectionPulse: null, hubCount: null,
    disclosure: resolveDialDisclosure(model, scene, { scale, viewportWidth: 3600, viewportHeight: 1800, toScreen }, freeRect, attention, tokens),
  };
  const out = emptyDialFrameMarks();
  return { out, result: buildDialMarks(input, out), input };
}

describe("branch reading", () => {
  it("bounds long visible names while preserving the full concept title", () => {
    const { input, out } = frame(null, 1, true);
    const names = out.texts.filter((t) => t.role === "capability");
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name.box.maxX - name.box.minX).toBeLessThanOrEqual(tokens.nameMaxPx + 4);
      expect(name.lines?.length).toBe(2);
      expect(input.model.capabilityById.get(name.id!)!.label).not.toContain("…");
    }
  });

  it("moves relation ends continuously while compact nodes become cards", () => {
    const before = frame(null, 0.35).out.strips;
    const after = frame(null, 0.37).out.strips;
    expect(before.length).toBeGreaterThan(0);
    for (const line of before) {
      const next = after.find((candidate) => candidate.flowKey === line.flowKey)!;
      expect(Math.hypot(next.ax - line.ax, next.ay - line.ay)).toBeLessThan(20);
      expect(Math.hypot(next.bx - line.bx, next.by - line.by)).toBeLessThan(20);
    }
  });

  it("keeps domain dependencies counted at the domain until a capability is selected", () => {
    const domain = frame("d0");
    expect(domain.result.flows.links.flatMap((l) => [l.u, l.v]).every((id) => domain.input.model.domainById.has(id))).toBe(true);
    expect(domain.result.flows.links.reduce((sum, l) => sum + l.total, 0)).toBe(6);
    expect(domain.result.chords.length).toBeGreaterThan(0);
    expect(domain.result.chords.every((chord) => chord.chipRadiusPx === 0 && chord.arrivalBloom === false)).toBe(true);
    const capability = frame("d0c0");
    expect(capability.result.flows.links.filter((l) => l.u === "d0c0" || l.v === "d0c0").reduce((sum, l) => sum + l.total, 0)).toBe(2);
  });

  it("gives readable capability marks a full-sized target and a non-colour stale cue", () => {
    const { out, result } = frame(null);
    expect(out.discs.every((d) => d.r >= 10)).toBe(true);
    expect(result.picks.find((p) => p.id === "d0c0")!.r).toBeGreaterThanOrEqual(10);
    expect(out.texts.some((t) => t.id === "d0c0" && t.role === "status")).toBe(true);
  });
});
