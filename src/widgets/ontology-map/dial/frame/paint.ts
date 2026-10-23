import { lerpColorHex } from "../../render/grid";
import { TABULAR_DIGITS } from "../../render/labels";
import { draw as drawNodeShape, type NodeShapeTokens } from "../../render/node-shapes";
import type { OntologyMapTokens } from "../../tokens/read-map-tokens";
import { mixOver } from "../ink";
import type { DialFrameMarks } from "./marks";
import type { Box, DialKind, GlyphMark, StripMark, TextMark } from "../types";

export interface DialPaintOptions {
  now: number;
  reducedMotion: boolean;
  numeralHaloPx: number;
}

const STRIP_STEPS = 22;
const GAP_EDGE = 0.01;
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
    g.selectionInk && g.egoState === "center" ? { ...tokens, selectionIndigo: g.selectionInk, selectionHairline: g.selectionInk } : tokens,
  );
  if (g.stalePip) {
    ctx.beginPath();
    ctx.arc(g.x + g.r * 0.75, g.y - g.r * 0.75, Math.max(2, g.r * 0.22), 0, Math.PI * 2);
    ctx.fillStyle = map.statusWarning;
    ctx.fill();
  }
}

function paintText(ctx: CanvasRenderingContext2D, t: Omit<TextMark, "role">, inks: readonly string[], halo: string): void {
  if (t.lines) {
    t.lines.forEach((line, i) => paintText(ctx, { ...t, text: line, lines: undefined, y: t.y + (i - (t.lines!.length - 1) / 2) * t.lineHeight! }, inks, halo));
    return;
  }
  ctx.font = t.font;
  ctx.textBaseline = "middle";
  ctx.strokeStyle = halo;
  if (!t.parts) {
    ctx.textAlign = t.align;
    ctx.strokeText(t.text, t.x, t.y);
    ctx.fillStyle = inks[t.ink]!;
    ctx.fillText(t.text, t.x, t.y);
    return;
  }
  const widths = t.parts.map((p) => ctx.measureText(p.text).width);
  const total = widths.reduce((a, b) => a + b, 0);
  const left = t.align === "center" ? t.x - total / 2 : t.align === "right" || t.align === "end" ? t.x - total : t.x;
  const xs = widths.map((_, i) => left + widths.slice(0, i).reduce((a, b) => a + b, 0));
  ctx.textAlign = "left";
  t.parts.forEach((p, i) => ctx.strokeText(p.text, xs[i]!, t.y));
  t.parts.forEach((p, i) => {
    ctx.fillStyle = inks[p.ink]!;
    ctx.fillText(p.text, xs[i]!, t.y);
  });
}

const digitCells = new Map<string, number>();

function tabularText(ctx: CanvasRenderingContext2D, parts: readonly { text: string; ink: string }[], x: number, y: number, mode: "stroke" | "fill"): void {
  let cell = digitCells.get(ctx.font);
  if (cell === undefined) digitCells.set(ctx.font, (cell = Math.max(...[...TABULAR_DIGITS].map((d) => ctx.measureText(d).width))));
  const advance = (ch: string) => (TABULAR_DIGITS.includes(ch) ? cell! : ctx.measureText(ch).width);
  let cursor = x - parts.reduce((sum, p) => sum + [...p.text].reduce((w, ch) => w + advance(ch), 0), 0) / 2;
  ctx.textAlign = "center";
  for (const p of parts) {
    if (mode === "fill") ctx.fillStyle = p.ink;
    for (const ch of p.text) {
      const w = advance(ch);
      if (mode === "fill") ctx.fillText(ch, cursor + w / 2, y);
      else ctx.strokeText(ch, cursor + w / 2, y);
      cursor += w;
    }
  }
}

export function knockoutRects(boxes: readonly Box[]): { x: number; y: number; w: number; h: number }[] {
  const cells = boxes.map((b) => ({ x0: Math.floor(b.minX), y0: Math.floor(b.minY), x1: Math.ceil(b.maxX), y1: Math.ceil(b.maxY) })).filter((c) => c.x1 > c.x0 && c.y1 > c.y0);
  const xs = [...new Set(cells.flatMap((c) => [c.x0, c.x1]))].sort((a, b) => a - b);
  const out: { x: number; y: number; w: number; h: number }[] = [];
  let open = new Map<string, { x: number; y: number; w: number; h: number }>();
  for (let i = 0; i < xs.length - 1; i += 1) {
    const left = xs[i]!;
    const right = xs[i + 1]!;
    const spans = cells.filter((c) => c.x0 <= left && c.x1 >= right).map((c) => [c.y0, c.y1] as const).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [y0, y1] of spans) {
      const last = merged[merged.length - 1];
      if (last && y0 <= last[1]) last[1] = Math.max(last[1], y1);
      else merged.push([y0, y1]);
    }
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const [y0, y1] of merged) {
      const key = `${y0}|${y1}`;
      const run = open.get(key);
      if (run) run.w = right - run.x;
      else out.push({ x: left, y: y0, w: right - left, h: y1 - y0 });
      next.set(key, run ?? out[out.length - 1]!);
    }
    open = next;
  }
  return out;
}

function knockout(ctx: CanvasRenderingContext2D, marks: DialFrameMarks): void {
  ctx.beginPath();
  ctx.rect(-1e5, -1e5, 2e5, 2e5);
  for (const r of knockoutRects([...marks.texts, ...marks.extraTexts, ...marks.numerals].map((m) => m.box))) ctx.rect(r.x, r.y, r.w, r.h);
  ctx.clip("evenodd");
}

export function paintDialMarks(ctx: CanvasRenderingContext2D, marks: DialFrameMarks, map: OntologyMapTokens, options: DialPaintOptions): void {
  const inks = marks.inks;
  const ground = mixOver(map.canvasBgNear, map.canvasBgNear);
  ctx.save();

  for (const stem of marks.stems ?? []) {
    ctx.beginPath();
    ctx.moveTo(stem.a.x, stem.a.y);
    ctx.quadraticCurveTo(stem.c.x, stem.c.y, stem.b.x, stem.b.y);
    ctx.strokeStyle = inks[stem.ink]!;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

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
    knockout(ctx, marks);
    ctx.lineWidth = 1;
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
  for (const block of marks.blocks ?? []) {
    const b = block.box;
    ctx.globalAlpha = block.alpha;
    ctx.beginPath();
    ctx.roundRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY, 6);
    ctx.fillStyle = inks[block.fill]!;
    ctx.fill();
    ctx.strokeStyle = inks[block.rim]!;
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  for (const g of marks.glyphs) paintGlyph(ctx, g, map, shape, options);

  ctx.lineJoin = "round";
  ctx.lineWidth = TEXT_HALO_PX;
  for (const t of marks.texts) paintText(ctx, t, inks, ground);
  for (const t of marks.extraTexts) paintText(ctx, t, inks, t.halo === null ? ground : inks[t.halo]!);

  ctx.textBaseline = "middle";
  ctx.lineWidth = options.numeralHaloPx;
  ctx.strokeStyle = ground;
  const figures = marks.numerals.map((n) => (n.parts ?? [n]).map((p) => ({ text: p.text, ink: inks[p.ink]! })));
  marks.numerals.forEach((n, i) => {
    if (!n.halo) return;
    ctx.font = n.font;
    tabularText(ctx, figures[i]!, n.x, n.y, "stroke");
  });
  marks.numerals.forEach((n, i) => {
    ctx.font = n.font;
    ctx.globalAlpha = n.alpha ?? 1;
    tabularText(ctx, figures[i]!, n.x, n.y, "fill");
  });
  ctx.globalAlpha = 1;
  ctx.restore();
}
