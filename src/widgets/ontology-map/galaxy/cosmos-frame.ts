import { arrowHead, taperedCurve } from "../render/tapered-arrow";
import { scaledLabelFont } from "../render/labels";
import { STAR_KIND_CAPABILITY, STAR_KIND_ELEMENT, STAR_KIND_NUCLEUS, STAR_KIND_PROJECT, MIN_STAR_SPACING, visualRadius, type CosmosGalaxy, type CosmosLayout } from "./cosmos-layout";
import {
  buildGalaxyGlow,
  buildStarImpostor,
  glowSizeFor,
  filamentGeometry,
  filamentWidth,
  impostorSizeFor,
  IMPOSTOR_EXTENT,
  starSprite,
  type CosmosInks,
  type GalaxyGlow,
} from "./cosmos-paint";

export interface CosmosCamera {
  x: number;
  y: number;
  scale: number;
}

export interface CosmosRoom {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GalaxyPose {
  x: number;
  y: number;
  theta: number;
  wispTheta: number;
  wispLight: number;
  presence: number;
  condense: number;
}

export interface CosmosFrameInput {
  ctx: CanvasRenderingContext2D;
  width: number;
  height: number;
  dpr: number;
  room: CosmosRoom;
  camera: CosmosCamera;
  overviewScale: number;
  layout: CosmosLayout;
  inks: CosmosInks;
  poses: readonly GalaxyPose[];
  hoverId: string | null;
  hoverGalaxy: number;
  selectedId: string | null;
  selectedLinks: readonly { x: number; y: number }[];
  cache: CosmosFrameCache;
  deepField: HTMLCanvasElement | null;
  buildBudget: number;
}

export interface CosmosFrameCache {
  glows: Map<number, GalaxyGlow | null>;
  impostors: Map<string, HTMLCanvasElement | null>;
  coreImpostor: Map<number, HTMLCanvasElement | null>;
  textWidth: Map<string, number>;
}

interface CosmosLabel {
  text: string;
  kind: "project" | "galaxy" | "cluster" | "element" | "count" | "hover";
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CosmosFrameStats {
  impostorGalaxies: number;
  liveGalaxies: number;
  liveStars: number;
  culledGalaxies: number;
  filaments: number;
  labels: CosmosLabel[];
  buildsStarted: number;
  pendingBuilds: number;
  zoomRatio: number;
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function galaxyMatrix(g: CosmosGalaxy, pose: GalaxyPose, camera: CosmosCamera, room: CosmosRoom, theta = pose.theta) {
  const k = camera.scale;
  const ca = Math.cos(g.angle);
  const sa = Math.sin(g.angle);
  const ct = Math.cos(theta);
  const st = Math.sin(theta);
  const t = g.tilt;
  return {
    a: k * (ca * ct - t * sa * st),
    b: k * (sa * ct + t * ca * st),
    c: k * (-ca * st - t * sa * ct),
    d: k * (-sa * st + t * ca * ct),
    e: room.x + room.width / 2 + (pose.x - camera.x) * k,
    f: room.y + room.height / 2 + (pose.y - camera.y) * k,
  };
}

export function worldToScreen(camera: CosmosCamera, room: CosmosRoom, x: number, y: number): { x: number; y: number } {
  return { x: room.x + room.width / 2 + (x - camera.x) * camera.scale, y: room.y + room.height / 2 + (y - camera.y) * camera.scale };
}

export function liveBandRadius(dpr: number): number {
  return 512 / (2 * dpr * IMPOSTOR_EXTENT);
}

function measure(ctx: CanvasRenderingContext2D, cache: CosmosFrameCache, font: string, text: string): number {
  const key = `${font}|${text}`;
  const hit = cache.textWidth.get(key);
  if (hit !== undefined) return hit;
  ctx.font = font;
  const w = ctx.measureText(text).width;
  cache.textWidth.set(key, w);
  return w;
}

interface Candidate {
  text: string;
  kind: CosmosLabel["kind"];
  id: string;
  x: number;
  y: number;
  align: "center" | "left";
  font: string;
  ink: string;
  meta?: string;
  priority: number;
}

export function drawCosmosFrame(input: CosmosFrameInput): CosmosFrameStats {
  const { ctx, width, height, dpr, room, camera, layout, inks, poses, cache } = input;
  const zoomRatio = camera.scale / Math.max(1e-9, input.overviewScale);
  const stats: CosmosFrameStats = {
    impostorGalaxies: 0,
    liveGalaxies: 0,
    liveStars: 0,
    culledGalaxies: 0,
    filaments: 0,
    labels: [],
    buildsStarted: 0,
    pendingBuilds: 0,
    zoomRatio,
  };
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = inks.bgFar;
  ctx.fillRect(0, 0, width, height);
  if (input.deepField) {
    const pattern = ctx.createPattern(input.deepField, "repeat");
    if (pattern) {
      const ox = -camera.x * camera.scale * 0.06;
      const oy = -camera.y * camera.scale * 0.06;
      pattern.setTransform(new DOMMatrix([1, 0, 0, 1, ox % 512, oy % 512]));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
  }

  const live = liveBandRadius(dpr);
  const candidates: Candidate[] = [];
  const galaxyFont = scaledLabelFont("domain", 1.3);
  const metaFont = scaledLabelFont("element", 1.05);
  const clusterFont = scaledLabelFont("capability", 1.1);
  const elementFont = scaledLabelFont("element", 1.05);

  const webAlpha = 1 - smoothstep(1.4, 2.2, zoomRatio);
  const settled = poses.every((p) => p.presence >= 1 && p.condense >= 1);
  if (webAlpha > 0.01) {
    ctx.globalAlpha = webAlpha;
    const topCount = topFilamentCount(layout);
    for (const f of layout.filaments) {
      const pa = poses[f.from]!;
      const pb = poses[f.to]!;
      if (Math.min(pa.presence, pb.presence) < 0.05) continue;
      const ga = layout.galaxies[f.from]!;
      const gb = layout.galaxies[f.to]!;
      const geo = filamentGeometry({ x: pa.x, y: pa.y, radius: visualRadius(ga) }, { x: pb.x, y: pb.y, radius: visualRadius(gb) }, settled ? f.bow : 0.15);
      const p1 = worldToScreen(camera, room, geo.x1, geo.y1);
      const pc = worldToScreen(camera, room, geo.cx, geo.cy);
      const p2 = worldToScreen(camera, room, geo.x2, geo.y2);
      const minX = Math.min(p1.x, pc.x, p2.x);
      const maxX = Math.max(p1.x, pc.x, p2.x);
      const minY = Math.min(p1.y, pc.y, p2.y);
      const maxY = Math.max(p1.y, pc.y, p2.y);
      if (maxX < -20 || minX > width + 20 || maxY < -20 || minY > height + 20) continue;
      const w0 = filamentWidth(f.count);
      const touches = input.hoverGalaxy === f.from || input.hoverGalaxy === f.to;
      const receded = input.hoverGalaxy >= 0 && !touches;
      ctx.fillStyle = touches ? inks.filamentHead : receded ? inks.filamentDim : inks.filament;
      const w1 = f.twoWay ? w0 : w0 * 0.45;
      taperedCurve(ctx, p1.x, p1.y, pc.x, pc.y, p2.x, p2.y, w0, w1);
      ctx.fillStyle = receded ? inks.filamentDim : inks.filamentHead;
      arrowHead(ctx, p2.x, p2.y, Math.atan2(p2.y - pc.y, p2.x - pc.x), Math.max(3, 2.4 * w1));
      if (f.twoWay) arrowHead(ctx, p1.x, p1.y, Math.atan2(p1.y - pc.y, p1.x - pc.x), Math.max(3, 2.4 * w0));
      stats.filaments += 1;
      if ((f.count >= topCount && input.hoverGalaxy < 0) || touches) {
        const mx = 0.25 * p1.x + 0.5 * pc.x + 0.25 * p2.x;
        const my = 0.25 * p1.y + 0.5 * pc.y + 0.25 * p2.y;
        candidates.push({ text: String(f.count), kind: "count", id: `${f.from}-${f.to}`, x: mx, y: my, align: "center", font: metaFont, ink: inks.labelMeta, priority: touches ? 880 : 600 + f.count });
      }
    }
    ctx.globalAlpha = 1;
  }

  const coreScreen = worldToScreen(camera, room, 0, 0);
  const coreR = layout.core.radius * camera.scale;
  if (coreScreen.x + coreR * 1.6 > 0 && coreScreen.x - coreR * 1.6 < width && coreScreen.y + coreR * 1.6 > 0 && coreScreen.y - coreR * 1.6 < height) {
    ctx.globalCompositeOperation = "lighter";
    const core = starSprite(inks.project);
    if (core) {
      const r = Math.max(26, coreR * 0.55);
      ctx.globalAlpha = 0.5;
      ctx.drawImage(core, coreScreen.x - r * 2, coreScreen.y - r * 2, r * 4, r * 4);
      ctx.globalAlpha = 1;
      ctx.drawImage(core, coreScreen.x - 14, coreScreen.y - 14, 28, 28);
    }
    const halo = layout.core;
    for (let i = 0; i < halo.starIds.length; i += 1) {
      if (halo.starKind[i] === STAR_KIND_PROJECT) continue;
      const p = worldToScreen(camera, room, halo.starX[i]!, halo.starY[i]!);
      if (p.x < -8 || p.x > width + 8 || p.y < -8 || p.y > height + 8) continue;
      const sprite = starSprite(halo.starKind[i] === STAR_KIND_CAPABILITY ? inks.capability : inks.element);
      if (!sprite) continue;
      const r = Math.min(7, Math.max(1.2, MIN_STAR_SPACING * camera.scale * 0.45));
      ctx.globalAlpha = 0.7;
      ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (layout.core.label) {
      candidates.push({ text: layout.core.label, kind: "project", id: layout.core.id ?? "project", x: coreScreen.x, y: coreScreen.y + Math.max(30, coreR * 0.3) + 10, align: "center", font: scaledLabelFont("project", 1), ink: inks.labelProject, priority: 1000 });
    }
  }

  let budget = input.buildBudget;
  let focused = -1;
  let focusedDepth = Infinity;
  if (zoomRatio > 1.6) {
    const cx = room.x + room.width / 2;
    const cy = room.y + room.height / 2;
    layout.galaxies.forEach((g, index) => {
      const m = galaxyMatrix(g, poses[index]!, camera, room);
      const det = m.a * m.d - m.b * m.c;
      if (Math.abs(det) < 1e-12) return;
      const u = (m.d * (cx - m.e) - m.c * (cy - m.f)) / det;
      const v = (-m.b * (cx - m.e) + m.a * (cy - m.f)) / det;
      const depth = Math.hypot(u, v) / g.radius;
      if (depth <= 1 && depth < focusedDepth) {
        focusedDepth = depth;
        focused = index;
      }
    });
  }
  ctx.globalCompositeOperation = "lighter";
  layout.galaxies.forEach((g, index) => {
    const pose = poses[index]!;
    if (pose.presence <= 0.01) return;
    const rho = g.radius * camera.scale;
    const extent = rho * IMPOSTOR_EXTENT;
    const sc = worldToScreen(camera, room, pose.x, pose.y);
    if (sc.x + extent < 0 || sc.x - extent > width || sc.y + extent < 0 || sc.y - extent > height) {
      stats.culledGalaxies += 1;
      return;
    }
    const m = galaxyMatrix(g, pose, camera, room);
    const E = g.radius * IMPOSTOR_EXTENT;
    const glowSize = glowSizeFor(extent, dpr);
    const glowKey = index * 2 + (glowSize === 512 ? 1 : 0);
    let glow = cache.glows.get(glowKey);
    if (glow === undefined) {
      if (budget > 0) {
        glow = buildGalaxyGlow(g, inks, glowSize);
        cache.glows.set(glowKey, glow);
        budget -= 1;
        stats.buildsStarted += 1;
      } else {
        stats.pendingBuilds += 1;
        glow = cache.glows.get(index * 2 + (glowSize === 512 ? 0 : 1)) ?? null;
      }
    }
    const condense = pose.condense;
    const glowAlpha = pose.presence * (1 - 0.55 * smoothstep(900, 2600, rho));
    ctx.globalAlpha = glowAlpha;
    if (glow) {
      ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f);
      ctx.drawImage(glow.base, -E * condense, -E * condense, 2 * E * condense, 2 * E * condense);
      const w = galaxyMatrix(g, pose, camera, room, pose.theta + pose.wispTheta);
      ctx.setTransform(dpr * w.a, dpr * w.b, dpr * w.c, dpr * w.d, dpr * w.e, dpr * w.f);
      ctx.globalAlpha = glowAlpha * pose.wispLight;
      ctx.drawImage(glow.wisps, -E * condense, -E * condense, 2 * E * condense, 2 * E * condense);
    }
    ctx.globalAlpha = pose.presence;
    if (rho <= live) {
      const size = impostorSizeFor(extent, dpr);
      let bitmap: HTMLCanvasElement | null | undefined = cache.impostors.get(`${index}:${size}`);
      if (bitmap === undefined) {
        if (budget > 0) {
          bitmap = buildStarImpostor(g, size, inks);
          cache.impostors.set(`${index}:${size}`, bitmap);
          budget -= 1;
          stats.buildsStarted += 1;
        } else {
          stats.pendingBuilds += 1;
          for (const s of [512, 256, 128, 64]) {
            const other = cache.impostors.get(`${index}:${s}`);
            if (other) {
              bitmap = other;
              break;
            }
          }
        }
      }
      if (bitmap) {
        ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f);
        ctx.drawImage(bitmap, -E * condense, -E * condense, 2 * E * condense, 2 * E * condense);
      }
      stats.impostorGalaxies += 1;
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const spacingPx = MIN_STAR_SPACING * camera.scale;
      for (let i = 0; i < g.starIds.length; i += 1) {
        const u = g.starU[i]! * condense;
        const v = g.starV[i]! * condense;
        const x = m.a * u + m.c * v + m.e;
        const y = m.b * u + m.d * v + m.f;
        if (x < -12 || x > width + 12 || y < -12 || y > height + 12) continue;
        const kind = g.starKind[i]!;
        const mag = g.starMagnitude[i]!;
        const ink = kind === STAR_KIND_NUCLEUS ? inks.domain : kind === STAR_KIND_CAPABILITY ? inks.capability : inks.element;
        const sprite = starSprite(ink);
        if (!sprite) continue;
        const base = kind === STAR_KIND_NUCLEUS ? 16 : kind === STAR_KIND_CAPABILITY ? 7.5 : 4.2;
        const r = Math.min(base + 3 * mag, Math.max(2.2, spacingPx * (kind === STAR_KIND_ELEMENT ? 0.8 : 1.4)));
        ctx.globalAlpha = pose.presence * (kind === STAR_KIND_ELEMENT ? 0.6 + 0.4 * mag : 0.92);
        ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
        stats.liveStars += 1;
        if (kind === STAR_KIND_CAPABILITY && rho > 150) {
          const ci = g.starCluster[i]!;
          const cluster = g.clusters[ci];
          candidates.push({ text: cluster?.label ?? "", kind: "cluster", id: g.starIds[i]!, x: x + r * 0.6 + 4, y, align: "left", font: clusterFont, ink: inks.labelCapability, priority: 300 + Math.min(200, cluster?.starCount ?? 0) });
        } else if (kind === STAR_KIND_ELEMENT && spacingPx >= 16 && rho > 600) {
          candidates.push({ text: "", kind: "element", id: g.starIds[i]!, x: x + r * 0.5 + 3, y, align: "left", font: elementFont, ink: inks.labelElement, priority: 100 + mag * 100 });
        }
      }
      stats.liveGalaxies += 1;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const half = visualRadius(g) * Math.sqrt(Math.sin(g.angle) ** 2 + (g.tilt * Math.cos(g.angle)) ** 2) * camera.scale * condense;
    let ly = sc.y + half + 14;
    let lx = sc.x;
    if (index === focused) {
      ly = room.y + 12;
      lx = Math.min(room.x + room.width - 80, Math.max(room.x + 80, sc.x));
    }
    candidates.push({
      text: g.label,
      kind: "galaxy",
      id: g.id,
      x: lx,
      y: ly,
      align: "center",
      font: galaxyFont,
      ink: inks.labelDomain,
      meta: String(g.members),
      priority: 900 + Math.min(80, g.members / 10) + (input.hoverGalaxy === index ? 50 : 0),
    });
  });
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = "source-over";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const placed: CosmosLabel[] = [];
  const overlaps = (x: number, y: number, w: number, h: number) =>
    placed.some((p) => x < p.x + p.width && x + w > p.x && y < p.y + p.height && y + h > p.y);
  candidates.sort((p, q) => q.priority - p.priority);
  let elementBudget = 40;
  let clusterBudget = 48;
  for (const c of candidates) {
    if (c.kind === "element" && elementBudget <= 0) continue;
    if (c.kind === "cluster" && clusterBudget <= 0) continue;
    const text = c.kind === "element" ? labelOf(input, c.id) : c.text;
    if (!text) continue;
    const tw = measure(ctx, cache, c.font, text);
    const metaW = c.meta ? measure(ctx, cache, metaFont, c.meta) + 6 : 0;
    const w = tw + metaW + 10;
    const h = c.kind === "galaxy" || c.kind === "project" ? 20 : 16;
    const x = c.align === "center" ? c.x - w / 2 : c.x;
    const y = c.y - h / 2;
    if (x < room.x - 4 || x + w > room.x + room.width + 4 || y < room.y - 4 || y + h > room.y + room.height + 24) continue;
    if (overlaps(x, y, w, h)) continue;
    placed.push({ text, kind: c.kind, id: c.id, x, y, width: w, height: h });
    if (c.kind === "element") elementBudget -= 1;
    if (c.kind === "cluster") clusterBudget -= 1;
    ctx.fillStyle = inks.bgNear;
    ctx.globalAlpha = c.kind === "count" ? 0.92 : 0.86;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, 4);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.font = c.font;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    ctx.fillStyle = c.ink;
    ctx.fillText(text, x + 5, y + h / 2 + 0.5);
    if (c.meta) {
      ctx.font = metaFont;
      ctx.fillStyle = inks.labelMeta;
      ctx.fillText(c.meta, x + 5 + tw + 6, y + h / 2 + 0.5);
    }
  }

  if (input.selectedId) {
    const p = layout.points.get(input.selectedId);
    if (p) {
      const s = worldToScreen(camera, room, p.x, p.y);
      ctx.strokeStyle = inks.select;
      ctx.lineWidth = 1.4;
      ctx.globalAlpha = 0.9;
      for (const q of input.selectedLinks) {
        const t = worldToScreen(camera, room, q.x, q.y);
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(t.x, t.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 9, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  if (input.hoverId && input.hoverId !== input.selectedId) {
    const p = layout.points.get(input.hoverId);
    if (p) {
      const s = worldToScreen(camera, room, p.x, p.y);
      const text = labelOf(input, input.hoverId);
      const tw = measure(ctx, cache, clusterFont, text);
      ctx.fillStyle = inks.bgNear;
      ctx.beginPath();
      ctx.roundRect(s.x + 10, s.y - 9, tw + 10, 18, 4);
      ctx.fill();
      ctx.font = clusterFont;
      ctx.textBaseline = "middle";
      ctx.fillStyle = inks.labelCapability;
      ctx.fillText(text, s.x + 15, s.y + 0.5);
      ctx.strokeStyle = inks.select;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(s.x, s.y, 7, 0, Math.PI * 2);
      ctx.stroke();
      placed.push({ text, kind: "hover", id: input.hoverId, x: s.x + 10, y: s.y - 9, width: tw + 10, height: 18 });
    }
  }
  stats.labels = placed;
  return stats;
}

const topCounts = new WeakMap<CosmosLayout, number>();

function topFilamentCount(layout: CosmosLayout): number {
  const hit = topCounts.get(layout);
  if (hit !== undefined) return hit;
  const ranked = layout.filaments.map((f) => f.count).sort((a, b) => b - a);
  const top = ranked[Math.min(ranked.length - 1, 4)] ?? Infinity;
  topCounts.set(layout, top);
  return top;
}

const labelCache = new WeakMap<CosmosLayout, Map<string, string>>();

export function registerCosmosLabels(layout: CosmosLayout, labels: ReadonlyMap<string, string>): void {
  labelCache.set(layout, new Map(labels));
}

function labelOf(input: CosmosFrameInput, id: string): string {
  return labelCache.get(input.layout)?.get(id) ?? id;
}

