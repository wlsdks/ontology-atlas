import { scaledLabelFont, scaledLabelFontSize } from "../../render/labels";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { buildFlowMarks, type FlowMarksResult } from "../flow-marks";
import { inkIndex, mixOver, type DialInks } from "../ink";
import { buildLabelMarks, type Circle, type ExtraTextMark, type LabelInks, type MeasureText } from "../label-marks";
import type { DialDisclosure } from "./disclosure";
import { buildLedger, countLeaderCrossings, ledgerWanted, namesFitInPlace, type LedgerPlan } from "../ledger";
import type {
  Box,
  DialAttention,
  DialChordLight,
  DialCluster,
  DialEvidenceView,
  DialLabels,
  DialMarks,
  DialModel,
  DialPick,
  DialRowPick,
  DialScene,
  DialTokens,
  Point,
} from "../types";

interface PlateMark { x: number; y: number; r: number; fill: number; rim: number }

export interface DialFrameMarks extends DialMarks { plates: PlateMark[]; extraTexts: ExtraTextMark[] }

export type DialDisclosureInput = Pick<DialDisclosure, "capAlpha" | "plateAlpha" | "elementAlphaFor" | "orphanAlpha" | "entered" | "resolved" | "endpointSlide">;

export interface DialMarksInput {
  model: DialModel;
  scene: DialScene;
  tokens: DialTokens;
  mapTokens: OntologyMapTokens;
  inks: DialInks;
  labels: DialLabels | null;
  evidence: DialEvidenceView | null;
  attention: DialAttention;
  previous: DialAttention | null;
  inkMix: number;
  chordPresence: number;
  scale: number;
  zoomRatio: number;
  labelScale: number;
  viewportWidth: number;
  viewportHeight: number;
  freeRect: Box;
  nodeScreen(id: string): Point | null;
  toScreen(x: number, y: number): Point;
  appearOf(id: string): number;
  measureText: MeasureText;
  elementLabel(id: string): string | null;
  hoveredNodeId: string | null;
  agentFocusNodeId: string | null;
  selectionPulse: { nodeId: string; scaleFactor: number; alpha: number } | null;
  hubCount: string | null;
  disclosure: DialDisclosureInput;
}

export interface DialMarksResult {
  drawnCount: number;
  tier: "circuit" | "element";
  alphas: Map<string, number>;
  picks: DialPick[];
  rows: DialRowPick[];
  chords: DialChordLight[];
  flows: FlowMarksResult;
  ledger: { plan: LedgerPlan; leaderCrossings: number } | null;
}

const CULL_PX = 10;
const ELEMENT_CULL_PX = 4;
const ALPHA_FLOOR = 0.02;
const ALPHA_STEPS = 8;
const DRAWN_ALPHA = 0.5;
const PLATE_INSET_PITCH = 0.3;
const PLATE_RIM_SHARE = 0.42;
const RING_INK_SHARE = 0.55;
const DISC_APPEAR_FLOOR = 0.6;
const DIRECT_SQUARE_SHARE = 0.85;
const ELEMENT_HALF_SHARE = 0.22;
const ELEMENT_HALF_PX = [1.2, 3.2] as const;
const DISC_THIN_PX = 3;
const LINE_SAMPLES = 12;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function emptyDialFrameMarks(): DialFrameMarks {
  return { inks: [], strips: [], discs: [], squares: [], ticks: [], rails: [], glyphs: [], texts: [], numerals: [], leaders: [], plates: [], extraTexts: [] };
}

export function dialDiscRadiusPx(tokens: DialTokens, scale: number, elements: number): number {
  const pitchPx = tokens.pitch * scale;
  const base = clamp(pitchPx * tokens.discPitchShare, tokens.discMinPx, tokens.discMaxPx);
  return Math.min(pitchPx * tokens.discCapShare, base * (0.8 + 0.2 * Math.min(3, Math.sqrt(elements))));
}

export function dialChipRadiusPx(tokens: DialTokens, items: number, maxItems: number): number {
  return tokens.chipMinPx + (tokens.chipMaxPx - tokens.chipMinPx) * Math.sqrt(items / Math.max(1, maxItems));
}

export function dialHubRadiusPx(tokens: DialTokens, mapTokens: Pick<OntologyMapTokens, "radiusProject">, scale: number): number {
  return clamp(mapTokens.radiusProject * scale, tokens.hubMinPx, tokens.hubMaxPx);
}

const maxItemsCache = new WeakMap<DialScene, number>();

function maxItemsOf(scene: DialScene): number {
  let hit = maxItemsCache.get(scene);
  if (hit === undefined) {
    hit = Math.max(1, ...scene.clusters.map((c) => c.items.length));
    maxItemsCache.set(scene, hit);
  }
  return hit;
}

function labelInks(inks: DialInks): LabelInks {
  return {
    project: inks.projectLabel,
    domain: inks.domainLabel,
    domainReceded: inks.domainLabelReceded,
    domainAttended: inks.domainLabelAttended,
    units: inks.units,
    stale: inks.stale,
    capability: inks.capabilityLabel,
    needs: inks.needs,
    usedBy: inks.usedBy,
    orphans: inks.units,
    ring: inks.units,
    element: inks.units,
    halo: inks.bg,
  };
}

function circleBox(c: Circle, pad: number): Box {
  return { minX: c.x - c.r - pad, maxX: c.x + c.r + pad, minY: c.y - c.r - pad, maxY: c.y + c.r + pad };
}

function quadAt(ax: number, ay: number, cx: number, cy: number, bx: number, by: number, t: number): Point {
  const u = 1 - t;
  return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by };
}

function linesOf(marks: Pick<DialMarks, "strips">): Point[][] {
  return marks.strips.map((s) => Array.from({ length: LINE_SAMPLES + 1 }, (_, k) => quadAt(s.ax, s.ay, s.cx, s.cy, s.bx, s.by, k / LINE_SAMPLES)));
}

function receded(attn: DialAttention, domainId: string): boolean {
  return attn.domainId !== null && attn.domainId !== domainId && !attn.partnerDomains.has(domainId);
}

const fitCache = new WeakMap<DialCluster, Map<string, boolean>>();
const REACH_STEPS = 40;

function quantizedScale(scale: number): number {
  return Math.exp(Math.round(Math.log(scale) * REACH_STEPS) / REACH_STEPS);
}

function clusterNamesFit(input: DialMarksInput, cluster: DialCluster, font: string): boolean {
  const { tokens, freeRect: free } = input;
  const overview = input.scale / Math.max(1e-6, input.zoomRatio);
  const fitScale = Math.min(free.maxX - free.minX, free.maxY - free.minY) / (2 * Math.max(1, cluster.footprint));
  const reach = Math.min(tokens.reachCap / tokens.pitch, Math.max(input.scale, Math.min(overview * input.mapTokens.cameraMaxZoomRatio, fitScale)));
  if (!Number.isFinite(reach) || tokens.pitch * reach < tokens.capName) return false;
  const s = quantizedScale(reach);
  const key = `${s}|${font}`;
  let byKey = fitCache.get(cluster);
  if (!byKey) fitCache.set(cluster, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit !== undefined) return hit;
  const maxItems = maxItemsOf(input.scene);
  const fits = namesFitInPlace({
    items: cluster.items.map((it) => ({ id: it.id, x: it.x, y: it.y, direct: it.direct, elements: it.elementIds.length, label: input.model.capabilityById.get(it.id)?.label ?? null })),
    chip: cluster.chip,
    chipRadiusPx: dialChipRadiusPx(tokens, cluster.items.length, maxItems),
    scale: s,
    discRadiusPx: (elements) => dialDiscRadiusPx(tokens, s, elements),
    fontPx: scaledLabelFontSize("capability", tokens.labelScale),
    font,
    measureText: input.measureText,
  });
  byKey.set(key, fits);
  return fits;
}

export function buildDialMarks(input: DialMarksInput, out: DialFrameMarks): DialMarksResult {
  const { model, scene, tokens, mapTokens: map, inks, attention: attn, disclosure } = input;
  const W = input.viewportWidth;
  const H = input.viewportHeight;
  const s = input.scale;
  const pitchPx = tokens.pitch * s;
  const capAlpha = disclosure.capAlpha;
  const capsDrawn = capAlpha > ALPHA_FLOOR;
  const alphas = new Map<string, number>();
  const picks: DialPick[] = [];
  const rows: DialRowPick[] = [];
  const ink = (color: string) => inkIndex(out, color);
  const restAlpha = map.egoRestAlpha;
  const visible = (p: Point, r: number, pad: number) => p.x + r >= -pad && p.x - r <= W + pad && p.y + r >= -pad && p.y - r <= H + pad;

  const hubP = (model.projectId ? input.nodeScreen(model.projectId) : null) ?? input.toScreen(0, 0);
  const hubAppear = model.projectId ? input.appearOf(model.projectId) : 1;
  const hub: Circle | null = model.projectId ? { x: hubP.x, y: hubP.y, r: dialHubRadiusPx(tokens, map, s) * hubAppear } : null;

  const maxItems = maxItemsOf(scene);
  const chips = new Map<string, Circle>();
  for (const c of scene.clusters) {
    const p = input.nodeScreen(c.domainId) ?? input.toScreen(c.chip.x, c.chip.y);
    const fr = c.footprint * s;
    if (!visible(p, fr, 0)) continue;
    const r = dialChipRadiusPx(tokens, c.items.length, maxItems) * input.appearOf(c.domainId);
    if (r <= 0) continue;
    chips.set(c.domainId, { x: p.x, y: p.y, r });
  }

  const discs = new Map<string, Circle>();
  if (capsDrawn) {
    for (const c of scene.clusters) {
      if (!chips.has(c.domainId)) continue;
      const appear = input.appearOf(c.domainId);
      for (const it of c.items) {
        const p = it.direct ? input.toScreen(it.x, it.y) : input.nodeScreen(it.id) ?? input.toScreen(it.x, it.y);
        const r = dialDiscRadiusPx(tokens, s, it.elementIds.length) * (DISC_APPEAR_FLOOR + (1 - DISC_APPEAR_FLOOR) * capAlpha) * appear;
        if (r <= 0 || !visible(p, r, CULL_PX)) continue;
        discs.set(it.id, { x: p.x, y: p.y, r });
      }
    }
  }

  if (disclosure.plateAlpha > ALPHA_FLOOR) {
    const fill = ink(mixOver(map.nodeFillDomain, inks.bg, disclosure.plateAlpha));
    const rim = ink(mixOver(mixOver(map.nodeStrokeDim, inks.bg, PLATE_RIM_SHARE), inks.bg, disclosure.plateAlpha));
    for (const c of scene.clusters) {
      const chip = chips.get(c.domainId);
      if (!chip) continue;
      const r = (c.footprint - PLATE_INSET_PITCH * tokens.pitch) * s * input.appearOf(c.domainId);
      if (r < chip.r + 2) continue;
      out.plates.push({ x: chip.x, y: chip.y, r, fill, rim });
    }
  }

  if (scene.rings.length > 0) {
    const centre = input.toScreen(0, 0);
    const ringInk = ink(mixOver(inks.rail, inks.bg, RING_INK_SHARE));
    for (const ring of scene.rings) out.rails.push({ ink: ringInk, cx: centre.x, cy: centre.y, r: ring.radius * s, a0: 0, a1: Math.PI * 2 });
  }

  const occupied: Box[] = [];
  if (hub) occupied.push(circleBox(hub, 3));
  for (const c of chips.values()) occupied.push(circleBox(c, 2));
  for (const d of discs.values()) occupied.push(circleBox(d, 1));

  const endRadiusPx = (id: string) => chips.get(id)?.r ?? discs.get(id)?.r ?? 0;
  const flowBase = {
    model, scene, tokens, inks, attention: attn, previous: input.previous, inkMix: input.inkMix, chordPresence: input.chordPresence,
    scale: s, labelScale: input.labelScale, viewportWidth: W, viewportHeight: H, freeRect: input.freeRect,
    nodeScreen: input.nodeScreen, toScreen: input.toScreen, endRadiusPx, appearOf: input.appearOf, measureText: input.measureText, resolution: disclosure,
  };
  const planned = { inks: [] as string[], strips: [] as DialMarks["strips"], numerals: [] as DialMarks["numerals"], texts: [] as DialMarks["texts"] };
  buildFlowMarks({ ...flowBase, occupied: [...occupied], chords: [] }, planned);
  const lines = linesOf(planned);

  const entered = disclosure.entered;
  const labelInput = {
    model, scene, labels: input.labels, evidence: input.evidence, attention: attn, tokens, inks: labelInks(inks), ink, measureText: input.measureText,
    scale: s, toScreen: input.toScreen, hub, chips, discs, capAlpha, lines, freeRect: input.freeRect, elementLabel: input.elementLabel,
  };
  const labelOccupied = [...occupied];
  buildLabelMarks({ ...labelInput, occupied: labelOccupied, ledgerIds: new Set<string>() }, out);

  let ledger: DialMarksResult["ledger"] = null;
  const enteredCluster = entered ? scene.clusterByDomain.get(entered) : undefined;
  if (enteredCluster && chips.has(enteredCluster.domainId)) {
    const capIds = enteredCluster.items.filter((it) => !it.direct && discs.has(it.id)).map((it) => it.id);
    const named = new Set(out.texts.filter((t) => t.role === "capability" && t.id !== null).map((t) => t.id!));
    const namedInPlace = capIds.filter((id) => named.has(id)).length;
    const font = scaledLabelFont("capability", tokens.labelScale);
    const wanted = capIds.length > 0
      && namedInPlace < capIds.length
      && ledgerWanted({ capabilityCount: capIds.length, namedInPlace, capabilityPitchPx: pitchPx, namesFitInPlace: clusterNamesFit(input, enteredCluster, font), tokens });
    if (wanted) {
      const chip = chips.get(enteredCluster.domainId)!;
      const priority = new Set([...capIds].filter((id) => id === attn.capabilityId || attn.needsCaps.has(id) || attn.usedByCaps.has(id) || attn.relatesCaps.has(id)));
      const plan = buildLedger({
        domainId: enteredCluster.domainId,
        discs: capIds.map((id) => {
          const d = discs.get(id)!;
          const cap = model.capabilityById.get(id);
          return { id, label: cap?.label ?? id, x: d.x, y: d.y, r: d.r, degree: (cap?.needsAcross ?? 0) + (cap?.usedAcross ?? 0) };
        }),
        priority,
        freeRect: input.freeRect,
        font,
        measureText: input.measureText,
        moreText: (n) => input.labels?.more(n) ?? `+${n}`,
        tokens,
        footprint: { x: chip.x, y: chip.y, r: enteredCluster.footprint * s },
        avoid: {
          boxes: [
            ...occupied,
            ...out.texts.filter((t) => !(t.role === "capability" && t.id !== null && capIds.includes(t.id))).map((t) => t.box),
            ...out.extraTexts.map((t) => t.box),
          ],
          lines,
        },
      });
      if (plan) {
        const drop = new Set(capIds);
        for (let i = out.texts.length - 1; i >= 0; i -= 1) {
          const t = out.texts[i]!;
          if (t.role === "capability" && t.id !== null && drop.has(t.id)) out.texts.splice(i, 1);
        }
        const rowInk = ink(inks.capabilityLabel);
        const leaderInk = ink(mixOver(inks.rail, inks.bg));
        for (const row of plan.rows) {
          out.texts.push({ id: row.id, role: "ledger", text: row.text, x: row.x, y: row.y, align: plan.align, font, ink: rowInk, box: row.box, parts: null });
          rows.push({ id: row.id, box: row.box });
        }
        for (const l of plan.leaders) out.leaders.push({ id: l.id, x0: l.x0, y0: l.y0, x1: l.x1, y1: l.y1, ink: leaderInk });
        if (plan.more) out.texts.push({ id: plan.domainId, role: "more", text: plan.more.row.text, x: plan.more.row.x, y: plan.more.row.y, align: plan.align, font, ink: ink(inks.units), box: plan.more.row.box, parts: null });
        ledger = { plan, leaderCrossings: countLeaderCrossings(plan.leaders) };
      }
    }
  }

  const flowOccupied = [...labelOccupied];
  const textBoxes = [...out.texts.map((t) => t.box), ...out.extraTexts.map((t) => t.box)];
  flowOccupied.push(...textBoxes);
  const chords: DialChordLight[] = [];
  const flows = buildFlowMarks({ ...flowBase, occupied: flowOccupied, avoidTexts: textBoxes, chords }, out);

  const measured = input.evidence?.measured === true;
  let drawnElements = 0;
  if (capsDrawn) {
    const fill = ink(mixOver(map.nodeFillCapability, inks.bg, capAlpha));
    const rimRest = mixOver(inks.capabilityRim, inks.bg, capAlpha);
    const rimDim = mixOver(inks.capabilityReceded, inks.bg, capAlpha);
    const squareFill = ink(mixOver(map.nodeFillElement, inks.bg, capAlpha));
    const squareRim = ink(mixOver(inks.element, inks.bg, capAlpha));
    for (const c of scene.clusters) {
      if (!chips.has(c.domainId)) continue;
      const own = attn.domainId === c.domainId;
      for (const it of c.items) {
        const d = discs.get(it.id);
        if (!d) continue;
        if (it.direct) {
          const half = Math.max(2, d.r * DIRECT_SQUARE_SHARE);
          out.squares.push({ id: null, x: d.x, y: d.y, half, fill: squareFill, rim: squareRim });
          continue;
        }
        const isNeed = attn.needsCaps.has(it.id);
        const isUser = attn.usedByCaps.has(it.id);
        const isRelated = attn.relatesCaps.has(it.id);
        const kept = attn.capabilityId !== null ? it.id === attn.capabilityId : own;
        const dimmed = attn.domainId !== null && !kept && !isNeed && !isUser && !isRelated;
        alphas.set(it.id, capAlpha > DRAWN_ALPHA ? (dimmed ? restAlpha : 1) : 0);
        if (it.id === attn.capabilityId) continue;
        let rim = dimmed ? rimDim : rimRest;
        let dashed = false;
        if (isNeed) rim = inks.needs;
        else if (isUser) rim = inks.usedBy;
        else if (measured && !dimmed) {
          const state = input.evidence!.stateOf(it.id);
          if (state === "stale") rim = mixOver(inks.stale, inks.bg, capAlpha);
          else if (state === "unknown") {
            rim = mixOver(inks.unknownRim, inks.bg, capAlpha);
            dashed = true;
          }
        }
        out.discs.push({ id: it.id, x: d.x, y: d.y, r: d.r, fill, rim: ink(rim), dashed, lineWidth: d.r < DISC_THIN_PX ? 1 : 1.3 });
        if (capAlpha > DRAWN_ALPHA) picks.push({ id: it.id, x: d.x, y: d.y, r: d.r });
      }
    }

    for (const c of scene.clusters) {
      if (!chips.has(c.domainId)) continue;
      const inEntered = c.domainId === disclosure.entered && !(attn.domainId && receded(attn, c.domainId));
      for (const it of c.items) {
        if (!inEntered && it.id !== attn.capabilityId) continue;
        const a = disclosure.elementAlphaFor(it) * input.appearOf(c.domainId);
        if (a < ALPHA_FLOOR) continue;
        const step = Math.max(1, Math.round(a * ALPHA_STEPS)) / ALPHA_STEPS;
        const half = clamp(it.elementPitch * s * ELEMENT_HALF_SHARE, ELEMENT_HALF_PX[0], ELEMENT_HALF_PX[1]);
        const fillI = ink(mixOver(map.nodeFillElement, inks.bg, step));
        const rimI = ink(mixOver(inks.element, inks.bg, step));
        for (const el of it.elementIds) {
          const p = scene.positions.get(el);
          if (!p) continue;
          const sp = input.nodeScreen(el) ?? input.toScreen(p.x, p.y);
          if (!visible(sp, half, ELEMENT_CULL_PX)) continue;
          out.squares.push({ id: el, x: sp.x, y: sp.y, half, fill: fillI, rim: rimI });
          alphas.set(el, step > DRAWN_ALPHA ? 1 : 0);
          if (step > DRAWN_ALPHA) {
            picks.push({ id: el, x: sp.x, y: sp.y, r: half + 1 });
            drawnElements += 1;
          }
        }
      }
    }
  }

  if (disclosure.orphanAlpha > ALPHA_FLOOR && scene.orphans.ids.length > 0) {
    const step = Math.max(1, Math.round(disclosure.orphanAlpha * ALPHA_STEPS)) / ALPHA_STEPS;
    const half = clamp(scene.orphans.pitch * s * ELEMENT_HALF_SHARE, ELEMENT_HALF_PX[0], ELEMENT_HALF_PX[1]);
    const fillI = ink(mixOver(map.nodeFillElement, inks.bg, step));
    const rimI = ink(mixOver(inks.elementReceded, inks.bg, step));
    for (const id of scene.orphans.ids) {
      const p = scene.positions.get(id);
      if (!p) continue;
      const sp = input.nodeScreen(id) ?? input.toScreen(p.x, p.y);
      if (!visible(sp, half, ELEMENT_CULL_PX)) continue;
      out.squares.push({ id, x: sp.x, y: sp.y, half, fill: fillI, rim: rimI });
      alphas.set(id, step > DRAWN_ALPHA ? 1 : 0);
      if (step > DRAWN_ALPHA) {
        picks.push({ id, x: sp.x, y: sp.y, r: half + 1 });
        drawnElements += 1;
      }
    }
  }

  const pulseOf = (id: string) => (input.selectionPulse && input.selectionPulse.nodeId === id ? { scaleFactor: input.selectionPulse.scaleFactor, alpha: input.selectionPulse.alpha } : null);
  if (hub && model.projectId) {
    out.glyphs.push({
      id: model.projectId, kind: "project", x: hub.x, y: hub.y, r: hub.r, egoState: "normal",
      fill: null, stroke: null, hovered: input.hoveredNodeId === model.projectId, agentFocus: input.agentFocusNodeId === model.projectId,
      selectionPulse: pulseOf(model.projectId), count: input.hubCount, stalePip: false,
    });
    picks.unshift({ id: model.projectId, x: hub.x, y: hub.y, r: hub.r });
    alphas.set(model.projectId, 1);
  }
  const chipPicks: DialPick[] = [];
  for (const c of scene.clusters) {
    const chip = chips.get(c.domainId);
    if (!chip) {
      alphas.set(c.domainId, 0);
      continue;
    }
    const attended = attn.domainId === c.domainId;
    const dimmed = receded(attn, c.domainId);
    const stale = measured ? input.evidence!.staleByDomain.get(c.domainId) ?? 0 : 0;
    out.glyphs.push({
      id: c.domainId, kind: "domain", x: chip.x, y: chip.y, r: chip.r,
      egoState: attended && attn.selected && attn.capabilityId === null ? "center" : dimmed ? "dim" : "normal",
      fill: dimmed ? map.nodeFillDim : null, stroke: dimmed ? map.nodeStrokeDim : attended ? map.indigoBright : null,
      hovered: input.hoveredNodeId === c.domainId, agentFocus: input.agentFocusNodeId === c.domainId,
      selectionPulse: pulseOf(c.domainId), count: null, stalePip: stale > 0,
    });
    chipPicks.push({ id: c.domainId, x: chip.x, y: chip.y, r: chip.r });
    alphas.set(c.domainId, dimmed ? restAlpha : 1);
  }
  picks.splice(hub ? 1 : 0, 0, ...chipPicks);
  if (attn.capabilityId) {
    const d = discs.get(attn.capabilityId);
    if (d) {
      const r = Math.max(d.r, tokens.discGlyphPx);
      out.glyphs.push({
        id: attn.capabilityId, kind: "capability", x: d.x, y: d.y, r, egoState: attn.selected ? "center" : "normal",
        fill: null, stroke: null, hovered: input.hoveredNodeId === attn.capabilityId, agentFocus: input.agentFocusNodeId === attn.capabilityId,
        selectionPulse: pulseOf(attn.capabilityId), count: null, stalePip: measured && input.evidence!.stateOf(attn.capabilityId) === "stale",
      });
      picks.push({ id: attn.capabilityId, x: d.x, y: d.y, r });
      alphas.set(attn.capabilityId, 1);
    }
  }
  for (const id of model.orphanIds) if (!alphas.has(id)) alphas.set(id, 0);

  const discsDrawn = capAlpha > DRAWN_ALPHA ? [...discs.keys()].filter((id) => model.capabilityById.has(id)).length : 0;
  const drawnCount = (hub ? 1 : 0) + chips.size + discsDrawn + drawnElements;
  return { drawnCount, tier: drawnElements > 0 ? "element" : "circuit", alphas, picks, rows, chords, flows, ledger };
}
