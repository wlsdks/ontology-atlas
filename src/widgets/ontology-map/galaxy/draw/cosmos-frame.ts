import { scaledLabelFont } from "../../render/labels";
import { galaxyMatrix, liveBandRadius, worldToScreen } from "../cosmos-camera";
import { STAR_KIND_CAPABILITY, STAR_KIND_ELEMENT, STAR_KIND_NUCLEUS, STAR_KIND_PROJECT, MIN_STAR_SPACING, visualRadius, type CosmosLayout } from "../layout/cosmos-layout";
import type {
  CosmosAttention,
  CosmosBand,
  CosmosCamera,
  CosmosFrameStats,
  CosmosInks,
  CosmosLens,
  CosmosPaintRecorder,
  CosmosRelation,
  CosmosRoom,
  CosmosTrail,
  GalaxyPose,
  LabelCandidate,
} from "../cosmos-types";
import { galaxyKey, type CosmosBitmapCache } from "./cosmos-bitmap-cache";
import { labelOf, placeCosmosLabels } from "./cosmos-labels";
import { buildGalaxyGlow, buildStarImpostor, glowSizeFor, impostorSizeFor, IMPOSTOR_EXTENT, starSprite } from "./cosmos-paint";
import { drawCosmosHover, drawCosmosRelations, galaxyLensAlpha, lensAlpha, trailHolds } from "./cosmos-relations";
import { drawCosmosWeb } from "./cosmos-web";

interface CosmosFrameInput {
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
  attention: CosmosAttention;
  relationsOf: (id: string) => readonly CosmosRelation[];
  pointOf: (id: string) => { x: number; y: number } | null;
  lens: CosmosLens | null;
  trail: CosmosTrail | null;
  record: CosmosPaintRecorder;
  reducedMotion: boolean;
  cache: CosmosBitmapCache;
  deepField: HTMLCanvasElement | null;
  buildBudget: number;
}

const patterns = new WeakMap<CanvasRenderingContext2D, { field: HTMLCanvasElement; pattern: CanvasPattern | null }>();

function deepFieldPattern(ctx: CanvasRenderingContext2D, field: HTMLCanvasElement): CanvasPattern | null {
  const hit = patterns.get(ctx);
  if (hit && hit.field === field) return hit.pattern;
  const pattern = ctx.createPattern(field, "repeat");
  patterns.set(ctx, { field, pattern });
  return pattern;
}

function cosmosBand(rho: number, live: number, spacingPx: number, band: CosmosBand): CosmosBand {
  if (rho <= live || band === "element") return band;
  return spacingPx >= 16 && rho > 600 ? "element" : "circuit";
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function drawCosmosFrame(input: CosmosFrameInput): CosmosFrameStats {
  const { ctx, width, height, dpr, room, camera, layout, inks, poses, cache, attention } = input;
  const zoomRatio = camera.scale / Math.max(1e-9, input.overviewScale);
  const stats: CosmosFrameStats = {
    impostorGalaxies: 0,
    liveGalaxies: 0,
    liveStars: 0,
    culledGalaxies: 0,
    labels: [],
    buildsStarted: 0,
    pendingBuilds: 0,
    firstDraws: 0,
    zoomRatio,
    band: "spine",
    web: { alpha: 0, items: [] },
    relations: [],
    lens: { kind: null, lit: 0, restAlpha: 1 },
  };
  let band: CosmosBand = "spine";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = "source-over";
  ctx.globalAlpha = 1;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = inks.bgFar;
  ctx.fillRect(0, 0, width, height);
  if (input.deepField) {
    const pattern = deepFieldPattern(ctx, input.deepField);
    if (pattern) {
      const ox = -camera.x * camera.scale * 0.06;
      const oy = -camera.y * camera.scale * 0.06;
      pattern.setTransform(new DOMMatrix([1, 0, 0, 1, ox % 512, oy % 512]));
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, width, height);
    }
  }

  const live = liveBandRadius(dpr);
  const galaxyFont = scaledLabelFont("domain", 1.3);
  const metaFont = scaledLabelFont("element", 1.05);
  const clusterFont = scaledLabelFont("capability", 1.1);
  const elementFont = scaledLabelFont("element", 1.05);

  const settled = poses.every((p) => p.presence >= 1 && p.condense >= 1);
  const web = drawCosmosWeb(ctx, {
    layout,
    poses,
    camera,
    room,
    width,
    height,
    zoomRatio,
    hoverGalaxy: attention.hoverGalaxy,
    focusGalaxy: attention.focusGalaxy,
    inks,
    settled,
    lensRest: galaxyLensAlpha(input.lens, inks, input.trail),
    metaFont,
  });
  stats.web = { alpha: web.alpha, items: web.items };
  const candidates: LabelCandidate[] = web.candidates;

  const coreScreen = worldToScreen(camera, room, 0, 0);
  const coreR = layout.core.radius * camera.scale;
  const corePresence = poses[0]?.corePresence ?? 1;
  if (coreScreen.x + coreR * 1.6 > 0 && coreScreen.x - coreR * 1.6 < width && coreScreen.y + coreR * 1.6 > 0 && coreScreen.y - coreR * 1.6 < height) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const core = starSprite(inks.project);
    if (core) {
      const r = Math.max(26, coreR * 0.55);
      ctx.globalAlpha = 0.5 * corePresence;
      ctx.drawImage(core, coreScreen.x - r * 2, coreScreen.y - r * 2, r * 4, r * 4);
      ctx.globalAlpha = corePresence;
      ctx.drawImage(core, coreScreen.x - 14, coreScreen.y - 14, 28, 28);
      if (layout.core.id) input.record?.(layout.core.id, coreScreen.x, coreScreen.y, 14);
    }
    const halo = layout.core;
    for (let i = 0; i < halo.starIds.length; i += 1) {
      if (halo.starKind[i] === STAR_KIND_PROJECT) continue;
      const p = worldToScreen(camera, room, halo.starX[i]!, halo.starY[i]!);
      if (p.x < -8 || p.x > width + 8 || p.y < -8 || p.y > height + 8) continue;
      const sprite = starSprite(halo.starKind[i] === STAR_KIND_CAPABILITY ? inks.capability : inks.element);
      if (!sprite) continue;
      const r = Math.min(7, Math.max(1.2, MIN_STAR_SPACING * camera.scale * 0.45));
      ctx.globalAlpha = 0.7 * corePresence * lensAlpha(input.lens, halo.starIds[i]!, inks, input.trail);
      ctx.drawImage(sprite, p.x - r, p.y - r, r * 2, r * 2);
      input.record?.(halo.starIds[i]!, p.x, p.y, r);
    }
    ctx.restore();
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
  const galaxyAlpha = galaxyLensAlpha(input.lens, inks, input.trail);
  const drawn = (key: string) => {
    if (cache.markDrawn(key)) stats.firstDraws += 1;
  };
  ctx.save();
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
    const key = galaxyKey(g);
    const alpha = !input.lens && input.trail && trailHolds(layout, input.trail, index) ? 1 : galaxyAlpha;
    const E = g.radius * IMPOSTOR_EXTENT;
    const glowSize = glowSizeFor(extent, dpr);
    let glow = cache.glow(key, glowSize);
    if (glow === undefined) {
      if (budget > 0) {
        glow = buildGalaxyGlow(g, inks, glowSize);
        cache.setGlow(key, glowSize, glow);
        budget -= 1;
        stats.buildsStarted += 1;
      } else {
        stats.pendingBuilds += 1;
        glow = cache.glow(key, glowSize === 512 ? 256 : 512) ?? null;
      }
    }
    const condense = pose.condense;
    const glowAlpha = pose.presence * alpha * (1 - 0.55 * smoothstep(900, 2600, rho));
    ctx.globalAlpha = glowAlpha;
    if (glow) {
      ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f);
      ctx.drawImage(glow.base, -E * condense, -E * condense, 2 * E * condense, 2 * E * condense);
      const w = galaxyMatrix(g, pose, camera, room, pose.theta + pose.wispTheta);
      ctx.setTransform(dpr * w.a, dpr * w.b, dpr * w.c, dpr * w.d, dpr * w.e, dpr * w.f);
      ctx.globalAlpha = glowAlpha * pose.wispLight;
      ctx.drawImage(glow.wisps, -E * condense, -E * condense, 2 * E * condense, 2 * E * condense);
      drawn(`glow:${key}:${glow.base.width}`);
    }
    ctx.globalAlpha = pose.presence * alpha;
    if (rho <= live) {
      const size = impostorSizeFor(extent, dpr);
      let bitmap = cache.impostor(key, size);
      if (bitmap === undefined) {
        if (budget > 0) {
          bitmap = buildStarImpostor(g, size, inks);
          cache.setImpostor(key, size, bitmap);
          budget -= 1;
          stats.buildsStarted += 1;
        } else {
          stats.pendingBuilds += 1;
          bitmap = cache.anyImpostor(key);
        }
      }
      if (bitmap) {
        ctx.setTransform(dpr * m.a, dpr * m.b, dpr * m.c, dpr * m.d, dpr * m.e, dpr * m.f);
        ctx.drawImage(bitmap, -E * condense, -E * condense, 2 * E * condense, 2 * E * condense);
        drawn(`impostor:${key}:${bitmap.width}`);
      }
      stats.impostorGalaxies += 1;
    } else {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const spacingPx = MIN_STAR_SPACING * camera.scale;
      band = cosmosBand(rho, live, spacingPx, band);
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
        ctx.globalAlpha = pose.presence * lensAlpha(input.lens, g.starIds[i]!, inks, input.trail) * (kind === STAR_KIND_ELEMENT ? 0.6 + 0.4 * mag : 0.92);
        ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);
        input.record?.(g.starIds[i]!, x, y, r);
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
    if (index !== focused && (sc.x < room.x || sc.x > room.x + room.width || sc.y < room.y || sc.y > room.y + room.height)) return;
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
      priority: 900 + Math.min(80, g.members / 10) + (attention.hoverGalaxy === index ? 50 : 0),
    });
  });
  ctx.restore();
  ctx.globalAlpha = 1;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  stats.band = band;

  const relationsInput = {
    layout,
    camera,
    room,
    width,
    height,
    attention,
    relationsOf: input.relationsOf,
    pointOf: input.pointOf,
    lens: input.lens,
    trail: input.trail,
    inks,
    reducedMotion: input.reducedMotion,
    labelOf: (id: string) => labelOf(layout, id),
    record: input.record,
    font: clusterFont,
    cache,
  };
  const relations = drawCosmosRelations(ctx, { ...relationsInput, hover: false });
  const placed = placeCosmosLabels(ctx, candidates.concat(relations.candidates), { room, cache, inks, metaFont, labelOf: (id) => labelOf(layout, id) });
  stats.relations = relations.rows;
  stats.lens = relations.lens;
  stats.labels = placed.concat(drawCosmosHover(ctx, relationsInput));
  return stats;
}
