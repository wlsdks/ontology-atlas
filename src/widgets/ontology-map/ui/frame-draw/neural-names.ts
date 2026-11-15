import { FONT_WEIGHT } from "@/shared/ui/tokens/font-weight";
import { neuralCellIsStale, neuralGraphOf, type NeuralGraph } from "../../model/dome-view/neural-cells";
import { standingDomainTitles, type TitleCandidate } from "../../model/dome-view/neural-titles";
import { labelFontFamily } from "../../render/labels";
import { passState } from "./frame-state";
import type { FrameInputs } from "./frame-begin";
import { litRaster } from "./neural-lit-raster";
import type { NeuralFrame, NeuralPool } from "./neural-frame";
import { lastLit } from "./neural-spread";
import type { NeuralLabels } from "./paint-neural";

const NAME_GRID_PX = 48;
const PLATE_EDGE_ALPHA = 0.2;
/** A name's rank: dependencies first, then nearness, one dependency weighing a quarter of the depth. */
const NAME_DEPTH_WEIGHT = 4;
/** A rest name's alpha before depth fades it. */
const REST_NAME_ALPHA = 0.9;
const TITLE_NAME_ALPHA = 0.96;
const TITLE_META_ALPHA = 0.85;
/** A domain name's halo is this much wider than a capability name's. */
const TITLE_HALO_EXTRA_PX = 1;
/** The focus plate's title is this much larger than a name, its facts this much smaller than a domain's meta. */
const PLATE_TITLE_EXTRA_PX = 2.5;
const PLATE_FACT_LESS_PX = 0.5;
/** The plate holds two lines of names and this many paddings of air. */
const PLATE_LINES = 2;
const PLATE_PAD_SHARE = 1.8;
/** How far, in name heights, a focus's name may stand off its first places to keep clear of lit axons. */
const NAME_NUDGE_LINES = 1.2;
/** A selection's indirect dependents take at most this share of the name budget, nearest first. */
const INDIRECT_NAME_SHARE = 0.25;
/** At most this many names are tried per drawn name, so a dense frame stops early. */
const NAME_TRIES_PER_NAME = 4;
/** Off-screen cells this far past an edge may still put a name on screen. */
const NAME_CULL_MARGIN_PX = 160;

/** Measured label widths per font, so a label is measured once rather than once per placement try. */
const labelWidths = new Map<string, Map<string, number>>();
const LABEL_WIDTH_FONTS_MAX = 8;

interface Box { minX: number; minY: number; maxX: number; maxY: number }

/** Uniform grid of occupied boxes: insert and query are O(boxes in the touched cells). */
class BoxGrid {
  private cells = new Map<number, Box[]>();
  private key(cx: number, cy: number) { return cx * 73856093 ^ cy * 19349663; }
  private span(box: Box, visit: (key: number) => boolean | void): boolean {
    for (let cx = Math.floor(box.minX / NAME_GRID_PX); cx <= Math.floor(box.maxX / NAME_GRID_PX); cx += 1) {
      for (let cy = Math.floor(box.minY / NAME_GRID_PX); cy <= Math.floor(box.maxY / NAME_GRID_PX); cy += 1) {
        if (visit(this.key(cx, cy)) === true) return true;
      }
    }
    return false;
  }
  add(box: Box): void {
    this.span(box, (key) => {
      const list = this.cells.get(key);
      if (list) list.push(box); else this.cells.set(key, [box]);
    });
  }
  hits(box: Box, ignore?: Box): boolean {
    return this.span(box, (key) => (this.cells.get(key) ?? []).some((o) => o !== ignore &&
      box.minX < o.maxX && box.maxX > o.minX && box.minY < o.maxY && box.maxY > o.minY));
  }
}

interface ClusterSummary { capabilities: number; elements: number; stale: number }
let summaryCache: { graph: NeuralGraph; evidence: unknown; byDomain: Map<string, ClusterSummary> } | null = null;

function clusterSummaries(frame: FrameInputs, graph: NeuralGraph, evidence: ReadonlyMap<string, "current" | "stale" | "unknown"> | null) {
  if (summaryCache?.graph === graph && summaryCache.evidence === evidence) return summaryCache.byDomain;
  const byDomain = new Map<string, ClusterSummary>();
  for (const node of frame.world.nodes) {
    const domain = graph.clusterOf.get(node.id);
    if (domain === undefined || node.kind === "domain" || node.kind === "project") continue;
    const sum = byDomain.get(domain) ?? { capabilities: 0, elements: 0, stale: 0 };
    if (node.kind === "capability") sum.capabilities += 1; else sum.elements += 1;
    if (neuralCellIsStale(evidence, node.id)) sum.stale += 1;
    byDomain.set(domain, sum);
  }
  summaryCache = { graph, evidence, byDomain };
  return byDomain;
}

/**
 * Neural's names on `ctx`, which only needs the CSS-pixel transform `nf` is in: each domain's title
 * above its cluster, capability names at rest, a focus's lit ends and plate. O(n) to gather on-screen
 * candidates, O(c log c) to rank the c on screen, and at most `nameBudget × NAME_TRIES_PER_NAME` placements.
 */
export function paintNeuralNames(ctx: CanvasRenderingContext2D, frame: FrameInputs, nf: NeuralFrame, labels: NeuralLabels | null): void {
  const t = nf.tokens;
  const ink = t.inks;
  const { world } = frame;
  const { neural, width, height, cellX: sx, cellY: sy, cellR: sr, cellU: su, cellAlpha: sa } = nf;
  const { axonAX: ax, axonAY: ay, axonCX: acx, axonCY: acy, axonBX: abx, axonBY: aby } = nf;
  const evidence = frame.domeLight?.evidence ?? null;
  const graph = neuralGraphOf(world.nodes, world.edges);
  const family = labelFontFamily();
  const cells = new BoxGrid();
  const names = new BoxGrid();
  const boxes: typeof passState.drawnLabelBoxes = [];
  // A focus's names may cross a receded cell, so the cells are gathered only at rest.
  for (let i = 0; i < world.nodes.length && nf.sets === null; i += 1) {
    if (sa[i] <= 0.05) continue;
    const r = sr[i] + 2;
    cells.add({ minX: sx[i] - r, minY: sy[i] - r, maxX: sx[i] + r, maxY: sy[i] + r });
  }
  ctx.lineJoin = "round";
  ctx.textBaseline = "middle";
  const write = (text: string, x: number, y: number, align: CanvasTextAlign, font: string, fill: string, alpha: number, halo: number) => {
    ctx.font = font;
    ctx.textAlign = align;
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = ink.halo;
    ctx.lineWidth = halo;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = fill;
    ctx.fillText(text, x, y);
  };
  const widthOf = (text: string): number => {
    let widths = labelWidths.get(ctx.font);
    if (!widths) {
      if (labelWidths.size >= LABEL_WIDTH_FONTS_MAX) labelWidths.clear();
      widths = new Map();
      labelWidths.set(ctx.font, widths);
    }
    let w = widths.get(text);
    if (w === undefined) {
      w = ctx.measureText(text).width;
      widths.set(text, w);
    }
    return w;
  };
  const boxFor = (text: string, x: number, y: number, align: CanvasTextAlign, px: number): Box => {
    const w = widthOf(text);
    const left = align === "right" ? x - w : align === "center" ? x - w / 2 : x;
    return { minX: left - 3, minY: y - px * 0.62 - 2, maxX: left + w + 3, maxY: y + px * 0.62 + 2 };
  };
  const { focusId, focusIndex, sets, ramp, impact, spread } = nf;
  const poolOf = new Map<string, NeuralPool>();
  for (let k = 0; k < nf.poolCount; k += 1) poolOf.set(nf.pools[k].domainId, nf.pools[k]);
  const hopOf = nf.impact === null ? null : nf.cellHop;
  // Where each lit axon arrives at its far end, and how many of the focus's own leave it to the right.
  const arrival = new Map<number, { dx: number; dy: number }>();
  const litPath = litRaster;
  litPath.reset(width, height);
  let litRight = 0;
  let litOwn = 0;
  for (let k = 0; k < nf.litCount; k += 1) {
    const e = nf.litAxon[k];
    const far = nf.litFarNode[k];
    const farIsTarget = nf.litHop[k] === 0;
    const fx = farIsTarget ? abx[e] : ax[e];
    const fy = farIsTarget ? aby[e] : ay[e];
    const nx = farIsTarget ? ax[e] : abx[e];
    const into = arrival.get(far) ?? { dx: 0, dy: 0 };
    const len = Math.hypot(acx[e] - fx, acy[e] - fy) || 1;
    into.dx += (acx[e] - fx) / len;
    into.dy += (acy[e] - fy) / len;
    arrival.set(far, into);
    if (nf.litHop[k] <= 1) {
      litOwn += 1;
      if (acx[e] > nx) litRight += 1;
    }
    litPath.markAxon(nf, e);
  }
  const impactSize = impact?.distance.size ?? 0;
  const plate = focusId !== null && focusIndex >= 0 && sets !== null && labels
    ? placeFocusPlate(ctx, frame, nf, focusIndex, labels.focusFacts({
      stale: nf.cellStale[focusIndex] === 1, needs: sets.needs.size, usedBy: sets.usedBy.size,
      ...(impactSize > sets.usedBy.size ? { impact: impactSize } : {}),
    }), family, litRight * 2 <= litOwn)
    : null;
  lastLit.plateFacts = plate?.facts ?? null;
  if (plate) names.add(plate.box);
  if (focusIndex >= 0 && sets !== null) {
    const ring = sr[focusIndex] + t.focusRingGapPx + t.focusRingPx;
    names.add({ minX: sx[focusIndex] - ring, minY: sy[focusIndex] - ring, maxX: sx[focusIndex] + ring, maxY: sy[focusIndex] + ring });
  }

  // Capability names beside their cells at rest; with a focus, its direct ends first and then a
  // selection's arrived dependents nearest first, each name on the side its arriving axons leave free.
  const candidates: number[] = [];
  // A selection's dependent is named once its hop has arrived.
  const nameStep = (i: number) => {
    const id = world.nodes[i].id;
    if (sets === null) return 0;
    if (sets.needs.has(id)) return 1;
    if (hopOf === null) return sets.usedBy.has(id) ? 1 : 0;
    return hopOf[i] > 0 && spread >= hopOf[i] ? hopOf[i] : 0;
  };
  for (let i = 0; i < world.nodes.length; i += 1) {
    const node = world.nodes[i];
    if (node.id === focusId || sa[i] <= 0.05) continue;
    if (sx[i] < -NAME_CULL_MARGIN_PX || sx[i] > width + NAME_CULL_MARGIN_PX || sy[i] < -NAME_CULL_MARGIN_PX || sy[i] > height + NAME_CULL_MARGIN_PX) continue;
    if (sets !== null ? nameStep(i) > 0 : node.kind === "capability") candidates.push(i);
  }
  const rank = (i: number) => (graph.dependencyCount.get(world.nodes[i].id) ?? 0) - su[i] * NAME_DEPTH_WEIGHT;
  candidates.sort(sets !== null ? (a, b) => nameStep(a) - nameStep(b) || rank(b) - rank(a) : (a, b) => rank(b) - rank(a));
  const hot = sets !== null;
  const font = `${hot ? FONT_WEIGHT.emphasis : FONT_WEIGHT.signature} ${t.namePx}px ${family}`;
  const placeName = (i: number): boolean => {
    const node = world.nodes[i];
    const cluster = graph.clusterOf.get(node.id);
    const pool = cluster === undefined ? undefined : poolOf.get(cluster);
    const into = arrival.get(i);
    const right = into ? into.dx <= 0 : pool === undefined || sx[i] >= (pool.minX + pool.maxX) / 2;
    const gap = sr[i] + t.nameGapPx;
    ctx.font = font;
    const tries: [number, number, CanvasTextAlign, number, number][] = [
      [sx[i] + (right ? gap : -gap), sy[i], right ? "left" : "right", right ? 1 : -1, 0],
      [sx[i] + (right ? -gap : gap), sy[i], right ? "right" : "left", right ? -1 : 1, 0],
      [sx[i], sy[i] + gap + t.namePx * 0.5, "center", 0, 1],
      [sx[i], sy[i] - gap - t.namePx * 0.5, "center", 0, -1],
    ];
    if (into) tries.sort((a, b) => (a[3] * into.dx + a[4] * into.dy) - (b[3] * into.dx + b[4] * into.dy));
    // Clear of every lit axon, a name may also stand a line off each side before it crosses one.
    const nudge = t.namePx * NAME_NUDGE_LINES;
    const nudged = hot ? tries.flatMap(([x, y, align, dx, dy]): (typeof tries)[number][] => dy === 0
      ? [[x, y - nudge, align, dx, dy], [x, y + nudge, align, dx, dy]]
      : [[x, y + dy * nudge, align, dx, dy]]) : [];
    const direct = nameStep(i) === 1;
    for (const clearOfLit of hot ? (direct ? [true, false] : [true]) : [false]) {
      for (const [x, y, align] of clearOfLit ? [...tries, ...nudged] : tries) {
        const box = boxFor(node.label, x, y, align, t.namePx);
        if (box.maxX < 0 || box.minX > width || box.maxY < 0 || box.minY > height) continue;
        // A focus's names may cross a receded cell, never another name or the focus's ring; only a
        // direct end's name may cross a lit axon, and only if no side is clear.
        if (names.hits(box) || (!hot && cells.hits(box)) || (clearOfLit && litPath.hits(box))) continue;
        const alpha = (hot ? ramp : REST_NAME_ALPHA * (1 - (1 - t.farAlpha) * su[i])) * neural;
        write(node.label, x, y, align, font, hot && direct ? ink.strong : ink.name, alpha, t.nameHaloPx);
        names.add(box);
        boxes.push({ nodeId: node.id, text: node.label, ...box });
        return true;
      }
    }
    return false;
  };
  let named = 0;
  const nameBudget = Math.round(t.nameBudget * nf.zoomGrowth);
  const placeNames = () => {
    const tries = Math.min(candidates.length, nameBudget * NAME_TRIES_PER_NAME);
    let indirect = 0;
    for (let k = 0; k < tries && named < nameBudget; k += 1) {
      const far = nameStep(candidates[k]) > 1;
      if (far && indirect >= nameBudget * INDIRECT_NAME_SHARE) break;
      if (!placeName(candidates[k])) continue;
      named += 1;
      if (far) indirect += 1;
    }
  };

  // Each domain's name stands above its cluster, nearest first; a title that would sit on another
  // cluster or a nearer title gives way. With a focus the lit clusters' titles stand first at full
  // strength, the lit names next, and a receded title only where it meets no lit name or axon.
  const nameFont = `${FONT_WEIGHT.strong} ${t.domainNamePx}px ${family}`;
  const metaFont = `${FONT_WEIGHT.signature} ${t.domainMetaPx}px ${family}`;
  const summaries = clusterSummaries(frame, graph, evidence);
  const litClusters = new Set<string>();
  const lightClusterOf = (id: string) => {
    const own = graph.clusterOf.get(id);
    if (own !== undefined) litClusters.add(own);
  };
  if (focusId !== null) {
    lightClusterOf(focusId);
    if (impact !== null && sets !== null) {
      for (const id of sets.needs) lightClusterOf(id);
      for (const [id, distance] of impact.distance) if (distance <= spread) lightClusterOf(id);
    }
  } else if (sets !== null) {
    for (const id of sets.needs) lightClusterOf(id);
    for (const id of sets.usedBy) lightClusterOf(id);
  }
  const freeLeft = Math.max(t.titlePinPx, (frame.panelInsets?.left ?? 0) + t.domainNameGapPx);
  const freeRight = width - Math.max(t.titlePinPx, (frame.panelInsets?.right ?? 0) + t.domainNameGapPx);
  const titles: (TitleCandidate & { label: string; meta: string | null; x: number; nameY: number; metaY: number; nameBox: Box; a: number })[] = [];
  for (let k = 0; k < nf.poolCount; k += 1) {
    const pool = nf.pools[k];
    const domainId = pool.domainId;
    if (pool.alpha <= 0.05) continue;
    const node = world.nodeById.get(domainId);
    if (!node) continue;
    const summary = summaries.get(domainId);
    const meta = labels && summary ? labels.domainMeta(summary) : null;
    // While any of the cluster is on screen its title stays inside the free area, under the chrome.
    const onScreen = pool.maxY > 0 && pool.minY < height && pool.maxX > 0 && pool.minX < width;
    const metaY = Math.max(pool.top - t.domainMetaGapPx, onScreen ? t.titlePinPx + t.domainNameGapPx : -Infinity);
    const nameY = metaY - t.domainNameGapPx;
    ctx.font = nameFont;
    const nameW = widthOf(node.label);
    ctx.font = metaFont;
    const halfW = Math.max(nameW, meta ? widthOf(meta) : 0) / 2;
    const centre = (pool.minX + pool.maxX) / 2;
    const x = onScreen ? Math.min(Math.max(centre, freeLeft + halfW), Math.max(freeLeft + halfW, freeRight - halfW)) : centre;
    ctx.font = nameFont;
    const nameBox = boxFor(node.label, x, nameY, "center", t.domainNamePx);
    ctx.font = metaFont;
    const metaBox = meta ? boxFor(meta, x, metaY, "center", t.domainMetaPx) : nameBox;
    const box = { minX: Math.min(nameBox.minX, metaBox.minX), minY: nameBox.minY, maxX: Math.max(nameBox.maxX, metaBox.maxX), maxY: metaBox.maxY };
    const disc = { x: centre, y: (pool.minY + pool.maxY) / 2, r: Math.max(pool.maxX - pool.minX, pool.maxY - pool.minY) / 2 };
    titles.push({ id: domainId, box, disc, depth: pool.depth, label: node.label, meta, x, nameY, metaY, nameBox, a: pool.alpha });
  }
  const projectLabels: { i: number; x: number; box: Box }[] = [];
  if (!hot) {
    ctx.font = font;
    for (let i = 0; i < world.nodes.length; i += 1) {
      if (world.nodes[i].kind !== "project" || sa[i] <= 0.05) continue;
      const x = sx[i] + sr[i] + t.nameGapPx;
      projectLabels.push({ i, x, box: boxFor(world.nodes[i].label, x, sy[i], "left", t.namePx) });
    }
  }
  const standing = standingDomainTitles(titles, projectLabels.map((label) => label.box));
  const receded = (id: string) => hot && !litClusters.has(id);
  const writeTitle = (title: (typeof titles)[number]) => {
    if (title.box.maxX < 0 || title.box.minX > width || title.box.maxY < 0 || title.box.minY > height) return;
    const dim = (receded(title.id) ? 1 - (1 - t.titleVeil) * ramp : 1) * title.a;
    write(title.label, title.x, title.nameY, "center", nameFont, ink.strong, TITLE_NAME_ALPHA * dim, t.nameHaloPx + TITLE_HALO_EXTRA_PX);
    if (title.meta) write(title.meta, title.x, title.metaY, "center", metaFont, ink.name, TITLE_META_ALPHA * dim, t.nameHaloPx);
    names.add(title.box);
    boxes.push({ nodeId: title.id, text: title.label, ...title.nameBox });
  };
  for (const title of titles) if (standing.has(title.id) && !receded(title.id) && !(hot && names.hits(title.box))) writeTitle(title);
  if (hot) {
    const litNames = new BoxGrid();
    const before = boxes.length;
    placeNames();
    for (let k = before; k < boxes.length; k += 1) litNames.add(boxes[k]);
    if (plate) litNames.add(plate.box);
    for (const title of titles) {
      if (standing.has(title.id) && receded(title.id) && !litNames.hits(title.box) && !litPath.hits(title.box)) writeTitle(title);
    }
  }

  if (!hot) {
    for (const { i, x, box } of projectLabels) {
      const label = world.nodes[i].label;
      write(label, x, sy[i], "left", font, ink.name, 0.9 * neural, t.nameHaloPx);
      names.add(box);
      boxes.push({ nodeId: world.nodes[i].id, text: label, ...box });
    }
    placeNames();
  }

  if (plate && focusId !== null) {
    paintFocusPlate(ctx, t, plate, ramp * neural, nf.cellStale[focusIndex] === 1);
    boxes.push({ nodeId: focusId, text: plate.title, ...plate.box });
  }
  passState.drawnLabelBoxes = boxes;
}

interface FocusPlate { box: Box; title: string; facts: string; titleFont: string; factFont: string }

/** One plate beside the focus: its name, then stale, needs and used-by; on the side with fewer lit axons that fits. */
function placeFocusPlate(ctx: CanvasRenderingContext2D, frame: FrameInputs, nf: NeuralFrame, i: number, facts: string, family: string, preferRight: boolean): FocusPlate {
  const t = nf.tokens;
  const { cellX: sx, cellY: sy, cellR: sr } = nf;
  const title = frame.world.nodes[i].label;
  const titleFont = `${FONT_WEIGHT.emphasis} ${t.namePx + PLATE_TITLE_EXTRA_PX}px ${family}`;
  const factFont = `${FONT_WEIGHT.signature} ${t.domainMetaPx - PLATE_FACT_LESS_PX}px ${family}`;
  ctx.font = titleFont;
  const titleW = ctx.measureText(title).width;
  ctx.font = factFont;
  const w = Math.max(titleW, ctx.measureText(facts).width) + t.platePadPx * 2;
  const h = t.namePx * PLATE_LINES + t.platePadPx * PLATE_PAD_SHARE;
  const reach = sr[i] + t.focusRingGapPx + t.platePadPx;
  const fitsRight = sx[i] + reach + w <= nf.width - t.platePadPx;
  const fitsLeft = sx[i] - reach - w >= t.platePadPx;
  const x = (preferRight ? fitsRight || !fitsLeft : !fitsLeft && fitsRight) ? sx[i] + reach : sx[i] - reach - w;
  const y = Math.max(t.platePadPx, sy[i] - h - sr[i]);
  return { box: { minX: x, minY: y, maxX: x + w, maxY: y + h }, title, facts, titleFont, factFont };
}

function paintFocusPlate(ctx: CanvasRenderingContext2D, t: NeuralFrame["tokens"], plate: FocusPlate, alpha: number, stale: boolean): void {
  const { minX: x, minY: y, maxX, maxY } = plate.box;
  const h = maxY - y;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = t.inks.plate;
  ctx.beginPath();
  ctx.roundRect(x, y, maxX - x, h, t.plateRadiusPx);
  ctx.fill();
  ctx.globalAlpha = alpha * PLATE_EDGE_ALPHA;
  ctx.strokeStyle = t.inks.name;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.textAlign = "left";
  ctx.font = plate.titleFont;
  ctx.fillStyle = t.inks.strong;
  ctx.fillText(plate.title, x + t.platePadPx, y + h * 0.34);
  ctx.font = plate.factFont;
  ctx.fillStyle = stale ? t.inks.warning : t.inks.name;
  ctx.fillText(plate.facts, x + t.platePadPx, y + h * 0.72);
}
