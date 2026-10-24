import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";

import {
  readContainmentTree,
  rollDirectedDomainFlows,
  rollDomainDependencies,
  rollRelatesDomainPairs,
  type TreeInputEdge,
  type TreeInputNode } from "../../model/containment-tree";
import { easeOutCubic } from "../../model/camera/camera-easing";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { buildDialModel, resolveDialAttention } from "../dial-model";
import {
  clearDialFrame,
  countCrossings,
  crossfadeNumerals,
  describeLastDialFrame,
  dialFrameSummary,
  dialChordPresence,
  dialLightFrame,
  dialOwnsFlatPaint,
  focusInkMix,
  markFocusPainted,
  lastDialFrame,
  namesCrossed,
  paintDialFrame,
  sampleStrips } from "./frame";
import { layoutDial } from "../layout";
import { pickDial, pickDialAction } from "../pick";
import { emptyDialFrameMarks, type DialFrameMarks } from "./marks";
import { circularDomainOrder } from "../order";
import { resolveDialTokens } from "../tokens";
import type { DialFrameInput, DialLabels, DialModel, DialOwnershipInput, Point } from "../types";

const css = readFileSync("app/styles/map-dial-tokens.css", "utf8");
const TOKENS = resolveDialTokens((v) => (v === "--map-panel-text-primary" ? "#f4f4f8" : css.match(new RegExp(`${v}:\\s*([^;]+);`))?.[1] ?? ""));
const MAP = {
    canvasBgNear: "#101014", edgeDepends: "#8a8fa8", indigoBright: "#8b8cff", edgeSelected: "#7882ff", labelDomain: "#d0d2dc",
    labelElement: "#9a9caa", labelCapability: "#b8bac8", labelProject: "#e8e8f0", edgeContainsL2: "#3a3c48", nodeFillCapability: "#20222c",
    nodeStrokeCapability: "#7a7e96", nodeFillElement: "#1a1c24", nodeStrokeElement: "#6a6e80", nodeHoleFill: "#0c0c10", statusWarning: "#e0a040",
    nodeStrokeDim: "#44465a", nodeFillDim: "#18181c", nodeFillDomain: "#262836", nodeFillProject: "#2a2a30", nodeStrokeDomain: "#8a8ea8",
    amberHub: "#d8a040", recentChange: "#d8a040", numeralShadow: "#000000", numeralFace: "#e8e8f0", projectHairlineInner: "#806030",
    projectPinTick: "#806030", selectionRingIndigo: "#8b8cff", selectionRingHairline: "#5a5cc0", hoverRing: "#8b8cff", hoverShimmerSeg: 0.2,
    hoverShimmerPeriodMs: 2400, nodeSheenTint: "#232329", nodeSheenBlend: 0.6, egoRestAlpha: 0.32, radiusProject: 22, radiusCapability: 11,
} as unknown as OntologyMapTokens;
const LABELS: DialLabels = {
    units: (c, e) => `${c} capabilities · ${e} elements`, stale: (n) => `${n} stale`, orphans: (n) => `${n} loose`, more: (n) => `+${n} more`,
    ring: (min, max) => (max === null ? `${min}+` : `${min}–${max}`), reading: (r, t) => `${r}/${t}`, settling: () => "settling", linksShown: (s, t) => `${s} of ${t}`,
};
function recordingContext(): CanvasRenderingContext2D {
    const state: Record<string, unknown> = { globalCompositeOperation: "source-over", globalAlpha: 1, font: "10px sans-serif", lineWidth: 1 };
    const stack: Record<string, unknown>[] = [];
    const methods: Record<string, (...args: unknown[]) => unknown> = {
        save: () => stack.push({ ...state }),
        restore: () => Object.assign(state, stack.pop() ?? {}),
        measureText: (text) => ({ width: String(text).length * 6 }),
        createLinearGradient: () => ({ addColorStop: () => undefined }),
        createRadialGradient: () => ({ addColorStop: () => undefined }),
        getLineDash: () => [],
    };
    return new Proxy(state, {
        get: (target, key: string) => (key in methods ? methods[key] : key in target ? target[key] : () => undefined),
        set: (target, key: string, value) => {
            target[key] = value;
            return true;
        },
    }) as unknown as CanvasRenderingContext2D;
}
function modelOf(links = true, capabilities = 4, elements = 0): DialModel {
    const nodes: TreeInputNode[] = [{ id: "p", label: "Project", kind: "project" }];
    const edges: TreeInputEdge[] = [];
    const contains = (s: string, t: string) => edges.push({ source: s, target: t, kind: "contains", relationType: "contains" });
    for (let d = 0; d < 5; d += 1) {
        nodes.push({ id: `d${d}`, label: `Domain ${d}`, kind: "domain" });
        contains("p", `d${d}`);
        for (let c = 0; c < capabilities; c += 1) {
            nodes.push({ id: `d${d}c${c}`, label: `Capability ${d}.${c}`, kind: "capability" });
            contains(`d${d}`, `d${d}c${c}`);
            for (let e = 0; e < elements; e += 1) {
                const id = `d${d}c${c}e${e}`;
                nodes.push({ id, label: `Element ${id}`, kind: "element" });
                contains(`d${d}c${c}`, id);
            }
        }
    }
    for (let d = 0; d < 5 && links; d += 1)
        edges.push({ source: `d${d}c0`, target: `d${(d + 1) % 5}c1`, kind: "depends", relationType: "depends_on" });
    if (links) edges.push({ source: "d1c2", target: "d0c3", kind: "depends", relationType: "depends_on" }, { source: "d2c2", target: "d0c3", kind: "depends", relationType: "depends_on" });
    const tree = readContainmentTree(nodes, edges);
    const dependencies = rollDomainDependencies(tree, edges);
    return buildDialModel({ tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, edges)) });
}
const W = 1200;
const H = 800;
function frameInput(model: DialModel, over: Partial<DialFrameInput> = {}): DialFrameInput {
    const scene = layoutDial(model, circularDomainOrder(model, null).order, TOKENS, null);
    const e = scene.extent;
    const scale = Math.min(W / (e.maxX - e.minX), H / (e.maxY - e.minY)) * 0.8;
    const toScreen = (x: number, y: number): Point => ({ x: W / 2 + x * scale, y: H / 2 + y * scale });
    return {
        ctx: recordingContext(), dial: { model, scene, overviewPadPx: { left: 0, right: 0, top: 0, bottom: 0 } }, worldKey: {},
        nodeScreen: (id) => { const p = scene.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen, scale, zoomRatio: 1,
        viewportWidth: W, viewportHeight: H, freeRect: { minX: 8, minY: 60, maxX: W - 60, maxY: H - 30 },
        mapTokens: MAP, dialTokens: TOKENS, labels: LABELS, evidence: null,
        hoveredNodeId: null, focusedNodeId: null, agentFocusNodeId: null, selectionPulse: null, appearOf: () => 1, hubCount: null,
        now: 0, reducedMotion: false, domainAppear: 1, elementLabel: (id) => id,
        ...over,
    };
}
afterEach(() => clearDialFrame());
describe("dialOwnsFlatPaint", () => {
    const owning: DialOwnershipInput = {
        hasDial: true, realmActive: false, edgeSelected: false, edgePreviewed: false,
        trailLensOpen: false, spotlightActive: false, pathLensActive: false, impactLensActive: false, focusedIsElement: false, focusedRelationsCaptioned: false, brushedIsElement: false,
    };
    it("owns Flat only when the dial exists and nothing else claims the paint", () => {
        expect(dialOwnsFlatPaint(owning)).toBe(true);
        expect(dialOwnsFlatPaint({ ...owning, hasDial: false })).toBe(false);
        for (const key of ["realmActive", "edgeSelected", "edgePreviewed", "trailLensOpen", "spotlightActive", "pathLensActive", "impactLensActive", "focusedIsElement", "focusedRelationsCaptioned", "brushedIsElement"] as const) {
            expect(dialOwnsFlatPaint({ ...owning, [key]: true }), key).toBe(false);
        }
    });
});
describe("focus clock", () => {
    const model = modelOf();
    const rest = resolveDialAttention(model, null, null);
    const onD1 = resolveDialAttention(model, "d1", null);
    it("mixes inks from 0 at the first painted frame to 1 at 120 ms on easeOutCubic", () => {
        const key = {};
        expect(focusInkMix(key, rest, 0, false).inkMix).toBe(1);
        expect(focusInkMix(key, onD1, 1000, false).inkMix).toBe(0);
        markFocusPainted(key, 1000);
        expect(focusInkMix(key, onD1, 1060, false).inkMix).toBeCloseTo(easeOutCubic(0.5));
        expect(focusInkMix(key, onD1, 1120, false).inkMix).toBe(1);
        expect(focusInkMix(key, onD1, 1400, false).inkMix).toBe(1);
    });
    it("counts from when the first focused frame finished painting, so a long first frame skips nothing", () => {
        const key = {};
        focusInkMix(key, rest, 0, false);
        expect(focusInkMix(key, onD1, 1006, false).inkMix).toBe(0);
        markFocusPainted(key, 1057);
        markFocusPainted(key, 1090);
        expect(focusInkMix(key, onD1, 1073, false).inkMix).toBeCloseTo(easeOutCubic(16 / 120));
    });
    it("is 1 at once under reduced motion", () => {
        const key = {};
        focusInkMix(key, rest, 0, true);
        expect(focusInkMix(key, onD1, 500, true).inkMix).toBe(1);
    });
    it("crossfades from the previous attention", () => {
        const key = {};
        focusInkMix(key, onD1, 0, false);
        const onD2 = resolveDialAttention(model, "d2", null);
        expect(focusInkMix(key, onD2, 500, false).previous?.key).toBe(onD1.key);
        markFocusPainted(key, 500);
        expect(focusInkMix(key, onD2, 560, false).previous?.key).toBe(onD1.key);
        expect(focusInkMix(key, onD2, 700, false).previous).toBeNull();
    });
});
describe("count crossfade", () => {
    const box = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
    const frameWith = (text: string, width = 10) => {
        const marks = emptyDialFrameMarks();
        marks.inks.push("#aaaaaa");
        marks.numerals.push({ flowKey: "far\0d1", text, x: 5, y: 5, ink: 0, halo: true, font: "650 11px x", box: { ...box, minX: 5 - width / 2, maxX: 5 + width / 2 }, parts: null });
        return marks;
    };
    const shown = (marks: ReturnType<typeof frameWith>) => marks.numerals.map((n) => [n.text, n.alpha ?? 1]);
    it("fades a new count in and crossfades a changed one in place over 120 ms", () => {
        const key = {};
        expect(shown(withFade(frameWith("←9"), key, 0))).toEqual([["←9", 1]]);
        expect(shown(withFade(frameWith("←9"), key, 500))).toEqual([["←9", 1]]);
        expect(shown(withFade(frameWith("←7"), key, 1000))).toEqual([["←7", 0], ["←9", 1]]);
        expect(shown(withFade(frameWith("←7"), key, 1060))).toEqual([["←7", 0.5], ["←9", 0.5]]);
        expect(shown(withFade(frameWith("←7"), key, 1120))).toEqual([["←7", 1]]);
        const empty = emptyDialFrameMarks();
        crossfadeNumerals(empty, key, 1200, false);
        expect(shown(withFade(frameWith("←7"), key, 1300))).toEqual([["←7", 0]]);
        expect(shown(withFade(frameWith("←7"), key, 1360))).toEqual([["←7", 0.5]]);
    });
    it("gives the fading figure a box of its own width where the count stands", () => {
        const key = {};
        withFade(frameWith("→4 ←3", 40), key, 0);
        const fading = withFade(frameWith("←9", 16), key, 1000).numerals.find((n) => n.text === "→4 ←3")!;
        expect(fading.box).toEqual({ minX: -15, minY: 0, maxX: 25, maxY: 10 });
    });
    it("swaps at once under reduced motion", () => {
        const key = {};
        withFade(frameWith("←9"), key, 0, true);
        expect(shown(withFade(frameWith("←7"), key, 10, true))).toEqual([["←7", 1]]);
    });
    function withFade(marks: ReturnType<typeof frameWith>, key: object, now: number, reduced = false) {
        crossfadeNumerals(marks, key, now, reduced);
        return marks;
    }
});

describe("focus on a new world", () => {
    it("keeps an unchanged focus settled: the ink stays mixed and nothing crossfades", () => {
        const model = modelOf();
        const first = frameInput(model, { focusedNodeId: "d1", now: 0, worldKey: {} });
        paintDialFrame(first);
        expect(paintDialFrame({ ...first, now: 400 }).inkMix).toBe(1);
        const refreshed = paintDialFrame({ ...first, worldKey: {}, now: 416 });
        expect(refreshed.inkMix).toBe(1);
        expect(refreshed.light).toMatchObject({ focused: true, inkMix: 1 });
        expect(focusInkMix(first.worldKey, resolveDialAttention(model, null, "d1"), 420, false)).toEqual({ inkMix: 1, previous: null });
    });
});
describe("dialChordPresence", () => {
    it("is 0 until the chord arrival share of the domain rise, then eases to 1", () => {
        expect(dialChordPresence(TOKENS, 0)).toBe(0);
        expect(dialChordPresence(TOKENS, TOKENS.chordArrival)).toBe(0);
        const mid = dialChordPresence(TOKENS, (TOKENS.chordArrival + 1) / 2);
        expect(mid).toBeCloseTo(0.5);
        expect(dialChordPresence(TOKENS, 1)).toBe(1);
    });
});
describe("frame registry", () => {
    it("collapses cards and preview stems when their rows no longer fit", () => {
        const result = paintDialFrame(frameInput(modelOf(false), { scale: 0.2, reducedMotion: true }));
        const marks = result.marks as DialFrameMarks;
        expect(marks.blocks).toHaveLength(0);
        expect(marks.stems).toHaveLength(0);
        expect(result.marks.texts.filter((t) => t.role === "domain")).toHaveLength(5);
        expect(result.marks.glyphs.filter((g) => g.kind === "domain")).toHaveLength(5);
    });

    it("keeps selected same-domain partners named when overview rows are too small", () => {
        const base = modelOf();
        const model = { ...base, capabilityDependencies: [...base.capabilityDependencies, { from: "d1c0", to: "d1c3", fromDomain: "d1", toDomain: "d1" }] };
        const result = paintDialFrame(frameInput(model, { scale: 0.3, focusedNodeId: "d1c0", reducedMotion: true }));
        const named = result.marks.texts.filter((t) => t.role === "capability").map((t) => t.id);
        expect(named).toContain("d1c0");
        expect(named).toContain("d1c3");
        expect(describeLastDialFrame(W, H)!.flows).toContainEqual(expect.objectContaining({ a: "d1c0", b: "d1c3", ab: 1, drawn: true }));
    });

    it("keeps compact previews actionable and restores a selected hidden capability's feedback", () => {
        const input = frameInput(modelOf(false, 8), { reducedMotion: true, scale: 0.65 });
        const first = paintDialFrame(input);
        expect(first.alphas.get("d1c7")).toBe(0);
        const more = first.marks.texts.find((t) => t.id === "d1" && t.role === "more")!;
        expect(more).toBeDefined();
        expect(pickDial(first.picks, first.rows, (more.box.minX + more.box.maxX) / 2, more.y, 0)).toBeNull();
        expect(pickDialAction(first.rows, (more.box.minX + more.box.maxX) / 2, more.y)).toEqual({ type: "branch-members", domainId: "d1", direction: "more" });
        const agentOnly = paintDialFrame({ ...input, agentFocusNodeId: "d1c7" });
        expect(agentOnly.marks.glyphs).toContainEqual(expect.objectContaining({ id: "d1c7", agentFocus: true }));
        expect(agentOnly.marks.texts.some((t) => t.id === "d1c7" && t.role === "capability")).toBe(true);
        const next = paintDialFrame({ ...input, focusedNodeId: "d1c7", agentFocusNodeId: "d1c7", selectionPulse: { nodeId: "d1c7", scaleFactor: 1.1, alpha: 1 } });
        expect(next.marks.glyphs).toContainEqual(expect.objectContaining({ id: "d1c7", kind: "capability", egoState: "center", agentFocus: true, selectionPulse: null }));
        expect(next.marks.texts.some((t) => t.id === "d1c7" && t.role === "capability")).toBe(true);
    });

    it("reveals element names when detailed zoom has room", () => {
        const input = frameInput(modelOf(false, 4, 1), { scale: 4, focusedNodeId: "d1c0", reducedMotion: true });
        const result = paintDialFrame(input);
        expect(result.marks.squares.some((q) => q.id === "d1c0e0")).toBe(true);
        expect(result.marks.texts.some((t) => t.role === "element" && t.id === "d1c0e0")).toBe(true);
    });
    it("selects the entire domain label block and keeps its geometry stable under hover", () => {
        const input = frameInput(modelOf(), { reducedMotion: true });
        const first = paintDialFrame(input);
        const row = first.rows.find((r) => r.id === "d1")!;
        expect(row).toBeDefined();
        expect(pickDial(first.picks, first.rows, row.box.maxX - 3, row.box.maxY - 3, 0)).toBe("d1");
        const before = first.marks.texts.map((t) => ({ id: t.id, role: t.role, box: { ...t.box } }));
        const normal = first.marks.texts.find((t) => t.id === "d1" && t.role === "domain")!;
        const restInk = first.marks.inks[normal.ink];
        const hovered = paintDialFrame({ ...input, hoveredNodeId: "d1" });
        expect(hovered.marks.texts.map((t) => ({ id: t.id, role: t.role, box: t.box }))).toEqual(before);
        const focused = hovered.marks.texts.find((t) => t.id === "d1" && t.role === "domain")!;
        expect(hovered.marks.inks[focused.ink]).toBe(restInk);
        expect((hovered.marks as DialFrameMarks).blocks!.some((b) => hovered.marks.inks[b.rim] === restInk)).toBe(true);
    });

    it("withholds full domain labels until the arriving marks have separated", () => {
        const r = paintDialFrame(frameInput(modelOf(), { appearOf: (id) => id === "p" ? 1 : 0.1 }));
        expect(r.marks.glyphs.filter((g) => g.kind === "domain").length).toBeGreaterThan(0);
        expect(r.marks.texts.filter((t) => t.role === "domain")).toHaveLength(0);
    });
    it("sets the last frame and the light frame, and clears both", () => {
        const model = modelOf();
        expect(lastDialFrame()).toBeNull();
        const result = paintDialFrame(frameInput(model, { focusedNodeId: "d1", now: 10 }));
        expect(lastDialFrame()).toBe(result);
        expect(dialLightFrame()).toMatchObject({ attentionKey: resolveDialAttention(model, null, "d1").key, focused: true });
        expect(result.labelBoxes.some((b) => b.nodeId === "d1")).toBe(true);
        clearDialFrame();
        expect(lastDialFrame()).toBeNull();
        expect(dialLightFrame()).toBeNull();
        expect(describeLastDialFrame(W, H)).toBeNull();
    });
    it("keeps the project context and unmeasured-evidence caption stable during arrival", () => {
        const model = modelOf(false);
        const labels = { ...LABELS, evidenceUnmeasured: () => "Evidence not measured" };
        const caption = (appear: number) => {
            const freeRect = { minX: W / 2 - 160, maxX: W / 2 + 160, minY: 8, maxY: H - 8 };
            const r = paintDialFrame(frameInput(model, { labels, evidence: new Map(), freeRect, appearOf: (id) => (id.startsWith("d") && !id.includes("c") ? appear : 1) }));
            const text = r.marks.texts.find((t) => t.text === "Evidence not measured")!;
            return { y: text.y, box: text.box, freeRect, named: r.marks.texts.some((t) => t.role === "project") };
        };
        const before = caption(0.05);
        const after = caption(1);
        expect([before.named, after.named]).toEqual([true, true]);
        expect(before.y).toBe(after.y);
        for (const frame of [before, after]) {
            expect(frame.box.minX).toBeGreaterThanOrEqual(frame.freeRect.minX);
            expect(frame.box.maxX).toBeLessThanOrEqual(frame.freeRect.maxX);
            expect(frame.box.minY).toBeGreaterThanOrEqual(frame.freeRect.minY);
            expect(frame.box.maxY).toBeLessThanOrEqual(frame.freeRect.maxY);
        }
    });
    it("hides an overwide evidence caption in a narrow free rect while retaining the project name", () => {
        const model = modelOf(false);
        const labels = { ...LABELS, evidenceUnmeasured: () => "Evidence not measured" };
        const freeRect = { minX: W / 2 - 60, maxX: W / 2 + 60, minY: 8, maxY: H - 8 };
        const result = paintDialFrame(frameInput(model, { labels, evidence: new Map(), freeRect }));
        expect(result.marks.texts.some((text) => text.text === "Evidence not measured")).toBe(false);
        expect(result.marks.texts.some((text) => text.role === "project")).toBe(true);
    });
    it("describes the last frame with rings, disclosure, budget and placement", () => {
        const model = modelOf();
        const input = frameInput(model);
        paintDialFrame(input);
        const probe = describeLastDialFrame(W, H)!;
        expect(probe.owns).toBe(true);
        expect(probe.rings).toEqual(input.dial.scene.rings);
        expect(probe.disclosure.capAlpha).toBeGreaterThanOrEqual(0);
        expect(probe.budget.total).toBe(probe.flows.filter((f) => !f.relatesOnly).length);
        expect(probe.flows.filter((f) => f.drawn).length).toBeGreaterThan(0);
        expect(probe.placement).toEqual({ state: "settled", held: 0 });
        expect(probe.clusters).toHaveLength(5);
        expect(probe.textOverlaps).toBe(0);
        const last = lastDialFrame()!;
        expect(probe.discs.map((d) => d.ink)).toEqual(last.marks.discs.map((d) => last.marks.inks[d.rim]));
        expect(probe.discs.every((d) => d.ink.startsWith("#"))).toBe(true);
        expect(probe.squares).toBe(last.marks.squares.filter((q) => q.id !== null && !input.dial.scene.orphans.ids.includes(q.id)).length);
    });
});
describe("frame slot", () => {
    it("keeps nothing of the painted input: the context, the world and the closures can go once the frame is painted", () => {
        const model = modelOf();
        const input = frameInput(model, { focusedNodeId: "d1" });
        const revokers: (() => void)[] = [];
        const revocable = <T extends object>(target: T): T => {
            const { proxy, revoke } = Proxy.revocable(target, {});
            revokers.push(revoke);
            return proxy;
        };
        paintDialFrame({
            ...input,
            ctx: revocable(input.ctx),
            dial: { model: revocable(input.dial.model), scene: revocable(input.dial.scene), overviewPadPx: input.dial.overviewPadPx },
            worldKey: revocable({}),
            nodeScreen: revocable(input.nodeScreen),
            toScreen: revocable(input.toScreen),
            appearOf: revocable(input.appearOf),
            elementLabel: revocable(input.elementLabel),
        });
        const probe = describeLastDialFrame(W, H);
        const summary = dialFrameSummary();
        expect(probe?.clusters).toHaveLength(5);
        for (const revoke of revokers)
            revoke();
        expect(describeLastDialFrame(W, H)).toEqual(probe);
        expect(dialFrameSummary()).toEqual(summary);
        expect(lastDialFrame()?.light.attentionKey).toBe(resolveDialAttention(model, null, "d1").key);
    });
});
describe("probe metrics", () => {
    const strip = (ax: number, ay: number, bx: number, by: number) => ({ ax, ay, cx: (ax + bx) / 2, cy: (ay + by) / 2, bx, by });
    it("counts one crossing between two crossing strips", () => {
        expect(countCrossings(sampleStrips([strip(0, 100, 200, 104), strip(103, 0, 97, 200)]), W, H)).toBe(1);
    });
    it("ignores an intersection within 16 px of an end", () => {
        expect(countCrossings(sampleStrips([strip(0, 100, 200, 100), strip(190, 90, 190, 300)]), W, H)).toBe(0);
    });
    it("counts a strip through a text box as one name crossed", () => {
        const lines = sampleStrips([strip(0, 100, 400, 100)]);
        const crossed = namesCrossed(lines, [{ text: "Orders", box: { minX: 150, minY: 90, maxX: 210, maxY: 110 } }, { text: "Billing", box: { minX: 150, minY: 200, maxX: 210, maxY: 220 } }]);
        expect(crossed).toEqual({ count: 1, names: ["Orders"] });
    });
});
