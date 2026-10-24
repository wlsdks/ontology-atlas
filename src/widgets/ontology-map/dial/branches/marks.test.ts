import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readContainmentTree, rollDirectedDomainFlows, rollDomainDependencies, rollRelatesDomainPairs, type TreeInputEdge, type TreeInputNode } from "../../model/containment-tree";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { buildDialModel, dialEvidenceView, resolveDialAttention } from "../dial-model";
import { resolveDialDisclosure } from "../frame/disclosure";
import { buildDialMarks, emptyDialFrameMarks, type DialMarksInput } from "../frame/marks";
import { mixOver, resolveDialInks } from "../ink";
import { layoutDial } from "../layout";
import { resolveDialTokens } from "../tokens";
import { applyBranchMemberAction } from "./member-disclosure";
import { crossesBox, overlaps } from "../label-marks";
import { pickDial, pickDialAction } from "../pick";
import { dialOverviewBounds, dialOverviewPad } from "../fit";
import { computeOverviewCameraTarget } from "../../ui/camera/topology-camera-math";

const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const tokens = resolveDialTokens((v) => v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? "");
const map = { canvasBgNear: "#101014", edgeDepends: "#8a8fa8", indigoBright: "#8b8cff", edgeSelected: "#7882ff", labelDomain: "#d0d2dc", labelElement: "#9a9caa", labelCapability: "#b8bac8", labelProject: "#e8e8f0", edgeContainsL2: "#3a3c48", nodeFillCapability: "#20222c", nodeStrokeCapability: "#7a7e96", nodeFillElement: "#1a1c24", nodeStrokeElement: "#6a6e80", statusWarning: "#e0a040", nodeStrokeDim: "#44465a", nodeFillDim: "#18181c", nodeFillDomain: "#262836", egoRestAlpha: 0.32, radiusProject: 22, radiusCapability: 11 } as unknown as OntologyMapTokens;

function frame(focus: string | null, scale = 2, longName = false, domains = 3, capabilities = 3, fitWidth?: number, elements = 0) {
  const nodes: TreeInputNode[] = [{ id: "p", label: "Project", kind: "project" }];
  const edges: TreeInputEdge[] = [];
  const contains = (source: string, target: string) => edges.push({ source, target, kind: "contains", relationType: "contains" });
  for (let d = 0; d < domains; d++) {
    nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain" });
    contains("p", `d${d}`);
    for (let c = 0; c < capabilities; c++) {
      nodes.push({ id: `d${d}c${c}`, label: longName ? "긴 이름을 가진 개념을 선택하고 관계와 구현 근거를 모두 읽는 경우" : `Capability ${d}.${c}`, kind: "capability" });
      contains(`d${d}`, `d${d}c${c}`);
      for (let e = 0; e < elements; e++) {
        nodes.push({ id: `d${d}c${c}e${e}`, label: `Element ${e}`, kind: "element" });
        contains(`d${d}c${c}`, `d${d}c${c}e${e}`);
      }
      if (d) edges.push({ source: `d${d}c${c}`, target: `d0c${c}`, kind: "depends", relationType: "depends_on" });
    }
  }
  const tree = readContainmentTree(nodes, edges);
  const dependencies = rollDomainDependencies(tree, edges);
  const model = buildDialModel({ tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)), elementIds: nodes.filter((n) => n.kind === "element").map((n) => n.id) });
  const scene = layoutDial(model, model.domains.map((d) => d.id), tokens, null);
  const width = fitWidth ?? 3600;
  const height = fitWidth === 1040 ? 720 : fitWidth === 1920 ? 1080 : 1800;
  const camera = fitWidth ? computeOverviewCameraTarget(dialOverviewBounds(scene), width, height, {
    cameraScaleMax: 10, cameraScaleMin: 0.01, cameraSmallGraphScaleMax: 10, overviewEntryRatio: 0.95,
    safeInsetLeft: 322, safeInsetRight: 64, safeInsetTop: 164, safeInsetBottom: 96,
  } as OntologyMapTokens, nodes.length, { padPx: dialOverviewPad(scene, model, null, (s) => s.length * 7, tokens) }) : null;
  if (camera) scale = camera.tscale;
  const toScreen = (x: number, y: number) => ({ x: width / 2 + (x - (camera?.tx ?? 0)) * scale, y: height / 2 + (y - (camera?.ty ?? 0)) * scale });
  const attention = resolveDialAttention(model, null, focus);
  const freeRect = { minX: 0, minY: 0, maxX: width, maxY: height };
  const input: DialMarksInput = {
    model, scene, tokens, mapTokens: map, inks: resolveDialInks({ ...map, nodeHoleFill: "#0c0c10" }, tokens), labels: null,
    evidence: dialEvidenceView(model, new Map([["d0c0", "stale"]])), attention, inkAttention: attention, previous: null, inkMix: 1, chordPresence: 1,
    scale, zoomRatio: 2, viewportWidth: width, viewportHeight: height, freeRect,
    nodeScreen: (id) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen,
    appearOf: () => 1, measureText: (s) => s.length * 7, elementLabel: (id) => elements ? `Element ${id}` : null,
    focusedNodeId: focus, hoveredNodeId: null, agentFocusNodeId: null, selectionPulse: null, hubCount: null,
    disclosure: resolveDialDisclosure(model, scene, { scale, viewportWidth: width, viewportHeight: height, toScreen }, freeRect, attention, tokens),
  };
  const out = emptyDialFrameMarks();
  return { out, result: buildDialMarks(input, out), input };
}

describe("implementation branches", () => {
  for (const count of [1, 3]) it(`renders ${count} domain-owned elements at their real row positions without a synthetic square`, () => {
    const nodes: TreeInputNode[] = [{ id: "p", label: "Project", kind: "project" }, { id: "d", label: "Domain", kind: "domain" }, { id: "c", label: "Capability", kind: "capability" },
      ...Array.from({ length: count }, (_, i) => ({ id: `native${i}`, label: `Native reader ${i}`, kind: "element" as const }))];
    const edges: TreeInputEdge[] = [["p", "d"], ["d", "c"], ...Array.from({ length: count }, (_, i) => ["d", `native${i}`])]
      .map(([source, target]) => ({ source: source!, target: target!, kind: "contains", relationType: "contains" }));
    const model = buildDialModel({ tree: readContainmentTree(nodes, edges), dependencies: [], flows: [], elementIds: nodes.filter((n) => n.kind === "element").map((n) => n.id) });
    const scene = layoutDial(model, ["d"], tokens, null);
    const direct = scene.clusters[0]!.items.find((item) => item.direct)!;
    const { input } = frame("d", 2);
    const attention = resolveDialAttention(model, null, null);
    const toScreen = (x: number, y: number) => ({ x: 1800 + x * 2, y: 900 + y * 2 });
    Object.assign(input, { model, scene, attention, inkAttention: attention, focusedNodeId: null, evidence: undefined, toScreen,
      nodeScreen: (id: string) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; },
      elementLabel: (id: string) => `Native reader ${id}`,
      disclosure: { ...input.disclosure, entered: "d", elementsAlpha: 1, elementAlphaFor: () => 1 },
    });
    if (count === 1) input.freeRect = { ...input.freeRect, maxX: toScreen(direct.x, direct.y).x + 24 };
    const out = emptyDialFrameMarks();
    const result = buildDialMarks(input, out);
    expect(out.squares.some((square) => square.id === null)).toBe(false);
    expect(out.squares).toHaveLength(count);
    expect(Math.hypot(scene.positions.get("native0")!.x - direct.x, scene.positions.get("native0")!.y - direct.y)).toBeLessThanOrEqual(tokens.pitch / 2);
    const card = out.blocks!.find((block) => block.id === "d")!.box;
    for (const square of out.squares) {
      expect(square).toMatchObject(input.nodeScreen(square.id!)!);
      const label = out.texts.find((text) => text.id === square.id && text.role === "element");
      expect(label).toBeDefined();
      expect(result.picks.find((pick) => pick.id === square.id)).toMatchObject({ x: square.x, y: square.y, r: 12 });
      expect(result.rows.find((row) => row.id === square.id)?.box).toBe(label!.box);
      expect(label!.box.maxX).toBeLessThanOrEqual(input.freeRect.maxX);
      const stem = out.stems!.find((stem) => Math.abs(Math.max(Math.abs(stem.b.x - square.x), Math.abs(stem.b.y - square.y)) - square.half) < .01);
      expect(stem).toBeDefined();
      expect(stem!.a.x).toBeCloseTo(card.maxX);
      expect(stem!.a.y).toBeCloseTo((card.minY + card.maxY) / 2);
      const points = Array.from({ length: 33 }, (_, i) => {
        const t = i / 32;
        return { x: (1 - t) ** 2 * stem!.a.x + 2 * t * (1 - t) * stem!.c.x + t ** 2 * stem!.b.x,
          y: (1 - t) ** 2 * stem!.a.y + 2 * t * (1 - t) * stem!.c.y + t ** 2 * stem!.b.y };
      });
      for (const text of out.texts) expect(crossesBox([points], text.box)).toBe(false);
      for (const point of points) {
        expect(point.x >= input.freeRect.minX && point.x <= input.freeRect.maxX).toBe(true);
        expect(point.y >= input.freeRect.minY && point.y <= input.freeRect.maxY).toBe(true);
      }
    }
  });

  it("places children close to their capability in distinct compact rows", () => {
    const { input } = frame("d0c0", 2, false, 1, 1, undefined, 4);
    const cap = input.scene.positions.get("d0c0")!;
    const children = [0, 1, 2, 3].map((i) => input.scene.positions.get(`d0c0e${i}`)!);
    expect(Math.abs(children[0]!.x - cap.x)).toBeLessThanOrEqual(tokens.pitch * 3);
    expect(children[0]!.y).not.toBe(children[1]!.y);
    expect(children[0]!.x).toBe(children[1]!.x);
    expect(new Set(children.map((p) => `${p.x}:${p.y}`)).size).toBe(4);
  });

  it("shows readable named squares with aligned targets and containment stems at actual dragged positions", () => {
    const { input } = frame("d0c0", 2, false, 1, 1, undefined, 4);
    input.elementLabel = (id) => `Implementation ${id}: native application connection and evidence`;
    const original = input.nodeScreen;
    input.nodeScreen = (id) => {
      const p = original(id);
      return p && id === "d0c0e0" ? { x: p.x + 12, y: p.y - 10 } : p;
    };
    input.disclosure = { ...input.disclosure, entered: "d0", elementsAlpha: 1, elementAlphaFor: () => 1 };
    const out = emptyDialFrameMarks();
    const result = buildDialMarks(input, out);
    const children = out.squares.filter((square) => square.id?.startsWith("d0c0e"));
    expect(children).toHaveLength(4);
    for (const square of children) {
      const label = out.texts.find((text) => text.id === square.id && text.role === "element");
      expect(label).toBeDefined();
      expect(label!.lines).toHaveLength(2);
      expect(result.rows.find((row) => row.id === square.id)?.box).toBe(label!.box);
      expect(parseFloat(label!.font.match(/([\d.]+)px/)![1]!)).toBeGreaterThanOrEqual(14);
      expect(square.half).toBeGreaterThanOrEqual(6);
      expect(square.half).toBeLessThanOrEqual(7.5);
      expect(result.picks.find((pick) => pick.id === square.id)).toMatchObject({ x: square.x, y: square.y });
      expect(result.picks.find((pick) => pick.id === square.id)!.r).toBeGreaterThanOrEqual(12);
      const stem = out.stems!.find((stem) => Math.abs(Math.hypot(stem.b.x - square.x, stem.b.y - square.y) - square.half) < 0.01);
      expect(stem).toBeDefined();
      const points = Array.from({ length: 33 }, (_, i) => {
        const t = i / 32;
        return { x: (1 - t) ** 2 * stem!.a.x + 2 * t * (1 - t) * stem!.c.x + t ** 2 * stem!.b.x,
          y: (1 - t) ** 2 * stem!.a.y + 2 * t * (1 - t) * stem!.c.y + t ** 2 * stem!.b.y };
      });
      for (const text of out.texts) expect(crossesBox([points], text.box)).toBe(false);
    }
    expect(children.find((square) => square.id === "d0c0e0")).toMatchObject(input.nodeScreen("d0c0e0")!);
  });

  it("keeps comparison endpoints drawn and named below ordinary implementation disclosure", () => {
    const { input } = frame(null, 0.08, false, 1, 1, undefined, 2);
    const ids = ["d0c0e0", "d0c0e1"];
    Object.assign(input, { requiredBranchIds: new Set(ids) });
    input.disclosure = { ...input.disclosure, elementsAlpha: 0, elementAlphaFor: () => 0 };
    const out = emptyDialFrameMarks();
    const result = buildDialMarks(input, out);
    for (const id of ids) {
      expect(out.glyphs.find((mark) => mark.id === id)).toMatchObject({ kind: "element" });
      expect(out.texts.some((text) => text.id === id && text.role === "element")).toBe(true);
      expect(result.picks.some((pick) => pick.id === id)).toBe(true);
      expect(result.rows.some((row) => row.id === id)).toBe(true);
      expect(result.alphas.get(id)).toBe(1);
    }
  });

  it("keeps comparison endpoints inspectable when no collision-free name placement exists", () => {
    const { input } = frame(null, 0.08, false, 1, 1, undefined, 2);
    const ids = ["d0c0e0", "d0c0e1"];
    input.requiredBranchIds = new Set(ids);
    input.disclosure = { ...input.disclosure, elementsAlpha: 0, elementAlphaFor: () => 0 };
    const out = emptyDialFrameMarks();
    out.blocks = [{ id: "unrelated", box: { ...input.freeRect }, fill: 0, rim: 0, alpha: 1 }];
    const result = buildDialMarks(input, out);
    for (const id of ids) {
      expect(out.glyphs.find((mark) => mark.id === id)).toMatchObject({ kind: "element" });
      expect(out.texts.some((text) => text.id === id)).toBe(false);
      expect(result.picks.some((pick) => pick.id === id)).toBe(true);
      expect(result.rows.some((row) => row.id === id)).toBe(false);
    }
  });

  it("withholds an ordinary unnamed implementation together with its target", () => {
    const { input } = frame("d0c0", 2, false, 1, 1, undefined, 2);
    input.elementLabel = () => null;
    input.disclosure = { ...input.disclosure, entered: "d0", elementsAlpha: 1, elementAlphaFor: () => 1 };
    const out = emptyDialFrameMarks();
    const result = buildDialMarks(input, out);
    expect(out.squares.filter((square) => square.id?.startsWith("d0c0e"))).toHaveLength(0);
    expect(result.picks.filter((pick) => pick.id.startsWith("d0c0e"))).toHaveLength(0);
    expect(out.stems).toHaveLength(1);
  });
});

describe("branch reading", () => {
  it("keeps overview cards aligned and opaque when their member rows are readable", () => {
    const { input } = frame(null, 0.4, false, 9, 8);
    input.labels = {
      units: () => "역량 8 · 요소 6", more: (n) => `+${n}`,
      stale: (n) => `${n} stale`, orphans: (n) => `${n} unassigned`, ring: (min) => `${min}+`,
      reading: (read, total) => `${read}/${total}`, settling: () => "settling", linksShown: (shown, total) => `${shown}/${total}`,
    };
    const out = emptyDialFrameMarks();
    buildDialMarks(input, out);
    expect(out.blocks).toHaveLength(9);
    for (const block of out.blocks!) {
      const title = out.texts.find((text) => text.id === block.id && text.role === "domain")!;
      const units = out.texts.find((text) => text.id === block.id && text.role === "units")!;
      const glyph = out.glyphs.find((mark) => mark.id === block.id)!;
      expect(block.alpha).toBe(1);
      expect(title.x).toBe(units.x);
      expect(title.box.minX).toBeGreaterThan(glyph.x + glyph.r);
      expect(units.box.maxX).toBeLessThanOrEqual(block.box.maxX);
      expect(out.inks[units.ink]).toBe(input.inks.units);
    }
    for (const strip of out.strips) {
      const points = Array.from({ length: 65 }, (_, i) => {
        const t = i / 64;
        return { x: (1 - t) ** 2 * strip.ax + 2 * (1 - t) * t * strip.cx + t ** 2 * strip.bx,
          y: (1 - t) ** 2 * strip.ay + 2 * (1 - t) * t * strip.cy + t ** 2 * strip.by };
      });
      for (const block of out.blocks!) expect(crossesBox([points], block.box)).toBe(false);
    }
  });

  it("reports the receded ink alpha while retaining full ink for selected and cross-domain neighbors", () => {
    const { input, out, result } = frame("d0c0");
    const receded = out.discs.find((disc) => disc.id === "d0c1")!;
    expect(out.inks[receded.rim]).toBe(mixOver(input.inks.capabilityRim, input.inks.bg, map.egoRestAlpha));
    expect(result.alphas.get("d0c1")).toBe(map.egoRestAlpha);
    expect(result.alphas.get("d0c0")).toBe(1);
    expect(result.alphas.get("d1c0")).toBe(1);
    expect(result.alphas.get("p")).toBe(1);
    expect(result.picks.some((pick) => pick.id === "d0c1")).toBe(true);
  });

  it("dims context ink without hiding or disabling its visible branch member", () => {
    const { input } = frame(null);
    input.contextAlphas = new Map([["d0c0", 1]]);
    input.contextInkAlphas = new Map([["d0c0", 0.16]]);
    const out = emptyDialFrameMarks();
    const result = buildDialMarks(input, out);
    const glyph = out.glyphs.find((mark) => mark.id === "d0c0")!;
    expect(glyph).toBeDefined();
    expect(glyph.stroke).toBe(mixOver(input.inks.stale, input.inks.bg, 0.16));
    expect(result.alphas.get("d0c0")).toBe(0.16);
    expect(result.picks.some((pick) => pick.id === "d0c0")).toBe(true);
  });

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


describe("dense branch disclosure", () => {
  it("keeps a newly disclosed member name readable beside its implementation squares at the synth 1512 pose", () => {
    const { input } = frame("d0", 1, false, 20, 20, undefined, 6);
    const selected = input.scene.positions.get("d0")!;
    const scale = 1.6976102912425999;
    const toScreen = (x: number, y: number) => ({ x: 1094 + (x - selected.x) * scale, y: 500 + (y - selected.y) * scale });
    Object.assign(input, { toScreen, scale, viewportWidth: 1448, viewportHeight: 982, reducedMotion: true,
      freeRect: { minX: 0, maxX: 1448, minY: 148, maxY: 886 }, elementLabel: () => null,
      nodeScreen: (id: string) => { const p = input.scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; },
      disclosure: { ...input.disclosure, entered: "d0", elementsAlpha: 1, elementAlphaFor: () => 1 },
    });
    const member = input.scene.clusterByDomain.get("d0")!.items.filter((item) => !item.direct)[1]!;
    const positions = input.scene.positions as Map<string, { x: number; y: number }>;
    member.elementIds.forEach((id, index) => positions.set(id, { x: member.x - (20 + index * 10) / scale, y: member.y }));
    applyBranchMemberAction(input.scene, { type: "branch-members", domainId: "d0", direction: "more" }, 0);
    const out = emptyDialFrameMarks();
    const result = buildDialMarks(input, out);
    const label = out.texts.find((text) => text.id === member.id && text.role === "capability");
    expect(label).toBeDefined();
    expect(out.squares.some((square) => member.elementIds.includes(square.id!))).toBe(false);
    expect(result.picks.some((pick) => member.elementIds.includes(pick.id))).toBe(false);
    for (const square of out.squares) expect(overlaps(label!.box, { minX: square.x - square.half, maxX: square.x + square.half, minY: square.y - square.half, maxY: square.y + square.half })).toBe(false);
    expect(result.rows.find((row) => row.id === member.id)?.box).toBe(label!.box);
    expect(result.rows.some((row) => row.action?.domainId === "d0" && row.action.direction === "less")).toBe(true);
  });

  it("keeps disclosed names and both controls readable at the Orders 1040 compressed-row pose", () => {
    const { input } = frame("d1", 1, true, 9, 8, undefined, 2);
    const selected = input.scene.positions.get("d1")!;
    const scale = 0.2178308749198914;
    const toScreen = (x: number, y: number) => ({ x: 432 + (x - selected.x) * scale, y: 372 + (y - selected.y) * scale });
    Object.assign(input, { toScreen, scale, viewportWidth: 976, viewportHeight: 720, reducedMotion: true,
      freeRect: { minX: 0, maxX: 600, minY: 112, maxY: 648 },
      nodeScreen: (id: string) => { const p = input.scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; },
    });
    applyBranchMemberAction(input.scene, { type: "branch-members", domainId: "d1", direction: "more" }, 0);
    const out = emptyDialFrameMarks();
    const result = buildDialMarks(input, out);
    const members = input.scene.clusterByDomain.get("d1")!.items.filter((item) => !item.direct).slice(0, 4);
    for (const member of members) {
      expect(out.texts.some((text) => text.id === member.id && text.role === "capability"), member.id).toBe(true);
      expect(result.rows.some((row) => row.id === member.id)).toBe(true);
    }
    expect(result.rows.filter((row) => row.action?.domainId === "d1").map((row) => row.action!.direction).sort()).toEqual(["less", "more"]);
    const texts = out.texts.filter((text) => text.role !== "units" && text.role !== "status");
    for (let i = 0; i < texts.length; i++) for (let j = i + 1; j < texts.length; j++) expect(overlaps(texts[i]!.box, texts[j]!.box)).toBe(false);
    for (const text of out.texts) {
      expect(text.box.minX).toBeGreaterThanOrEqual(input.freeRect.minX);
      expect(text.box.maxX).toBeLessThanOrEqual(input.freeRect.maxX);
      expect(text.box.minY).toBeGreaterThanOrEqual(input.freeRect.minY);
      expect(text.box.maxY).toBeLessThanOrEqual(input.freeRect.maxY);
    }
  });

  it("keeps production More and Collapse hit bounds aligned with their visible labels beside neighboring cards", () => {
    const { input } = frame("d0", 1, false, 9, 8);
    const selected = input.scene.positions.get("d0")!;
    const toScreen = (x: number, y: number) => ({ x: 600 + (x - selected.x) * 0.6, y: 260 + (y - selected.y) * 0.6 });
    Object.assign(input, { toScreen, scale: 0.6, viewportWidth: 1040, viewportHeight: 720, reducedMotion: true,
      freeRect: { minX: 0, maxX: 640, minY: 100, maxY: 640 }, appearOf: (id: string) => id === "d0" ? 1 : 0,
      nodeScreen: (id: string) => { const p = input.scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; },
    });
    const check = () => {
      const out = emptyDialFrameMarks();
      const result = buildDialMarks(input, out);
      const controls = result.rows.filter((row) => row.action?.domainId === "d0");
      expect(controls.length).toBeGreaterThan(0);
      for (const row of controls) {
        const label = out.texts.find((text) => text.role === "more" && text.box === row.box);
        expect(label).toBeDefined();
        const { minX, maxX, minY, maxY } = label!.box;
        result.rows.push({ id: "neighboring-domain", box: { minX: minX - 10, maxX: maxX + 10, minY: minY - 10, maxY: maxY + 10 } });
        for (const x of [minX, (minX + maxX) / 2, maxX]) for (const y of [minY, (minY + maxY) / 2, maxY]) {
          expect(pickDialAction(result.rows, x, y)).toEqual(row.action);
          expect(pickDial(result.picks, result.rows, x, y, 8)).toBeNull();
        }
      }
      return controls;
    };
    const more = check().find((row) => row.action?.direction === "more")!;
    expect(applyBranchMemberAction(input.scene, more.action!, 0)).toBe(true);
    expect(check().some((row) => row.action?.direction === "less")).toBe(true);
  });

  it("reveals an appended capability after a remembered direct-element item without changing item order", () => {
    const modelOf = (count: number) => {
      const nodes: TreeInputNode[] = [
        { id: "p", label: "Project", kind: "project" }, { id: "d", label: "Domain", kind: "domain" },
        { id: "e", label: "Direct element", kind: "element" },
        ...Array.from({ length: count }, (_, i) => ({ id: `c${i}`, label: `Capability ${i}`, kind: "capability" as const })),
      ];
      const edges: TreeInputEdge[] = [["p", "d"], ["d", "e"], ...Array.from({ length: count }, (_, i) => ["d", `c${i}`])]
        .map(([source, target]) => ({ source: source!, target: target!, kind: "contains", relationType: "contains" }));
      return buildDialModel({ tree: readContainmentTree(nodes, edges), dependencies: [], flows: [], elementIds: ["e"] });
    };
    const before = layoutDial(modelOf(6), ["d"], tokens, null);
    const model = modelOf(7);
    const scene = layoutDial(model, ["d"], tokens, before.memory);
    const order = scene.clusters[0]!.items.map((item) => item.id);
    expect(order.indexOf("d::direct")).toBeLessThan(order.indexOf("c6"));
    const { input } = frame(null, 1, false, 1, 7);
    input.model = model;
    input.scene = scene;
    input.reducedMotion = true;
    input.now = 100;
    input.nodeScreen = (id) => { const point = scene.positions.get(id); return point ? input.toScreen(point.x, point.y) : null; };
    const render = () => {
      const out = emptyDialFrameMarks();
      return { out, result: buildDialMarks(input, out) };
    };
    expect(render().out.texts.some((text) => text.id === "c6")).toBe(false);
    applyBranchMemberAction(scene, { type: "branch-members", domainId: "d", direction: "more" }, 100);
    const expanded = render();
    expect(expanded.out.texts.some((text) => text.id === "c6" && text.role === "capability")).toBe(true);
    expect(expanded.result.picks.some((pick) => pick.id === "c6")).toBe(true);
    const collapse = expanded.out.texts.find((text) => text.id === "d" && text.role === "more")!;
    const last = scene.itemById.get("c6")!;
    expect(collapse.y).toBe(input.toScreen(last.x, last.y + tokens.pitch * 2).y);
    applyBranchMemberAction(scene, { type: "branch-members", domainId: "d", direction: "less" }, 100);
    expect(render().out.texts.some((text) => text.id === "c6")).toBe(false);
    expect(scene.clusters[0]!.items.map((item) => item.id)).toEqual(order);
  });

  it("draws newly disclosed members and restores the preview after collapse", () => {
    const { input } = frame(null, 1, false, 3, 8);
    const rebuild = () => {
      const out = emptyDialFrameMarks();
      const result = buildDialMarks({ ...input, reducedMotion: true, now: 100 }, out);
      return { out, result };
    };
    expect(rebuild().out.texts.some((text) => text.id === "d0c7")).toBe(false);
    applyBranchMemberAction(input.scene, { type: "branch-members", domainId: "d0", direction: "more" }, 100);
    const expanded = rebuild();
    expect(expanded.out.texts.some((text) => text.id === "d0c7" && text.role === "capability")).toBe(true);
    expect(expanded.result.picks.some((pick) => pick.id === "d0c7")).toBe(true);
    expect(expanded.result.rows.some((row) => row.action?.direction === "less")).toBe(true);
    applyBranchMemberAction(input.scene, { type: "branch-members", domainId: "d0", direction: "less" }, 100);
    expect(rebuild().out.texts.some((text) => text.id === "d0c7")).toBe(false);
  });

  it("does not paint a synthetic direct-member square below actual element disclosure", () => {
    const { input } = frame(null, 1);
    input.disclosure = { ...input.disclosure, elementsAlpha: 0.03 };
    const cluster = input.scene.clusters[0]!;
    cluster.items.push({ ...cluster.items[0]!, id: "direct", direct: true, elementIds: [] });
    const out = emptyDialFrameMarks();
    buildDialMarks(input, out);
    expect(out.squares.some((square) => square.id === null)).toBe(false);
    expect(out.stems).toHaveLength(out.discs.length + out.glyphs.filter((glyph) => glyph.kind === "capability").length);
  });

  it("gives the more-members row an explicit disclosure action", () => {
    const { out, result } = frame(null, 1, false, 3, 8);
    const more = out.texts.find((text) => text.id === "d0" && text.role === "more")!;
    expect(more).toBeDefined();
    expect(result.rows.find((row) => row.box === more.box)?.action).toEqual({ type: "branch-members", domainId: "d0", direction: "more" });
  });

  it("keeps static selected feedback distinct from an ordinary capability without hover or pulse", () => {
    const { input, out } = frame("d0c7", 1, false, 3, 8);
    expect(input.hoveredNodeId).toBeNull();
    expect(input.selectionPulse).toBeNull();
    expect(out.glyphs.find((glyph) => glyph.id === "d0c7")).toMatchObject({ egoState: "center", stroke: input.inks.domainLabelAttended, selectionPulse: null });
    const name = out.texts.find((text) => text.id === "d0c7" && text.role === "capability")!;
    expect(out.inks[name.ink]).toBe(input.inks.domainLabelAttended);
  });
  for (const domains of [9, 20, 50]) for (const width of [1040, 1920]) {
    it(`${domains} domains at ${width}px: keeps visible names apart`, () => {
      const { out } = frame(null, 1, true, domains, 8, width);
      const names = out.texts.filter((t) => ["project", "domain", "capability"].includes(t.role));
      expect(names.some((t) => t.role === "project")).toBe(true);
      expect(names.some((t) => t.role === "domain")).toBe(true);
      expect(names.flatMap((a, i) => names.slice(i + 1).filter((b) => overlaps(a.box, b.box)).map((b) => [a.id, b.id]))).toEqual([]);
    });
  }

  it("reveals a selected hidden capability at overview scale without disclosing all hidden members", () => {
    const { out, input } = frame("d0c199", 0.08, false, 3, 200);
    expect(input.scene.positions.has("d0c199")).toBe(true);
    expect(out.texts.some((t) => t.id === "d0c199" && t.role === "capability")).toBe(true);
    expect(out.discs.length).toBeLessThanOrEqual(18);
  });

  it("keeps a selected hidden element named after its selection pulse ends", () => {
    const { out } = frame("d0c199e0", 0.08, false, 3, 200, undefined, 1);
    expect(out.texts.some((t) => t.id === "d0c199e0" && t.role === "element")).toBe(true);
  });

  it("routes dependencies across pairs with the arrow still ending at the provider", () => {
    const base = frame(null, 1, false, 20, 8, 1920);
    const providerPair = base.input.scene.clusterByDomain.get("d0")!.branchPair;
    const source = base.input.scene.clusters.find((c) => c.branchPair !== providerPair)!.domainId;
    const { input, result, out } = frame(source, 1, false, 20, 8, 1920);
    const flow = result.flows.links.find((link) => (link.u === source && link.v === "d0") || (link.u === "d0" && link.v === source))!;
    const strip = out.strips.find((line) => line.flowKey === flow.key)!;
    expect(strip.headEnd).toBe(true);
    expect(strip.headStart).toBe(false);
    const from = input.nodeScreen(source)!;
    const to = input.nodeScreen("d0")!;
    expect(Math.hypot(strip.ax - from.x, strip.ay - from.y)).toBeLessThan(60);
    expect(Math.hypot(strip.bx - to.x, strip.by - to.y)).toBeLessThan(60);
    const curve = Array.from({ length: 65 }, (_, i) => {
      const t = i / 64;
      const u = 1 - t;
      return { x: u * u * strip.ax + 2 * u * t * strip.cx + t * t * strip.bx, y: u * u * strip.ay + 2 * u * t * strip.cy + t * t * strip.by };
    });
    const progress = curve.map(point => (point.x - strip.ax) * (strip.bx - strip.ax) + (point.y - strip.ay) * (strip.by - strip.ay));
    expect(progress.slice(1).every((value, index) => value >= progress[index]!)).toBe(true);
    for (const name of out.texts) expect(crossesBox([curve], name.box), name.text).toBe(false);
  });

  it("does not shrink the overview for a name outside the member preview", () => {
    const { input } = frame(null, 2, false, 3, 200);
    const pad = () => dialOverviewPad(input.scene, input.model, null, input.measureText, tokens);
    const before = pad();
    const capabilities = new Map(input.model.capabilityById);
    input.model = { ...input.model, capabilityById: capabilities };
    capabilities.set("d0c199", { ...capabilities.get("d0c199")!, label: "A hidden capability title that is much longer than any visible title" });
    expect(pad()).toEqual(before);
    capabilities.set("d0c0", { ...capabilities.get("d0c0")!, label: "A visible capability title that is much longer than every other title" });
    expect(pad().left).toBeGreaterThan(before.left);
  });

  it("reveals a distant active implementation when its domain is outside the viewport", () => {
    const { input } = frame("d0c0e999", 0.08, false, 1, 1, undefined, 1000);
    const target = input.scene.positions.get("d0c0e999")!;
    const toScreen = (x: number, y: number) => ({ x: 500 + (x - target.x) * input.scale, y: 400 + (y - target.y) * input.scale });
    input.toScreen = toScreen;
    input.nodeScreen = (id) => { const point = input.scene.positions.get(id); return point ? toScreen(point.x, point.y) : null; };
    input.viewportWidth = 1000;
    input.viewportHeight = 800;
    input.freeRect = { minX: 0, minY: 0, maxX: 1000, maxY: 800 };
    const out = emptyDialFrameMarks();
    const result = buildDialMarks(input, out);
    expect(out.texts.some((text) => text.id === "d0c0e999" && text.role === "element")).toBe(true);
    expect(result.picks.some((pick) => pick.id === "d0c0e999")).toBe(true);
  });

  it("keeps a hidden selected element distinct and reachable when ordinary element marks exceed the budget", () => {
    const id = "d0c0e9999";
    const { input } = frame(id, 0.0001, false, 1, 1, undefined, 10000);
    input.disclosure = { ...input.disclosure, entered: "d0", elementsAlpha: 1, elementAlphaFor: () => 1 };
    const out = emptyDialFrameMarks();
    const result = buildDialMarks(input, out);
    expect(out.glyphs.find((mark) => mark.id === id)).toMatchObject({ kind: "element", egoState: "center", selectionPulse: null });
    expect(out.texts.some((text) => text.id === id && text.role === "element")).toBe(true);
    expect(result.picks.some((pick) => pick.id === id)).toBe(true);
    expect(result.rows.some((row) => row.id === id)).toBe(true);
    expect(out.squares.length + out.glyphs.filter((mark) => mark.kind === "element").length).toBeLessThanOrEqual(1000);
  });

  for (const focus of ["contained", "direct", "free"]) {
    it(`${focus}: preserves a selected element's actual kind, mark, name and pick below disclosure`, () => {
      const nodes: TreeInputNode[] = [
        { id: "p", label: "Project", kind: "project" }, { id: "d", label: "Domain", kind: "domain" },
        { id: "c", label: "Capability", kind: "capability" },
        ...["contained", "direct", "free"].map((id) => ({ id, label: id, kind: "element" as const })),
      ];
      const edges: TreeInputEdge[] = [["p", "d"], ["d", "c"], ["c", "contained"], ["d", "direct"]]
        .map(([source, target]) => ({ source: source!, target: target!, kind: "contains", relationType: "contains" }));
      const model = buildDialModel({ tree: readContainmentTree(nodes, edges), dependencies: [], flows: [], elementIds: ["contained", "direct", "free"] });
      const scene = layoutDial(model, ["d"], tokens, null);
      const { input } = frame(null, 0.08);
      const toScreen = (x: number, y: number) => ({ x: 1800 + x * input.scale, y: 900 + y * input.scale });
      const attention = resolveDialAttention(model, null, focus);
      Object.assign(input, { model, scene, toScreen, attention, inkAttention: attention, focusedNodeId: focus,
        nodeScreen: (id: string) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; },
        elementLabel: (id: string) => id,
        disclosure: { ...input.disclosure, elementsAlpha: 0, orphanAlpha: 0, elementAlphaFor: () => 0 },
      });
      const out = emptyDialFrameMarks();
      const result = buildDialMarks(input, out);
      expect(out.glyphs.find((mark) => mark.id === focus)).toMatchObject({ kind: "element", egoState: "center" });
      expect(out.texts.some((text) => text.id === focus && text.role === "element")).toBe(true);
      expect(result.picks.find((pick) => pick.id === focus)?.r).toBeGreaterThanOrEqual(4);
      expect(result.rows.some((row) => row.id === focus)).toBe(true);
    });
  }

  it("names a selected orphan below the ordinary orphan disclosure ramp", () => {
    const { input } = frame(null, 0.08);
    const positions = new Map(input.scene.positions);
    positions.set("free", { x: 0, y: 0 });
    input.scene = { ...input.scene, positions, orphans: { ...input.scene.orphans, ids: ["free"] } };
    input.focusedNodeId = "free";
    input.elementLabel = () => "Unassigned element";
    input.disclosure = { ...input.disclosure, orphanAlpha: 0 };
    const out = emptyDialFrameMarks();
    const result = buildDialMarks(input, out);
    expect(out.texts.some((text) => text.id === "free" && text.role === "element")).toBe(true);
    expect(result.picks.some((pick) => pick.id === "free")).toBe(true);
  });

  it("keeps the member preview bounded after the element ramp opens", () => {
    const { out } = frame(null, 2, false, 3, 200);
    expect(out.discs.length).toBeLessThanOrEqual(18);
  });
});
