/**
 * Canvas 2D drawing for the Territories view (`model/territories-layout.ts`). Pure: it reads a
 * layout, a camera offset and what is selected, and paints. Every position comes from the
 * layout, so what the unit tests prove about overlap is what is drawn.
 *
 * Channels (spec "A v2" §7): disc size = element count; a dot in the disc = it depends on
 * something; the ring = evidence (solid current, amber stale, broken unknown); open shelf arcs
 * and the trunk = membership; grey strokes with a pill = rolled-up cross-domain dependencies;
 * indigo arrows (focus only) = what the focused capability needs, paler arrows = who uses it.
 */

import type { OntologyMapTokens } from "../tokens/read-map-tokens";
import { hexPoints } from "./node-shapes";
import { scaledLabelFont } from "./labels";
import {
  TERRITORY_GEOMETRY,
  territorySatellites,
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
  chip: scaledLabelFont("element", TERRITORY_GEOMETRY.chipFontPx / 9.5),
};

/** The inks this view needs beyond the map tokens: the product's one warning hue, for stale. */
export interface TerritoryInks {
  stale: string;
  /** The same hue at low alpha, for a stale disc's fill. */
  staleFill: string;
}

export interface TerritoryDrawState {
  width: number;
  height: number;
  /** Screen = world + offset (CSS px). */
  offsetX: number;
  offsetY: number;
  selectedId: string | null;
  hoverId: string | null;
  /** Nodes that stay at full strength while something is selected. */
  lit: ReadonlySet<string> | null;
  /** 0 → nothing dimmed, 1 → everything outside `lit` at the rest alpha. */
  dimT: number;
  evidence: ReadonlyMap<string, TerritoryEvidenceState>;
  /** Domains whose counts line names a stale number: that line wears the stale ink. */
  staleDomains: ReadonlySet<string>;
  /** Element id → name, for satellites and dependency annotations. */
  elementNames: ReadonlyMap<string, string>;
  /** The number engraved in the project hexagon (its concept count), or null. */
  projectCount: number | null;
}

function textAt(ctx: CanvasRenderingContext2D, label: Pick<TerritoryLabel, "text" | "x" | "y" | "align">, font: string, color: string, halo?: string) {
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

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number) {
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - size * Math.cos(angle - 0.45), y - size * Math.sin(angle - 0.45));
  ctx.lineTo(x - size * Math.cos(angle + 0.45), y - size * Math.sin(angle + 0.45));
  ctx.closePath();
  ctx.fill();
}

/** A curved arrow between two discs, stopping at each rim. */
function dependencyArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number; r: number },
  to: { x: number; y: number; r: number },
  color: string,
) {
  const cx = (from.x + to.x) / 2 + (from.y - to.y) * 0.12;
  const cy = (from.y + to.y) / 2 + (to.x - from.x) * 0.12;
  const startA = Math.atan2(cy - from.y, cx - from.x);
  const endA = Math.atan2(to.y - cy, to.x - cx);
  const sx = from.x + from.r * Math.cos(startA);
  const sy = from.y + from.r * Math.sin(startA);
  const ex = to.x - (to.r + 3) * Math.cos(endA);
  const ey = to.y - (to.r + 3) * Math.sin(endA);
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.25;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.quadraticCurveTo(cx, cy, ex, ey);
  ctx.stroke();
  arrowHead(ctx, ex, ey, endA, 7);
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
    focus: null,
    arrows: 0,
    satellites: 0,
    rollups: 0,
    offset: [Math.round(state.offsetX), Math.round(state.offsetY)],
  };
  const { lit, dimT } = state;
  const G = TERRITORY_GEOMETRY;
  const rest = 1 - dimT * (1 - tokens.egoRestAlpha);
  const alphaOf = (id: string) => (lit && !lit.has(id) ? rest : 1);
  const focusCap = focusCapability(layout, state.selectedId);
  const focusDomain = layout.domains.find((d) => d.id === state.selectedId) ?? null;
  const capById = new Map(layout.capabilities.map((c) => [c.id, c] as const));

  ctx.save();
  ctx.fillStyle = tokens.canvasBgNear;
  ctx.fillRect(0, 0, state.width, state.height);
  ctx.translate(state.offsetX, state.offsetY);

  /* Ambient territory glow — never a boundary, only where the territory lies. */
  for (const d of layout.domains) {
    const gx = d.x + 90 * Math.cos(d.angle);
    const gy = d.y + 70 * Math.sin(d.angle);
    const glow = ctx.createRadialGradient(gx, gy, 0, gx, gy, 300);
    glow.addColorStop(0, tokens.indigo);
    glow.addColorStop(1, "transparent");
    ctx.globalAlpha = 0.16 * alphaOf(d.id);
    ctx.fillStyle = glow;
    ctx.fillRect(gx - 300, gy - 300, 600, 600);
  }
  ctx.globalAlpha = 1;

  /* Membership: trunk hub → mark, and the open shelf arcs a territory uses. */
  for (const d of layout.domains) {
    ctx.globalAlpha = alphaOf(d.id);
    ctx.strokeStyle = tokens.edgeContains;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(d.x, d.y);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  ctx.strokeStyle = tokens.edgeContainsL2;
  for (const s of layout.shelves) {
    ctx.globalAlpha = alphaOf(s.domainId);
    ctx.beginPath();
    ctx.ellipse(s.cx, s.cy, s.radius, s.radius * G.squash, 0, s.from, s.to);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  /* Rolled-up domain → domain strokes, only while nothing is selected. */
  const rollAlpha = 1 - dimT;
  if (rollAlpha > 0.01) {
    ctx.globalAlpha = rollAlpha;
    for (const r of layout.rollups) {
      const endA = Math.atan2(r.y2 - r.cy, r.x2 - r.cx);
      const stop = G.domainHalf + 5;
      const ex = r.x2 - stop * Math.cos(endA);
      const ey = r.y2 - stop * Math.sin(endA);
      ctx.strokeStyle = tokens.edgeDepends;
      ctx.fillStyle = tokens.edgeDepends;
      ctx.lineWidth = 1 + Math.min(r.count, 10) * 0.4;
      ctx.beginPath();
      ctx.moveTo(r.x1, r.y1);
      ctx.quadraticCurveTo(r.cx, r.cy, ex, ey);
      ctx.stroke();
      arrowHead(ctx, ex, ey, endA, 8);
      stats.rollups += 1;
      const b = r.chip.box;
      ctx.fillStyle = tokens.canvasBgNear;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.roundRect(b.x, b.y, b.w, b.h, b.h / 2);
      ctx.fill();
      ctx.stroke();
      textAt(ctx, r.chip, TERRITORY_FONTS.chip, tokens.labelDomain);
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
        dependencyArrow(ctx, a, b, out ? tokens.selectionRingIndigo : tokens.edgeSelected);
        stats.arrows += 1;
      }
    }
    ctx.globalAlpha = 1;
  }

  /* Project hexagon with its concept count. */
  if (layout.project) {
    const p = layout.project;
    ctx.globalAlpha = alphaOf(p.id);
    polygon(ctx, hexPoints(p.x, p.y, p.r));
    ctx.fillStyle = tokens.nodeFillProject;
    ctx.fill();
    ctx.strokeStyle = tokens.amberHub;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    polygon(ctx, hexPoints(p.x, p.y, p.r * 0.73));
    ctx.strokeStyle = tokens.projectHairlineInner;
    ctx.lineWidth = 1;
    ctx.stroke();
    if (state.projectCount != null) {
      textAt(ctx, { text: String(state.projectCount), x: p.x, y: p.y + 3.5, align: "center" }, TERRITORY_FONTS.chip, tokens.labelProject);
    }
    textAt(ctx, p.label, TERRITORY_FONTS.project, tokens.labelProject);
    ctx.globalAlpha = 1;
  }

  /* Domain marks and their titles. */
  for (const d of layout.domains) {
    ctx.globalAlpha = alphaOf(d.id);
    const selected = state.selectedId === d.id;
    ctx.fillStyle = tokens.nodeFillDomain;
    ctx.strokeStyle = selected ? tokens.selectionRingIndigo : tokens.nodeStrokeDomain;
    ctx.lineWidth = selected ? 2 : 1.5;
    ctx.beginPath();
    ctx.roundRect(d.x - d.half, d.y - d.half, 2 * d.half, 2 * d.half, 9);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = tokens.clusterChipBorderRest;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(d.x - 13, d.y - 13, 26, 26, 5);
    ctx.stroke();
    if (state.hoverId === d.id && !selected) {
      ctx.strokeStyle = tokens.hoverRing;
      ctx.beginPath();
      ctx.roundRect(d.x - d.half - 5, d.y - d.half - 5, 2 * d.half + 10, 2 * d.half + 10, 12);
      ctx.stroke();
    }
    textAt(ctx, d.label, TERRITORY_FONTS.domain, tokens.labelDomain);
    textAt(ctx, d.stats, TERRITORY_FONTS.domainStats, state.staleDomains.has(d.id) ? inks.stale : tokens.labelElement);
    ctx.globalAlpha = 1;
  }

  /* Capability discs: size = elements, ring = evidence, dot = has a dependency. */
  for (const c of layout.capabilities) {
    ctx.globalAlpha = alphaOf(c.id);
    drawCapabilityDisc(ctx, c, state.evidence.get(c.id) ?? "unknown", tokens, inks);
    if (focusCap?.id === c.id) {
      ctx.strokeStyle = tokens.selectionRingIndigo;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r + 5, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (state.hoverId === c.id) {
      ctx.strokeStyle = tokens.hoverRing;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r + 5, 0, 2 * Math.PI);
      ctx.stroke();
    }
    const inFocus = !!lit && lit.has(c.id) && dimT > 0.5;
    // Dense mode reserves no room for names: they appear on hover and in focus, over a halo.
    if (c.labelReserved || state.hoverId === c.id || inFocus) {
      const halo = c.labelReserved ? undefined : tokens.canvasBgNear;
      const color = inFocus || state.hoverId === c.id ? tokens.labelDomain : tokens.labelCapability;
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
        textAt(ctx, { text: suffix, x: left + nameW, y: c.label.y, align: "left" }, TERRITORY_FONTS.capability, tokens.labelElement, halo);
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
        { text: `↳ ${names.join(" · ")}`, x: c.label.x, y: c.label.y + 12, align: c.label.align },
        TERRITORY_FONTS.element,
        tokens.selectionRingIndigo,
        tokens.canvasBgNear,
      );
    }

    /* Its elements as satellites, named. */
    for (const s of territorySatellites(focusCap)) {
      stats.satellites += 1;
      const selected = state.selectedId === s.id;
      const a = Math.atan2(s.y - focusCap.y, s.x - focusCap.x);
      ctx.strokeStyle = tokens.edgeContains;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(focusCap.x + (focusCap.r + 1) * Math.cos(a), focusCap.y + (focusCap.r + 1) * Math.sin(a));
      ctx.lineTo(s.x - 4 * Math.cos(a), s.y - 4 * Math.sin(a));
      ctx.stroke();
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = tokens.nodeFillElement;
      ctx.strokeStyle = selected ? tokens.selectionRingIndigo : tokens.nodeStrokeElement;
      ctx.lineWidth = selected ? 1.5 : 1;
      ctx.fillRect(-3.5, -3.5, 7, 7);
      ctx.strokeRect(-3.5, -3.5, 7, 7);
      ctx.restore();
      const right = s.x >= focusCap.x;
      textAt(
        ctx,
        { text: state.elementNames.get(s.id) ?? s.id, x: s.x + (right ? 8 : -8), y: s.y + 3.5, align: right ? "left" : "right" },
        TERRITORY_FONTS.element,
        selected ? tokens.selectionRingIndigo : tokens.labelElement,
        tokens.canvasBgNear,
      );
    }
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  stats.focus = focusCap?.id ?? focusDomain?.id ?? null;
  return stats;
}

/** What one frame drew — written onto the canvas so a test reads the picture, not the props. */
export interface TerritoryFrameStats {
  dimT: number;
  focus: string | null;
  arrows: number;
  satellites: number;
  rollups: number;
  offset: [number, number];
}

function drawCapabilityDisc(
  ctx: CanvasRenderingContext2D,
  c: Pick<TerritoryCapability, "x" | "y" | "r" | "hasDependency">,
  evidence: TerritoryEvidenceState,
  tokens: OntologyMapTokens,
  inks: TerritoryInks,
): void {
  ctx.beginPath();
  ctx.arc(c.x, c.y, c.r, 0, 2 * Math.PI);
  ctx.fillStyle = tokens.nodeFillCapability;
  ctx.fill();
  if (evidence === "stale") {
    ctx.fillStyle = inks.staleFill;
    ctx.fill();
    ctx.strokeStyle = inks.stale;
    ctx.lineWidth = 1.6;
  } else {
    ctx.strokeStyle = tokens.nodeStrokeCapability;
    ctx.lineWidth = 1.2;
  }
  // Unknown is a broken ring: nobody has checked it, which must not read as current.
  ctx.setLineDash(evidence === "unknown" ? [2.5, 2.5] : []);
  ctx.stroke();
  ctx.setLineDash([]);
  if (c.hasDependency) {
    ctx.globalAlpha *= 0.8;
    ctx.fillStyle = tokens.nodeStrokeCapability;
    ctx.beginPath();
    ctx.arc(c.x, c.y, Math.max(1.5, c.r * 0.26), 0, 2 * Math.PI);
    ctx.fill();
    ctx.globalAlpha /= 0.8;
  }
}
