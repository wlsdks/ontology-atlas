import { lerpColorHex } from "../../render/grid";
import { draw as drawNodeShape, type NodeShapeTokens } from "../../render/node-shapes";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { mixOver } from "../ink";
import type { DialFrameMarks } from "./marks";
import type { DialKind, GlyphMark, StripMark, TextMark } from "../types";

export interface DialPaintOptions {
  now: number;
  reducedMotion: boolean;
  numeralHaloPx: number;
}

const STRIP_STEPS = 22;
const GAP_EDGE = 0.01;
const RING_DASH = [2, 5];
const RELATES_DASH = [2, 3];
const UNKNOWN_DASH = [2, 2];
const TEXT_HALO_PX = 3;
const LINE_WIDTH: Record<DialKind, number> = { project: 1.5, domain: 1.6, capability: 1.3, element: 1 };

type Pt = { x: number; y: number };

function quadAt(a: Pt, c: Pt, b: Pt, t: number): Pt {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

function quadTangent(a: Pt, c: Pt, b: Pt, t: number): number {
  return Math.atan2(2 * (1 - t) * (c.y - a.y) + 2 * t * (b.y - c.y), 2 * (1 - t) * (c.x - a.x) + 2 * t * (b.x - c.x));
}

function quadPiece(a: Pt, c: Pt, b: Pt, t0: number, t1: number): [Pt, Pt, Pt] {
  return [
    quadAt(a, c, b, t0),
    {
      x: (1 - t0) * (1 - t1) * a.x + ((1 - t0) * t1 + t0 * (1 - t1)) * c.x + t0 * t1 * b.x,
      y: (1 - t0) * (1 - t1) * a.y + ((1 - t0) * t1 + t0 * (1 - t1)) * c.y + t0 * t1 * b.y,
    },
    quadAt(a, c, b, t1),
  ];
}

function stripPath(ctx: CanvasRenderingContext2D, a: Pt, c: Pt, b: Pt, w0: number, w1: number): void {
  const right: Pt[] = [];
  for (let i = 0; i <= STRIP_STEPS; i += 1) {
    const t = i / STRIP_STEPS;
    const q = quadAt(a, c, b, t);
    const ang = quadTangent(a, c, b, t);
    const half = (w0 + (w1 - w0) * t) / 2;
    const lx = q.x - Math.sin(ang) * half;
    const ly = q.y + Math.cos(ang) * half;
    if (i === 0) ctx.moveTo(lx, ly);
    else ctx.lineTo(lx, ly);
    right.push({ x: q.x + Math.sin(ang) * half, y: q.y - Math.cos(ang) * half });
  }
  for (let i = right.length - 1; i >= 0; i -= 1) ctx.lineTo(right[i]!.x, right[i]!.y);
  ctx.closePath();
}

function headPath(ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, size: number): void {
  const back = size * 0.9;
  const spread = size * 0.42;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const bx = x - back * cos;
  const by = y - back * sin;
  ctx.moveTo(x, y);
  ctx.lineTo(bx + spread * sin, by - spread * cos);
  ctx.quadraticCurveTo(bx + back * 0.18 * cos, by + back * 0.18 * sin, bx - spread * sin, by + spread * cos);
  ctx.closePath();
}

function solidStrip(ctx: CanvasRenderingContext2D, s: StripMark): void {
  const a = { x: s.ax, y: s.ay };
  const c = { x: s.cx, y: s.cy };
  const b = { x: s.bx, y: s.by };
  const widthAt = (t: number) => s.w0 + (s.w1 - s.w0) * t;
  if (s.gapT1 > s.gapT0) {
    if (s.gapT0 > GAP_EDGE) {
      const [p0, pc, p1] = quadPiece(a, c, b, 0, s.gapT0);
      stripPath(ctx, p0, pc, p1, widthAt(0), widthAt(s.gapT0));
    }
    if (s.gapT1 < 1 - GAP_EDGE) {
      const [p0, pc, p1] = quadPiece(a, c, b, s.gapT1, 1);
      stripPath(ctx, p0, pc, p1, widthAt(s.gapT1), widthAt(1));
    }
  } else {
    stripPath(ctx, a, c, b, s.w0, s.w1);
  }
  if (s.headEnd) headPath(ctx, b.x, b.y, quadTangent(a, c, b, 1), s.headSize);
  if (s.headStart) headPath(ctx, a.x, a.y, quadTangent(a, c, b, 0) + Math.PI, s.headSize);
}

function groupBy<T>(items: readonly T[], key: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const k = key(item);
    const list = groups.get(k);
    if (list) list.push(item);
    else groups.set(k, [item]);
  }
  return groups;
}

function shapeTokens(map: OntologyMapTokens): NodeShapeTokens {
  return {
    amberHub: map.amberHub,
    recentChange: map.recentChange,
    numeralShadow: map.numeralShadow,
    numeralFace: map.numeralFace,
    holeFill: map.nodeHoleFill,
    projectHairlineInner: map.projectHairlineInner,
    projectPinTick: map.projectPinTick,
    selectionIndigo: map.selectionRingIndigo,
    selectionHairline: map.selectionRingHairline,
    neighborRing: map.edgeSelected,
    hoverRing: map.hoverRing,
    hoverShimmerSeg: map.hoverShimmerSeg,
    hoverShimmerPeriodMs: map.hoverShimmerPeriodMs,
    hoverShimmerColor: map.indigoBright,
  };
}

function kindFill(kind: DialKind, map: OntologyMapTokens): string {
  if (kind === "project") return map.nodeFillProject;
  if (kind === "domain") return map.nodeFillDomain;
  if (kind === "capability") return map.nodeFillCapability;
  return map.nodeFillElement;
}

function kindStroke(kind: DialKind, map: OntologyMapTokens): string {
  if (kind === "project") return map.amberHub;
  if (kind === "domain") return map.nodeStrokeDomain;
  if (kind === "capability") return map.nodeStrokeCapability;
  return map.nodeStrokeElement;
}

function paintGlyph(ctx: CanvasRenderingContext2D, g: GlyphMark, map: OntologyMapTokens, tokens: NodeShapeTokens, o: DialPaintOptions): void {
  const fill = g.fill ?? kindFill(g.kind, map);
  drawNodeShape(
    ctx,
    {
      kind: g.kind, screenX: g.x, screenY: g.y, screenRadius: g.r, farT: 0, egoState: g.egoState,
      fill, stroke: g.stroke ?? kindStroke(g.kind, map), lineWidth: LINE_WIDTH[g.kind], dash: [], hub: false,
      sheenTop: lerpColorHex(fill, map.nodeSheenTint, map.nodeSheenBlend), countLabel: g.count,
      isHovered: g.hovered, hoverEmphasis: 1, selectionPulse: g.selectionPulse, agentFocus: g.agentFocus,
      spotlightRing: null, now: o.now, reducedMotion: o.reducedMotion, glyphStyle: "fill",
    },
    tokens,
  );
  if (g.stalePip) {
    ctx.beginPath();
    ctx.arc(g.x + g.r * 0.75, g.y - g.r * 0.75, Math.max(2, g.r * 0.22), 0, Math.PI * 2);
    ctx.fillStyle = map.statusWarning;
    ctx.fill();
  }
}

function paintText(ctx: CanvasRenderingContext2D, t: Omit<TextMark, "role">, inks: readonly string[], halo: string | null): void {
  ctx.font = t.font;
  ctx.textBaseline = "middle";
  if (!t.parts) {
    ctx.textAlign = t.align;
    if (halo) {
      ctx.strokeStyle = halo;
      ctx.strokeText(t.text, t.x, t.y);
    }
    ctx.fillStyle = inks[t.ink]!;
    ctx.fillText(t.text, t.x, t.y);
    return;
  }
  const widths = t.parts.map((p) => ctx.measureText(p.text).width);
  const total = widths.reduce((a, b) => a + b, 0);
  let x = t.align === "center" ? t.x - total / 2 : t.align === "right" || t.align === "end" ? t.x - total : t.x;
  ctx.textAlign = "left";
  t.parts.forEach((p, i) => {
    ctx.fillStyle = inks[p.ink]!;
    ctx.fillText(p.text, x, t.y);
    x += widths[i]!;
  });
}

export function paintDialMarks(ctx: CanvasRenderingContext2D, marks: DialFrameMarks, map: OntologyMapTokens, options: DialPaintOptions): void {
  const inks = marks.inks;
  const ground = mixOver(map.canvasBgNear, map.canvasBgNear);
  ctx.save();

  for (const plates of groupBy(marks.plates, (p) => `${p.fill}|${p.rim}`).values()) {
    ctx.beginPath();
    for (const p of plates) {
      ctx.moveTo(p.x + p.r, p.y);
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    }
    ctx.fillStyle = inks[plates[0]!.fill]!;
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = inks[plates[0]!.rim]!;
    ctx.stroke();
  }

  if (marks.rails.length > 0) {
    ctx.save();
    ctx.lineWidth = 1;
    ctx.setLineDash(RING_DASH);
    for (const rails of groupBy(marks.rails, (r) => String(r.ink)).values()) {
      ctx.beginPath();
      for (const r of rails) {
        ctx.moveTo(r.cx + r.r * Math.cos(r.a0), r.cy + r.r * Math.sin(r.a0));
        ctx.arc(r.cx, r.cy, r.r, r.a0, r.a1);
      }
      ctx.strokeStyle = inks[rails[0]!.ink]!;
      ctx.stroke();
    }
    ctx.restore();
  }

  const dashed = marks.strips.filter((s) => s.dashed);
  if (dashed.length > 0) {
    ctx.save();
    ctx.setLineDash(RELATES_DASH);
    for (const list of groupBy(dashed, (s) => `${s.ink}|${Math.max(1, (s.w0 + s.w1) / 2)}`).values()) {
      ctx.beginPath();
      for (const s of list) {
        ctx.moveTo(s.ax, s.ay);
        ctx.quadraticCurveTo(s.cx, s.cy, s.bx, s.by);
      }
      ctx.lineWidth = Math.max(1, (list[0]!.w0 + list[0]!.w1) / 2);
      ctx.strokeStyle = inks[list[0]!.ink]!;
      ctx.stroke();
    }
    ctx.restore();
  }
  for (const list of groupBy(marks.strips.filter((s) => !s.dashed), (s) => String(s.ink)).values()) {
    ctx.beginPath();
    for (const s of list) solidStrip(ctx, s);
    ctx.fillStyle = inks[list[0]!.ink]!;
    ctx.fill();
  }

  for (const list of groupBy(marks.discs, (d) => `${d.fill}|${d.rim}|${d.dashed ? 1 : 0}|${d.lineWidth}`).values()) {
    ctx.beginPath();
    for (const d of list) {
      ctx.moveTo(d.x + d.r, d.y);
      ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    }
    ctx.fillStyle = inks[list[0]!.fill]!;
    ctx.fill();
    ctx.lineWidth = list[0]!.lineWidth;
    ctx.strokeStyle = inks[list[0]!.rim]!;
    ctx.setLineDash(list[0]!.dashed ? UNKNOWN_DASH : []);
    ctx.stroke();
  }
  ctx.setLineDash([]);

  ctx.lineWidth = 1;
  for (const list of groupBy(marks.squares, (q) => `${q.fill}|${q.rim}`).values()) {
    ctx.beginPath();
    for (const q of list) ctx.rect(q.x - q.half, q.y - q.half, q.half * 2, q.half * 2);
    ctx.fillStyle = inks[list[0]!.fill]!;
    ctx.fill();
    ctx.strokeStyle = inks[list[0]!.rim]!;
    ctx.stroke();
  }

  for (const list of groupBy(marks.ticks, (t) => String(t.ink)).values()) {
    ctx.beginPath();
    for (const t of list) {
      ctx.moveTo(t.x0, t.y0);
      ctx.lineTo(t.x1, t.y1);
    }
    ctx.strokeStyle = inks[list[0]!.ink]!;
    ctx.stroke();
  }
  for (const list of groupBy(marks.leaders, (l) => String(l.ink)).values()) {
    ctx.beginPath();
    for (const l of list) {
      ctx.moveTo(l.x0, l.y0);
      ctx.lineTo(l.x1, l.y1);
    }
    ctx.strokeStyle = inks[list[0]!.ink]!;
    ctx.stroke();
  }

  const shape = shapeTokens(map);
  for (const g of marks.glyphs) paintGlyph(ctx, g, map, shape, options);

  ctx.lineJoin = "round";
  ctx.lineWidth = TEXT_HALO_PX;
  for (const t of marks.texts) paintText(ctx, t, inks, null);
  for (const t of marks.extraTexts) paintText(ctx, t, inks, t.halo === null ? null : inks[t.halo]!);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = options.numeralHaloPx;
  for (const n of marks.numerals) {
    ctx.font = n.font;
    if (n.halo) {
      ctx.strokeStyle = ground;
      ctx.strokeText(n.text, n.x, n.y);
    }
    ctx.fillStyle = inks[n.ink]!;
    ctx.fillText(n.text, n.x, n.y);
  }
  ctx.restore();
}
