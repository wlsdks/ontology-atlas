/**
 * Canvas 2D drawing for the Territories view (`model/territories-layout.ts`). Pure: it reads a
 * layout, a camera offset and what is selected, and paints. Every position comes from the
 * layout, so what the unit tests prove about overlap is what is drawn.
 *
 * Channels (spec "A v2" §7): disc size = element count; a dot in the disc = it depends on
 * something; the ring = evidence (solid current, amber stale, broken unknown); open shelf arcs
 * and the trunk = membership; soft tapered strokes with a count pill = rolled-up cross-domain
 * dependencies; indigo arrows (focus only) = what the focused capability needs, paler arrows =
 * who uses it.
 *
 * Finish (owner, 2026-09-25: "premium and refined"): material, not glow. A disc is a machined
 * part — the map's own vertical sheen, a hairline of light on its upper inner rim, a stroke
 * snapped to whole device pixels so the amber ring stays crisp. Domain titles are the loudest
 * text and read as territory names; their counts sit a step quieter. Rolled-up strokes taper
 * from source to target and stay under the data.
 */

import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { hexPoints } from "./node-shapes";
import { scaledLabelFont } from "./labels";
import {
  TERRITORY_GEOMETRY,
  placeTerritoryCluster,
  territoryClusterAvoid,
  type Box,
  type TerritoryCapability,
  type TerritoryLabel,
  type TerritoryLayout,
  type TerritoryTextRole,
} from "../model/territories-layout";

export type TerritoryEvidenceState = "current" | "stale" | "unknown";

/** Fonts per text role — the map's own label fonts at the view's fixed sizes. */
export const TERRITORY_FONTS: Record<TerritoryTextRole, string> = {
  project: scaledLabelFont("project", TERRITORY_GEOMETRY.projectFontPx / 15),
  domain: scaledLabelFont("domain", TERRITORY_GEOMETRY.domainFontPx / 10),
  domainStats: scaledLabelFont("element", TERRITORY_GEOMETRY.domainStatsFontPx / 9.5),
  capability: scaledLabelFont("capability", TERRITORY_GEOMETRY.capabilityFontPx / 10.5),
  element: scaledLabelFont("element", 1),
  chip: scaledLabelFont("capability", TERRITORY_GEOMETRY.chipFontPx / 10.5),
};

/** The `--map-territory-*` family (`app/globals.css`), read once per frame like every map token. */
export interface TerritoryInks {
  title: string;
  count: string;
  stale: string;
  staleFill: string;
  rimLight: string;
  rollupAlpha: number;
  glowAlpha: number;
  /** The arrival clock, ms. */
  arrivalMs: number;
}

export interface TerritoryDrawState {
  width: number;
  height: number;
  /** Screen = world + offset (CSS px). */
  offsetX: number;
  offsetY: number;
  /** Device pixel ratio, so hairlines land on whole device pixels. */
  dpr: number;
  selectedId: string | null;
  hoverId: string | null;
  /** Nodes that stay at full strength while something is selected. */
  lit: ReadonlySet<string> | null;
  /** 0 → nothing dimmed, 1 → everything outside `lit` at the rest alpha. */
  dimT: number;
  /** 0 → nothing has arrived, 1 → settled. Always 1 under reduced motion. */
  arrivalT: number;
  evidence: ReadonlyMap<string, TerritoryEvidenceState>;
  /** Domains whose counts line names a stale number: that part wears the stale ink. */
  staleDomains: ReadonlySet<string>;
  /** Element id → name, for satellites and dependency annotations. */
  elementNames: ReadonlyMap<string, string>;
  /** The number engraved in the project hexagon (its concept count), or null. */
  projectCount: number | null;
}

/** What one frame drew — written onto the canvas so a test reads the picture, not the props. */
export interface TerritoryFrameStats {
  dimT: number;
  arrivalT: number;
  focus: string | null;
  arrows: number;
  satellites: number;
  rollups: number;
  offset: [number, number];
  /** The selected capability's element plate in canvas px ([x, y, w, h]), or null. */
  callout: [number, number, number, number] | null;
}

const easeOut = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** A stroke width that covers whole device pixels, so a 1px ring is crisp rather than grey. */
const crisp = (cssPx: number, dpr: number) => Math.max(1, Math.round(cssPx * dpr)) / dpr;

function textAt(
  ctx: CanvasRenderingContext2D,
  label: Pick<TerritoryLabel, "text" | "x" | "y" | "align">,
  font: string,
  color: string,
  halo?: string,
) {
  ctx.font = font;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = label.align;
  if (halo) {
    ctx.lineJoin = "round";
    ctx.strokeStyle = halo;
    ctx.lineWidth = 3;
    ctx.strokeText(label.text, label.x, label.y);
  }
  ctx.fillStyle = color;
  ctx.fillText(label.text, label.x, label.y);
}

/** A clean filled head whose base sits on the line end, so the shaft never pokes through. */
function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  const back = size * 0.9;
  const spread = size * 0.42;
  const bx = x - back * Math.cos(angle);
  const by = y - back * Math.sin(angle);
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(bx + spread * Math.sin(angle), by - spread * Math.cos(angle));
  ctx.quadraticCurveTo(bx + back * 0.18 * Math.cos(angle), by + back * 0.18 * Math.sin(angle), bx - spread * Math.sin(angle), by + spread * Math.cos(angle));
  ctx.closePath();
  ctx.fill();
}

/** A curved arrow between two discs, stopping at each rim; the shaft ends where the head begins. */
function dependencyArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number; r: number },
  to: { x: number; y: number; r: number },
  color: string,
  dpr: number,
) {
  const cx = (from.x + to.x) / 2 + (from.y - to.y) * 0.14;
  const cy = (from.y + to.y) / 2 + (to.x - from.x) * 0.14;
  const startA = Math.atan2(cy - from.y, cx - from.x);
  const endA = Math.atan2(to.y - cy, to.x - cx);
  const sx = from.x + (from.r + 2) * Math.cos(startA);
  const sy = from.y + (from.r + 2) * Math.sin(startA);
  const ex = to.x - (to.r + 4) * Math.cos(endA);
  const ey = to.y - (to.r + 4) * Math.sin(endA);
  const head = 7;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = crisp(1.25, dpr);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(cx, cy, ex - head * 0.8 * Math.cos(endA), ey - head * 0.8 * Math.sin(endA));
  ctx.stroke();
  arrowHead(ctx, ex, ey, endA, head);
}

/** A quadratic ribbon that narrows from `w0` at its start to `w1` at its end. */
function taperedCurve(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  cx: number,
  cy: number,
  x2: number,
  y2: number,
  w0: number,
  w1: number,
) {
  const steps = 28;
  const left: { x: number; y: number }[] = [];
  const right: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const x = (1 - t) ** 2 * x1 + 2 * (1 - t) * t * cx + t * t * x2;
    const y = (1 - t) ** 2 * y1 + 2 * (1 - t) * t * cy + t * t * y2;
    const dx = 2 * (1 - t) * (cx - x1) + 2 * t * (x2 - cx);
    const dy = 2 * (1 - t) * (cy - y1) + 2 * t * (y2 - cy);
    const len = Math.hypot(dx, dy) || 1;
    const half = (w0 + (w1 - w0) * t) / 2;
    left.push({ x: x - (dy / len) * half, y: y + (dx / len) * half });
    right.push({ x: x + (dy / len) * half, y: y - (dx / len) * half });
  }
  ctx.beginPath();
  left.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  for (let i = right.length - 1; i >= 0; i--) ctx.lineTo(right[i]!.x, right[i]!.y);
  ctx.closePath();
  ctx.fill();
}

function polygon(ctx: CanvasRenderingContext2D, pts: readonly { x: number; y: number }[]) {
  ctx.beginPath();
  pts.forEach((pt, i) => (i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y)));
  ctx.closePath();
}

/** The capability whose satellites and arrows are shown: the selected one, or an element's owner. */
export function focusCapability(layout: TerritoryLayout, selectedId: string | null): TerritoryCapability | null {
  if (!selectedId) return null;
  return (
    layout.capabilities.find((c) => c.id === selectedId) ??
    layout.capabilities.find((c) => c.id === layout.elementParent.get(selectedId)) ??
    null
  );
}

export function drawTerritories(
  ctx: CanvasRenderingContext2D,
  layout: TerritoryLayout,
  state: TerritoryDrawState,
  tokens: OntologyMapTokens,
  inks: TerritoryInks,
): TerritoryFrameStats {
  const stats: TerritoryFrameStats = {
    dimT: state.dimT,
    arrivalT: state.arrivalT,
    focus: null,
    arrows: 0,
    satellites: 0,
    rollups: 0,
    offset: [Math.round(state.offsetX), Math.round(state.offsetY)],
    callout: null,
  };
  const { lit, dimT, dpr } = state;
  const G = TERRITORY_GEOMETRY;
  const rest = 1 - dimT * (1 - tokens.egoRestAlpha);
  const alphaOf = (id: string) => (lit && !lit.has(id) ? rest : 1);
  const focusCap = focusCapability(layout, state.selectedId);
  const focusDomain = layout.domains.find((d) => d.id === state.selectedId) ?? null;
  const capById = new Map(layout.capabilities.map((c) => [c.id, c] as const));
  /*
   * Arrival: the shelves sweep open from their centre line and the discs settle in, inner shelf
   * first, all inside one settle clock. Nothing translates — only opacity and the arc's reach.
   */
  const arrival = state.arrivalT;
  const shelfArrival = (shelf: number) => easeOut((arrival - Math.min(shelf, 4) * 0.08) / 0.68);

  ctx.save();
  ctx.fillStyle = tokens.canvasBgNear;
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.translate(state.offsetX, state.offsetY);

  /* Ambient territory light — never a boundary, only where the territory lies. */
  for (const d of layout.domains) {
    const gx = d.x + 90 * Math.cos(d.angle);
    const gy = d.y + 70 * Math.sin(d.angle);
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 320);
    glow.addColorStop(0, tokens.indigo);
    glow.addColorStop(1, "transparent");
    ctx.globalAlpha = inks.glowAlpha * alphaOf(d.id) * easeOut(arrival);
    ctx.fillStyle = glow;
    ctx.fillRect(gx - 320, gy - 320, 640, 640);
  }
  ctx.globalAlpha = 1;

  /* Membership: a hairline trunk hub → mark, and the open shelves a territory uses. */
  ctx.lineCap = "round";
  for (const d of layout.domains) {
    ctx.globalAlpha = alphaOf(d.id);
    const trunk = ctx.createLinearGradient(0, 0, d.x, d.y);
    trunk.addColorStop(0, tokens.edgeContainsL2);
    trunk.addColorStop(1, tokens.edgeContains);
    ctx.strokeStyle = trunk;
    ctx.lineWidth = crisp(1, dpr);
    ctx.beginPath();
    ctx.moveTo(G.projectRadius * Math.cos(Math.atan2(d.y, d.x)), G.projectRadius * Math.sin(Math.atan2(d.y, d.x)));
    ctx.lineTo(d.x - (d.half + 4) * Math.cos(Math.atan2(d.y, d.x)), d.y - (d.half + 4) * Math.sin(Math.atan2(d.y, d.x)));
    ctx.stroke();
  }
  ctx.lineWidth = crisp(1, dpr);
  ctx.strokeStyle = tokens.edgeContainsL2;
  for (const s of layout.shelves) {
    const shelf = Math.round((s.radius - G.shelfRadius) / G.shelfStep);
    const reach = shelfArrival(shelf);
    if (reach <= 0) continue;
    const mid = (s.from + s.to) / 2;
    const half = ((s.to - s.from) / 2) * reach;
    ctx.globalAlpha = alphaOf(s.domainId) * 0.9;
    ctx.beginPath();
    ctx.ellipse(s.cx, s.cy, s.radius, s.radius * G.squash, 0, mid - half, mid + half);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* Rolled-up domain → domain strokes: soft, tapered, under the data; hidden in focus. */
  const rollAlpha = (1 - dimT) * easeOut(arrival);
  if (rollAlpha > 0.01) {
    for (const r of layout.rollups) {
      const endA = Math.atan2(r.y2 - r.cy, r.x2 - r.cx);
      const stop = G.domainHalf + 6;
      const ex = r.x2 - stop * Math.cos(endA);
      const ey = r.y2 - stop * Math.sin(endA);
      const w = 1.2 + Math.min(r.count, 10) * 0.35;
      const head = 6 + Math.min(r.count, 10) * 0.25;
      ctx.globalAlpha = rollAlpha * inks.rollupAlpha;
      ctx.fillStyle = tokens.edgeDepends;
      taperedCurve(ctx, r.x1, r.y1, r.cx, r.cy, ex - head * 0.8 * Math.cos(endA), ey - head * 0.8 * Math.sin(endA), w, Math.max(0.8, w * 0.45));
      arrowHead(ctx, ex, ey, endA, head);
      stats.rollups += 1;
      // The pill: the design system's panel surface, a hairline border, the count in panel ink.
      const b = r.chip.box;
      ctx.globalAlpha = rollAlpha;
      ctx.fillStyle = tokens.canvasBgNear;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2);
      ctx.fill();
      ctx.strokeStyle = tokens.clusterChipBorderRest;
      ctx.lineWidth = crisp(1, dpr);
      ctx.stroke();
      textAt(ctx, r.chip, TERRITORY_FONTS.chip, inks.title);
    }
    ctx.globalAlpha = 1;
  }

  /* Focus arrows: a capability's own needs and users, or every need of a focused domain. */
  if (dimT > 0.01 && (focusCap || focusDomain)) {
    ctx.globalAlpha = dimT;
    const drawn = new Set<string>();
    for (const dep of layout.dependencies) {
      const out = focusCap ? dep.from === focusCap.id : focusDomain!.capabilityIds.includes(dep.from);
      const incoming = focusCap ? dep.to === focusCap.id : false;
      if (!out && !incoming) continue;
      const key = `${dep.from}>${dep.to}`;
      if (drawn.has(key)) continue;
      drawn.add(key);
      const a = capById.get(dep.from);
      const b = capById.get(dep.to);
      if (a && b) {
        dependencyArrow(ctx, a, b, out ? tokens.selectionRingIndigo : tokens.edgeSelected, dpr);
        stats.arrows += 1;
      }
    }
    ctx.globalAlpha = 1;
  }

  /* Project hexagon with its concept count. */
  if (layout.project) {
    const p = layout.project;
    ctx.globalAlpha = alphaOf(p.id) * easeOut(arrival / 0.5);
    polygon(ctx, hexPoints(p.x, p.y, p.r));
    const face = ctx.createLinearGradient(0, p.y - p.r, 0, p.y + p.r);
    face.addColorStop(0, tokens.nodeSheenTint);
    face.addColorStop(1, tokens.nodeFillProject);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.strokeStyle = tokens.amberHub;
    ctx.lineWidth = crisp(1.5, dpr);
    ctx.stroke();
    polygon(ctx, hexPoints(p.x, p.y, p.r * 0.74));
    ctx.strokeStyle = tokens.projectHairlineInner;
    ctx.lineWidth = crisp(1, dpr);
    ctx.stroke();
    if (state.projectCount != null) {
      textAt(ctx, { text: String(state.projectCount), x: p.x, y: p.y + 3.5, align: "center" }, TERRITORY_FONTS.chip, tokens.labelProject);
    }
    textAt(ctx, p.label, TERRITORY_FONTS.project, tokens.labelProject);
    ctx.globalAlpha = 1;
  }

  /* Domain marks — machined chips — and their titles, the loudest text on the plane. */
  for (const d of layout.domains) {
    ctx.globalAlpha = alphaOf(d.id) * easeOut(arrival / 0.5);
    const selected = state.selectedId === d.id;
    const x0 = d.x - d.half;
    const y0 = d.y - d.half;
    ctx.beginPath();
    ctx.roundRect(x0, y0, 2 * d.half, 2 * d.half, 9);
    const face = ctx.createLinearGradient(0, y0, 0, y0 + 2 * d.half);
    face.addColorStop(0, tokens.nodeSheenTint);
    face.addColorStop(1, tokens.nodeFillDomain);
    ctx.fillStyle = face;
    ctx.fill();
    ctx.strokeStyle = selected ? tokens.selectionRingIndigo : tokens.nodeStrokeDomain;
    ctx.lineWidth = crisp(selected ? 1.5 : 1, dpr);
    ctx.stroke();
    // Light on the upper inner edge, the same hairline a DOM card carries.
    ctx.beginPath();
    ctx.roundRect(x0 + 1.5, y0 + 1.5, 2 * d.half - 3, 2 * d.half - 3, 7.5);
    const rim = ctx.createLinearGradient(0, y0, 0, y0 + 2 * d.half);
    rim.addColorStop(0, inks.rimLight);
    rim.addColorStop(0.45, "transparent");
    ctx.strokeStyle = rim;
    ctx.lineWidth = crisp(1, dpr);
    ctx.stroke();
    ctx.strokeStyle = tokens.clusterChipBorderRest;
    ctx.beginPath();
    ctx.roundRect(d.x - 12, d.y - 12, 24, 24, 5);
    ctx.stroke();
    if (state.hoverId === d.id && !selected) {
      ctx.strokeStyle = tokens.hoverRing;
      ctx.beginPath();
      ctx.roundRect(x0 - 5, y0 - 5, 2 * d.half + 10, 2 * d.half + 10, 12);
      ctx.stroke();
    }
    textAt(ctx, d.label, TERRITORY_FONTS.domain, inks.title);
    drawCounts(ctx, d.stats, state.staleDomains.has(d.id), inks);
    ctx.globalAlpha = 1;
  }

  /* Capability discs: size = elements, ring = evidence, dot = has a dependency. */
  for (const c of layout.capabilities) {
    const settle = shelfArrival(c.shelf);
    if (settle <= 0) continue;
    ctx.globalAlpha = alphaOf(c.id) * settle;
    drawCapabilityDisc(ctx, c, state.evidence.get(c.id) ?? "unknown", tokens, inks, dpr);
    if (focusCap?.id === c.id) {
      ctx.strokeStyle = tokens.selectionRingIndigo;
      ctx.lineWidth = crisp(1.5, dpr);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r + 5, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (state.hoverId === c.id) {
      ctx.strokeStyle = tokens.hoverRing;
      ctx.lineWidth = crisp(1, dpr);
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r + 5, 0, 2 * Math.PI);
      ctx.stroke();
    }
    const inFocus = !!lit && lit.has(c.id) && dimT > 0.5;
    // Dense mode reserves no room for names: they appear on hover and in focus, over a halo.
    if (c.labelReserved || state.hoverId === c.id || inFocus) {
      const halo = c.labelReserved ? undefined : tokens.canvasBgNear;
      const color = inFocus || state.hoverId === c.id ? inks.title : tokens.labelCapability;
      // Domain focus: each capability of the focused territory carries its element count. The
      // layout reserved room for "name · N", so the suffix never lands on a neighbour.
      const suffix = focusDomain && c.domainId === focusDomain.id && c.elementIds.length > 0 ? ` · ${c.elementIds.length}` : "";
      if (!suffix) {
        textAt(ctx, c.label, TERRITORY_FONTS.capability, color, halo);
      } else {
        ctx.font = TERRITORY_FONTS.capability;
        const nameW = ctx.measureText(c.name).width;
        const sufW = ctx.measureText(suffix).width;
        const left =
          c.label.align === "left" ? c.label.x : c.label.align === "right" ? c.label.x - nameW - sufW : c.label.x - (nameW + sufW) / 2;
        textAt(ctx, { text: c.name, x: left, y: c.label.y, align: "left" }, TERRITORY_FONTS.capability, color, halo);
        textAt(ctx, { text: suffix, x: left + nameW, y: c.label.y, align: "left" }, TERRITORY_FONTS.capability, inks.count, halo);
      }
    }
    ctx.globalAlpha = 1;
  }

  /* Focused capability: element targets named under the capability that owns them. */
  if (focusCap && dimT > 0.01) {
    ctx.globalAlpha = dimT;
    const byTarget = new Map<string, string[]>();
    for (const dep of layout.dependencies) {
      if (dep.from !== focusCap.id || dep.targetId === dep.to) continue;
      const list = byTarget.get(dep.to) ?? [];
      const name = state.elementNames.get(dep.targetId) ?? dep.targetId;
      if (!list.includes(name)) list.push(name);
      byTarget.set(dep.to, list);
    }
    for (const [capId, names] of byTarget) {
      const c = capById.get(capId);
      if (!c) continue;
      textAt(
        ctx,
        { text: `↳ ${names.join(" · ")}`, x: c.label.x, y: c.label.y + 13, align: c.label.align },
        TERRITORY_FONTS.element,
        tokens.selectionRingIndigo,
        tokens.canvasBgNear,
      );
    }
    const plate = drawElementCluster(ctx, layout, focusCap, state, tokens, inks);
    stats.satellites = focusCap.elementIds.length;
    if (plate) {
      stats.callout = [
        Math.round(plate.x + state.offsetX),
        Math.round(plate.y + state.offsetY),
        Math.round(plate.w),
        Math.round(plate.h),
      ];
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  stats.focus = focusCap?.id ?? focusDomain?.id ?? null;
  return stats;
}

/** A domain's counts line: quiet ink, with its stale part in the stale ink. */
function drawCounts(ctx: CanvasRenderingContext2D, stats: TerritoryLabel, stale: boolean, inks: TerritoryInks) {
  const cut = stale ? stats.text.lastIndexOf(" · ") : -1;
  if (cut < 0) {
    textAt(ctx, stats, TERRITORY_FONTS.domainStats, inks.count);
    return;
  }
  const base = stats.text.slice(0, cut + 3);
  const tail = stats.text.slice(cut + 3);
  ctx.font = TERRITORY_FONTS.domainStats;
  const baseW = ctx.measureText(base).width;
  const tailW = ctx.measureText(tail).width;
  const left = stats.align === "left" ? stats.x : stats.align === "right" ? stats.x - baseW - tailW : stats.x - (baseW + tailW) / 2;
  textAt(ctx, { text: base, x: left, y: stats.y, align: "left" }, TERRITORY_FONTS.domainStats, inks.count);
  textAt(ctx, { text: tail, x: left + baseW, y: stats.y, align: "left" }, TERRITORY_FONTS.domainStats, inks.stale);
}

/**
 * The selected capability's elements as one tidy cluster: a short spine out of the disc, a rail,
 * and one tick per element to a small diamond, names aligned on one edge.
 */
function drawElementCluster(
  ctx: CanvasRenderingContext2D,
  layout: TerritoryLayout,
  cap: TerritoryCapability,
  state: TerritoryDrawState,
  tokens: OntologyMapTokens,
  inks: TerritoryInks,
): Box | null {
  if (cap.elementIds.length === 0) return null;
  /*
   * The cluster sits on its own plate: the names cross whatever dimmed shelf lies beside the
   * disc, and a plate in the canvas colour keeps them one readable list instead of a collision.
   * The plate is placed clear of the capability's name and its domain's title.
   */
  ctx.font = TERRITORY_FONTS.element;
  const widest = territoryElementNameWidth(cap, state.elementNames, (text) => ctx.measureText(text).width);
  const { side, satellites: sats, plate } = placeTerritoryCluster(cap, widest, territoryClusterAvoid(layout, cap));
  const railX = sats[0]!.x - side * 9;
  const top = sats[0]!.y;
  const bottom = sats[sats.length - 1]!.y;
  ctx.beginPath();
  ctx.roundRect(plate.x, plate.y, plate.w, plate.h, 8);
  ctx.fillStyle = tokens.canvasBgNear;
  ctx.fill();
  ctx.strokeStyle = tokens.clusterChipBorderRest;
  ctx.lineWidth = crisp(1, state.dpr);
  ctx.stroke();
  ctx.strokeStyle = tokens.edgeContains;
  ctx.lineWidth = crisp(1, state.dpr);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(cap.x + side * (cap.r + 3), cap.y);
  ctx.lineTo(railX, cap.y);
  ctx.moveTo(railX, Math.min(top, cap.y));
  ctx.lineTo(railX, Math.max(bottom, cap.y));
  for (const s of sats) {
    ctx.moveTo(railX, s.y);
    ctx.lineTo(s.x - side * 4.5, s.y);
  }
  ctx.stroke();
  for (const s of sats) {
    const selected = state.selectedId === s.id;
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(Math.PI / 4);
    ctx.fillStyle = tokens.nodeFillElement;
    ctx.strokeStyle = selected ? tokens.selectionRingIndigo : tokens.nodeStrokeElement;
    ctx.lineWidth = crisp(selected ? 1.5 : 1, state.dpr);
    ctx.fillRect(-3, -3, 6, 6);
    ctx.strokeRect(-3, -3, 6, 6);
    ctx.restore();
    textAt(
      ctx,
      { text: state.elementNames.get(s.id) ?? s.id, x: s.x + side * 9, y: s.y + 3.5, align: side > 0 ? "left" : "right" },
      TERRITORY_FONTS.element,
      selected ? tokens.selectionRingIndigo : inks.title,
      tokens.canvasBgNear,
    );
  }
  return plate;
}

/** The longest element name of a capability, as `measure` sets it in the element font. */
export function territoryElementNameWidth(
  cap: Pick<TerritoryCapability, "elementIds">,
  elementNames: ReadonlyMap<string, string>,
  measure: (text: string) => number,
): number {
  let widest = 0;
  for (const id of cap.elementIds) widest = Math.max(widest, measure(elementNames.get(id) ?? id));
  return widest;
}

function drawCapabilityDisc(
  ctx: CanvasRenderingContext2D,
  c: Pick<TerritoryCapability, "x" | "y" | "r" | "hasDependency">,
  evidence: TerritoryEvidenceState,
  tokens: OntologyMapTokens,
  inks: TerritoryInks,
  dpr: number,
): void {
  // Face: the map's own vertical sheen, lighter at the top.
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, 2 * Math.PI);
  const face = ctx.createLinearGradient(0, c.y - c.r, 0, c.y + c.r);
  face.addColorStop(0, tokens.nodeSheenTint);
  face.addColorStop(1, tokens.nodeFillCapability);
  ctx.fillStyle = face;
  ctx.fill();
  if (evidence === "stale") {
    ctx.fillStyle = inks.staleFill;
    ctx.fill();
  }
  // Rim light on the upper inner edge.
  if (c.r >= 6) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, c.r - 1.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.strokeStyle = inks.rimLight;
    ctx.lineWidth = crisp(1, dpr);
    ctx.stroke();
  }
  // Ring: evidence. Unknown is a broken ring — nobody checked it, which must not read as current.
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, 2 * Math.PI);
  ctx.strokeStyle = evidence === "stale" ? inks.stale : tokens.nodeStrokeCapability;
  ctx.lineWidth = crisp(evidence === "stale" ? 1.5 : 1, dpr);
  ctx.setLineDash(evidence === "unknown" ? [2.5, 2.5] : []);
  ctx.stroke();
  ctx.setLineDash([]);
  if (c.hasDependency) {
    const a = ctx.globalAlpha;
    ctx.globalAlpha = a * 0.8;
    ctx.fillStyle = tokens.nodeStrokeCapability;
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(1.5, Math.min(3.5, c.r * 0.22)), 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha = a;
  }
}
