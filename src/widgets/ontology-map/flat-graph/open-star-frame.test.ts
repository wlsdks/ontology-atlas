import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import dogfoodManifest from "@/entities/docs-vault/data/manifest.json";
import type { VaultManifest } from "@/entities/docs-vault";
import { deriveOntologyFromVault } from "@/entities/docs-vault/lib/derive-ontology-from-vault";
import { isContainmentRelation } from "@/entities/knowledge-graph";

import { buildDialModel } from "../dial/dial-model";
import { clearDialFrame, describeLastDialFrame } from "../dial/frame/frame";
import type { DialFrameInput, DialLabels, DialModel, Point } from "../dial/types";
import {
  directRelations, readContainmentTree, rollDirectedDomainFlows, rollDomainDependencies, rollRelatesCapabilityPairs, rollRelatesDomainPairs,
  type TreeInputEdge, type TreeInputNode,
} from "../model/containment-tree";
import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { paintFlatGraphFrame } from "./frame";
import { domainStarIds } from "./open-star";
import { buildFlatGraphScene } from "./scene";
import { resolveFlatGraphTokens } from "./tokens";

const KINDS = new Set(["project", "domain", "capability", "element"]);
const W = 1410;
const H = 840;
const FRAME_MS = 16;

function dogfoodModel(): DialModel {
  const d = deriveOntologyFromVault(dogfoodManifest as unknown as VaultManifest);
  const treeNodes: TreeInputNode[] = (d.nodes as { id: string; kind: string; title?: string }[])
    .filter((n) => KINDS.has(n.kind)).map((n) => ({ id: n.id, label: n.title ?? n.id, kind: n.kind as TreeInputNode["kind"] }));
  const treeEdges: TreeInputEdge[] = (d.edges as { from: string; to: string; type: string }[])
    .map((e) => ({ source: e.from, target: e.to, kind: isContainmentRelation(e.type) ? "contains" : "depends", relationType: e.type }));
  const tree = readContainmentTree(treeNodes, treeEdges);
  const dependencies = rollDomainDependencies(tree, treeEdges);
  return buildDialModel({
    tree, dependencies, flows: rollDirectedDomainFlows(dependencies, rollRelatesDomainPairs(tree, treeEdges)),
    elementIds: treeNodes.filter((n) => n.kind === "element").map((n) => n.id), relates: rollRelatesCapabilityPairs(tree, treeEdges), direct: directRelations(treeEdges),
  });
}

function cssValues(): Map<string, string> {
  const values = new Map<string, string>();
  for (const file of ["app/styles/map-graph-tokens.css", "app/styles/tokens.css", "app/styles/base-map-tokens.css"]) {
    const css = readFileSync(join(process.cwd(), file), "utf8");
    for (const m of css.matchAll(/(--[\w-]+):\s*([^;]+);/g)) if (!values.has(m[1]!)) values.set(m[1]!, m[2]!.trim());
  }
  return values;
}

const TOKENS = resolveFlatGraphTokens((v) => cssValues().get(v) ?? "");
const LABELS: DialLabels = {
  units: (c, e) => `${c} capabilities · ${e} elements`, stale: (n) => `${n} stale`, orphans: (n) => `${n} unplaced`, more: (n) => `+${n}`,
  ring: () => "", reading: () => "", settling: () => "", linksShown: () => "",
};

function silentContext(): CanvasRenderingContext2D {
  const state: Record<string, unknown> = { globalCompositeOperation: "source-over", globalAlpha: 1, font: "10px sans-serif", lineWidth: 1 };
  const methods: Record<string, (...args: unknown[]) => unknown> = {
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

const model = dogfoodModel();
const scene = buildFlatGraphScene(model, TOKENS.layout, null);
const layout = scene.graph!;

/** A camera at `zoomRatio` of the fitting scale, centred on `centreId`. */
function inputAt(centreId: string, zoomRatio: number, worldKey: object): (over: Partial<DialFrameInput>) => DialFrameInput {
  const e = layout.extent;
  const fit = Math.min(W / (e.maxX - e.minX), H / (e.maxY - e.minY));
  const scale = fit * zoomRatio;
  const centre = layout.positions.get(centreId)!;
  const toScreen = (x: number, y: number): Point => ({ x: W / 2 + (x - centre.x) * scale, y: H / 2 + (y - centre.y) * scale });
  const ctx = silentContext();
  return (over) => ({
    ctx, dial: { model, scene, overviewPadPx: { left: 0, right: 0, top: 0, bottom: 0 }, labels: LABELS }, worldKey,
    nodeScreen: (id) => { const p = layout.positions.get(id); return p ? toScreen(p.x, p.y) : null; }, toScreen, scale, zoomRatio,
    viewportWidth: W, viewportHeight: H, freeRect: { minX: 0, minY: 0, maxX: W, maxY: H },
    mapTokens: { canvasBgNear: "#101014" } as unknown as OntologyMapTokens, dialTokens: {} as DialFrameInput["dialTokens"], labels: LABELS, evidence: null,
    hoveredNodeId: null, focusedNodeId: null, agentFocusNodeId: null, selectionPulse: null, appearOf: () => 1, hubCount: null,
    now: 0, reducedMotion: false, domainAppear: 1, elementLabel: (id) => id,
    ...over,
  });
}

/** Every star mark's drawn radius per 16 ms frame from `now` until the motion settles, the settled frame last. */
function radiiUntilSettled(frame: (over: Partial<DialFrameInput>) => DialFrameInput, focusedNodeId: string | null, ids: readonly string[], from: number): { frames: Map<string, number>[]; end: number } {
  const frames: Map<string, number>[] = [];
  let now = from;
  for (let i = 0; i < 200; i += 1, now += FRAME_MS) {
    const result = paintFlatGraphFrame(frame({ focusedNodeId, now }), TOKENS);
    const probe = describeLastDialFrame(W, H)!;
    const drawn = new Map([...probe.discs, ...probe.glyphs].map((m) => [m.id, m.r]));
    frames.push(new Map(ids.flatMap((id) => (drawn.has(id) ? [[id, drawn.get(id)!] as const] : []))));
    if (!result.branchMembersAnimating) return { frames, end: now };
  }
  throw new Error(`${focusedNodeId} never settled`);
}

/** The largest step one mark's radius takes between frames, beside the change its whole move makes. */
function widestStep(frames: readonly Map<string, number>[], id: string): { step: number; travel: number; low: number; high: number } {
  const radii = frames.map((f) => f.get(id)).filter((r): r is number => r !== undefined);
  let step = 0;
  for (let i = 1; i < radii.length; i += 1) step = Math.max(step, Math.abs(radii[i]! - radii[i - 1]!));
  return { step, travel: Math.abs(radii.at(-1)! - radii[0]!), low: Math.min(...radii), high: Math.max(...radii) };
}

afterEach(() => clearDialFrame());

describe("an opened domain star retargeted to one of its members and back", () => {
  const domainId = model.domains.find((d) => d.id.endsWith("human-workbench"))!.id;
  const { capabilities, elements } = domainStarIds(model, domainId);
  const member = capabilities.find((id) => id.endsWith("agent-work-visibility"))!;
  const ids = [...capabilities, ...elements];

  it("moves every star mark through the frames between its two pictures, never through its rest radius", () => {
    const frame = inputAt(domainId, 3, {});
    const opened = radiiUntilSettled(frame, domainId, ids, 0);
    const toMember = radiiUntilSettled(frame, member, ids, opened.end + FRAME_MS);
    const back = radiiUntilSettled(frame, domainId, ids, toMember.end + FRAME_MS);
    for (const [leg, frames] of [["domain to member", [opened.frames.at(-1)!, ...toMember.frames]], ["member to domain", [toMember.frames.at(-1)!, ...back.frames]]] as const) {
      for (const id of ids) {
        const radii = frames.map((f) => f.get(id)).filter((r): r is number => r !== undefined);
        if (radii.length < 2) continue;
        const { step, travel, low, high } = widestStep(frames, id);
        const first = radii[0]!;
        const last = radii.at(-1)!;
        expect(low, `${leg}: ${id} sinks below both its pictures`).toBeGreaterThanOrEqual(Math.min(first, last) - 0.5);
        expect(high, `${leg}: ${id} swells past both its pictures`).toBeLessThanOrEqual(Math.max(first, last) + 0.5);
        expect(step, `${leg}: ${id} jumps in one frame`).toBeLessThanOrEqual(travel * 0.6 + 0.5);
      }
    }
  });
});

describe("an opened domain star beside an open dock, where no attention runs", () => {
  const domainId = model.domains.find((d) => d.id.endsWith("human-workbench"))!.id;
  const { capabilities, elements } = domainStarIds(model, domainId);
  const ids = [...capabilities, ...elements];
  const contextAlphas = new Map([...layout.positions.keys()].map((id) => [id, 1]));

  it("opens and closes over frames, and stops asking for frames once it settles", () => {
    const base = inputAt(domainId, 3, {});
    const frame = (over: Partial<DialFrameInput>) => base({ contextAlphas, ...over });
    const rest = radiiUntilSettled(frame, null, ids, 0);
    const opened = radiiUntilSettled(frame, domainId, ids, rest.end + FRAME_MS);
    const closed = radiiUntilSettled(frame, null, ids, opened.end + FRAME_MS);
    expect(opened.frames.length, "the star opens over more than one frame").toBeGreaterThan(2);
    for (const [leg, frames] of [["open", [rest.frames.at(-1)!, ...opened.frames]], ["close", [opened.frames.at(-1)!, ...closed.frames]]] as const) {
      for (const id of ids) {
        const { step, travel } = widestStep(frames, id);
        expect(step, `${leg}: ${id} jumps in one frame`).toBeLessThanOrEqual(travel * 0.6 + 0.5);
      }
    }
  });
});
