'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';
import { FONT_WEIGHT } from '@/shared/ui/tokens/font-weight';

import { buildFilmScene, pickCloseUp, type FilmCloseUp, type FilmScene } from '../lib/film-scene';
import { registerGatedFrameClient } from '../lib/gateway-frame-loop';
import { isMotionPaused } from '../lib/motion-pause';
import type { StageGraph } from '../lib/stage-graph';

const ACTS = [1, 2, 3, 4, 5] as const;

/** Where each act holds on the scroll: the files, one file opened, the flight, the lines, the map. */
const ACT_SPANS: readonly (readonly [number, number])[] = [
  [0, 0.18],
  [0.18, 0.4],
  [0.4, 0.58],
  [0.58, 0.78],
  [0.78, 1],
];

/** The four-act choreography's clock: it holds while the second act opens one file. */
function filmClock(p: number): number {
  if (p < 0.18) return (p / 0.18) * 0.2;
  if (p < 0.4) return 0.2;
  return 0.2 + ((p - 0.4) / 0.6) * 0.8;
}

/** One line of the opened file's frontmatter; `role` ties it to what it becomes on the map. */
interface FrontmatterLine {
  key: string | null;
  value: string;
  role: 'kind' | 'domain' | 'dependencies' | null;
  /** For a dependency's own list item, which dependency it names. */
  dep?: number;
}

/** Named files while they float, and named capabilities on the finished map: the most connected. */
const LABELLED_FILES = 34;
const LABELLED_CAPABILITIES = 10;

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const smooth = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
const inOut = (v: number) => {
  const x = clamp(v);
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2;
};
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

interface Palette {
  ink: string;
  dim: string;
  ground: string;
  card: string;
  edge: string;
  indigo: string;
  amber: string;
  sans: string;
  mono: string;
}

function readPalette(): Palette {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();
  return {
    ink: v('--color-text-primary'),
    dim: v('--color-text-tertiary'),
    ground: v('--color-canvas'),
    card: v('--color-panel'),
    edge: v('--color-border-strong'),
    indigo: v('--map-indigo-bright'),
    amber: v('--map-amber-hub'),
    sans: getComputedStyle(document.body).fontFamily,
    mono: v('--font-mono') || 'ui-monospace, monospace',
  };
}

/** A soft round light drawn once and stamped, since a canvas shadow per mark costs every frame. */
function glowSprite(color: string): HTMLCanvasElement {
  const size = 64;
  const sprite = document.createElement('canvas');
  sprite.width = size;
  sprite.height = size;
  const ctx = sprite.getContext('2d');
  if (!ctx) return sprite;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, color);
  g.addColorStop(1, 'transparent');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return sprite;
}

/**
 * One frame of the film at scroll progress `p` (0..1) and clock `time` (ms). Four acts of a
 * quarter each: the files float, each folds into a mark and flies to its place, the relations
 * draw with light running them, then the camera pulls back over the whole map.
 */
function drawFilm(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  labelled: ReadonlySet<number>,
  namedCapabilities: ReadonlySet<number>,
  farFirst: readonly number[],
  palette: Palette,
  glow: { indigo: HTMLCanvasElement; amber: HTMLCanvasElement },
  w: number,
  h: number,
  p: number,
  time: number,
) {
  ctx.clearRect(0, 0, w, h);
  p = filmClock(p);
  const appear = smooth((p + 0.14) / 0.22);
  const fly = clamp((p - 0.22) / 0.3);
  const link = clamp((p - 0.48) / 0.27);
  const pull = inOut((p - 0.74) / 0.22);

  const cx = w / 2;
  const cy = h * 0.42;
  const unit = Math.min(w * 0.42, h * 0.42);
  const zoom = mix(1.18, 1, inOut(fly)) * mix(1, 0.92, pull);
  const turn = (1 - inOut(fly)) * 0.5 + pull * 0.1;
  const cos = Math.cos(turn);
  const sin = Math.sin(turn);
  const spread = Math.min(w * 0.46, unit * 2.4);

  const at = new Array<{ x: number; y: number; r: number }>(scene.nodes.length);
  const radiusOf = (kind: string) => (kind === 'project' ? 7 : kind === 'domain' ? 5.5 : kind === 'capability' ? 3.4 : 2.4);

  /* Files and flight, farthest first so nearer files lie on top. */
  farFirst.forEach((i) => {
    const node = scene.nodes[i];
    const depth = 1 / (1 + node.gz * 0.9);
    const drift = (p * 0.6 - 0.1) * node.gz * unit * 0.5;
    const perspective = 0.78 + 0.22 * depth;
    const fx = cx + node.gx * spread * perspective - drift;
    const fy = cy + node.gy * unit * 0.95 * perspective;
    const mx = cx + (node.x * cos - node.y * sin) * unit * zoom;
    const my = cy + (node.x * sin + node.y * cos) * unit * zoom;
    const e = inOut(fly * 1.6 - node.order * 0.6);
    const arc = Math.sin(Math.PI * e) * unit * 0.22 * (node.seed - 0.5);
    const dx = mx - fx;
    const dy = my - fy;
    const len = Math.hypot(dx, dy) || 1;
    const x = mix(fx, mx, e) - (dy / len) * arc;
    const y = mix(fy, my, e) + (dx / len) * arc;
    const r = radiusOf(node.kind);
    at[i] = { x, y, r };

    const shown = clamp(appear * 1.8 - node.gz * 0.8);
    if (shown <= 0) return;
    const named = labelled.has(i) && depth > 0.5;
    const fontPx = Math.round(10 + 3 * depth);
    ctx.font = `${fontPx}px ${palette.mono}`;
    const cardW = named ? ctx.measureText(node.file).width + 32 : 70 + 50 * depth;
    const cardH = fontPx + 12;
    /* The paper folds to a mark early in its flight, so no half-folded block crosses the screen. */
    const fold = smooth(e * 2.2);
    const bw = mix(cardW, r * 2, fold);
    const bh = mix(cardH, r * 2, fold);
    const tone = node.kind === 'project' ? palette.amber : node.kind === 'element' ? palette.dim : palette.indigo;

    /* A short streak behind a mark in flight. */
    if (e > 0.02 && e < 0.98) {
      const back = inOut(fly * 1.6 - node.order * 0.6 - 0.07);
      const tx = mix(fx, mx, back);
      const ty = mix(fy, my, back);
      ctx.globalAlpha = 0.35 * Math.sin(Math.PI * e);
      ctx.strokeStyle = tone;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(tx, ty);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    const ink = shown * mix(0.3 + depth * 0.7, 1, e);
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, mix(4, r, fold));
    /* A paper is opaque, so a file behind never shows through the one in front. */
    if (fold < 0.5) {
      ctx.globalAlpha = shown;
      ctx.fillStyle = palette.ground;
      ctx.fill();
    }
    ctx.globalAlpha = ink;
    ctx.fillStyle = fold < 0.5 ? palette.card : tone;
    ctx.fill();
    if (fold < 0.6) {
      ctx.globalAlpha = ink * (1 - fold / 0.6);
      ctx.strokeStyle = palette.edge;
      ctx.lineWidth = 1;
      ctx.stroke();
      /* The file's kind as a dot, its name beside it, as a file row reads in the app. */
      ctx.fillStyle = tone;
      ctx.beginPath();
      ctx.arc(x - bw / 2 + 10, y, 2.5, 0, Math.PI * 2);
      ctx.fill();
      if (named) {
        ctx.fillStyle = palette.ink;
        ctx.textBaseline = 'middle';
        ctx.fillText(node.file, x - bw / 2 + 20, y + 0.5);
      } else {
        /* An unnamed file shows the shape of a line of text, not an empty box. */
        ctx.fillStyle = palette.dim;
        ctx.globalAlpha *= 0.45;
        ctx.fillRect(x - bw / 2 + 20, y - 1, (bw - 30) * (0.55 + node.seed * 0.4), 2);
      }
    }
  });

  /* Relations draw outward, then light runs them. */
  if (link > 0) {
    ctx.lineWidth = 1;
    for (const edge of scene.edges) {
      const grow = clamp((link * 1.35 - edge.reveal) * 3.5);
      if (grow <= 0) continue;
      const a = at[edge.from];
      const b = at[edge.to];
      ctx.globalAlpha = (edge.contains ? 0.16 : 0.26) * mix(1, 0.8, pull);
      ctx.strokeStyle = edge.contains ? palette.ink : palette.indigo;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(mix(a.x, b.x, grow), mix(a.y, b.y, grow));
      ctx.stroke();
    }
    const lit = clamp(link * 2 - 0.5);
    if (lit > 0) {
      const runs = Math.min(36, scene.edges.length);
      for (let k = 0; k < runs; k += 1) {
        const edge = scene.edges[(k * 7) % scene.edges.length];
        const phase = (time / 2600 + k * 0.173) % 1;
        const a = at[edge.from];
        const b = at[edge.to];
        const size = 18;
        ctx.globalAlpha = lit * Math.sin(Math.PI * phase);
        ctx.drawImage(glow.indigo, mix(a.x, b.x, phase) - size / 2, mix(a.y, b.y, phase) - size / 2, size, size);
      }
    }
  }

  /* Hubs breathe once they land. */
  scene.nodes.forEach((node, i) => {
    if (node.kind !== 'project' && node.kind !== 'domain') return;
    const landed = clamp(fly * 1.6 - node.order * 0.6 - 0.6);
    if (landed <= 0) return;
    const size = (node.kind === 'project' ? 64 : 44) * (1 + 0.08 * Math.sin(time / 900 + i));
    ctx.globalAlpha = landed * 0.75;
    ctx.drawImage(node.kind === 'project' ? glow.amber : glow.indigo, at[i].x - size / 2, at[i].y - size / 2, size, size);
  });

  /* Names of the large regions arrive with the pull back. */
  if (pull > 0) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    scene.nodes.forEach((node, i) => {
      const big = node.kind === 'project' || node.kind === 'domain';
      if (!big && !(node.kind === 'capability' && namedCapabilities.has(i))) return;
      ctx.globalAlpha = big ? pull : pull * 0.7;
      ctx.font = big ? `${FONT_WEIGHT.strong} 13px ${palette.sans}` : `11px ${palette.sans}`;
      /* A rim of the ground behind each name, so a line passing under it does not cut it. */
      ctx.strokeStyle = palette.ground;
      ctx.lineWidth = 4;
      ctx.lineJoin = 'round';
      ctx.strokeText(node.label, at[i].x, at[i].y + at[i].r + 6);
      ctx.fillStyle = big ? palette.ink : palette.dim;
      ctx.fillText(node.label, at[i].x, at[i].y + at[i].r + 6);
    });
    ctx.textAlign = 'start';
  }
  ctx.globalAlpha = 1;
  return at;
}

/**
 * The second act: one real file lifts out of the field and opens, its frontmatter types itself,
 * and each line it holds becomes what it is on the map: `kind` the mark, `domain` the place that
 * holds it, `dependencies` the lines out of it. `q` is the act's own progress, 0..1.
 */
function drawCloseUp(
  ctx: CanvasRenderingContext2D,
  scene: FilmScene,
  pick: FilmCloseUp,
  lines: readonly FrontmatterLine[],
  from: { x: number; y: number },
  palette: Palette,
  glow: { indigo: HTMLCanvasElement; amber: HTMLCanvasElement },
  w: number,
  h: number,
  q: number,
  time: number,
) {
  const open = inOut(q / 0.2) * (1 - inOut((q - 0.86) / 0.14));
  if (open <= 0) return;
  const wide = w >= 880;
  const fontPx = wide ? 15 : 12;
  const lineH = Math.round(fontPx * 1.8);
  const padX = wide ? 26 : 18;
  const barH = wide ? 40 : 34;
  const panelW = wide ? Math.min(520, w * 0.42) : w - 32;
  const panelH = barH + 14 + lines.length * lineH + 3 * 14 + 22;
  const graphW = 320;
  const gap = 96;
  const px = wide ? w / 2 - (panelW + gap + graphW) / 2 : (w - panelW) / 2;
  const py = wide ? h * 0.4 - panelH / 2 : Math.max(76, h * 0.1);

  /* The rest of the field steps back. */
  ctx.globalAlpha = 0.9 * open;
  ctx.fillStyle = palette.ground;
  ctx.fillRect(0, 0, w, h);

  /* The card grows from where it floated into the open file. */
  const x0 = mix(from.x - 90, px, open);
  const y0 = mix(from.y - 13, py, open);
  const bw = mix(180, panelW, open);
  const bh = mix(26, panelH, open);
  ctx.globalAlpha = Math.min(1, open * 1.4);
  ctx.beginPath();
  ctx.roundRect(x0, y0, bw, bh, mix(4, 12, open));
  ctx.fillStyle = palette.ground;
  ctx.fill();
  ctx.fillStyle = palette.card;
  ctx.fill();
  ctx.strokeStyle = palette.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  const size = Math.max(bw, bh) * 1.5;
  ctx.globalAlpha = 0.12 * open;
  ctx.drawImage(glow.indigo, x0 + bw / 2 - size / 2, y0 + bh / 2 - size / 2, size, size);

  const text = clamp((open - 0.82) / 0.18);
  if (text <= 0) return;
  const node = scene.nodes[pick.index];
  ctx.textBaseline = 'middle';
  ctx.globalAlpha = text;
  ctx.fillStyle = palette.indigo;
  ctx.beginPath();
  ctx.arc(px + padX, py + barH / 2, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.font = `${fontPx - 1}px ${palette.mono}`;
  ctx.fillStyle = palette.dim;
  ctx.fillText(node.file, px + padX + 12, py + barH / 2 + 0.5);
  ctx.globalAlpha = text * 0.6;
  ctx.fillStyle = palette.edge;
  ctx.fillRect(px, py + barH, panelW, 1);

  /* The frontmatter types itself, line by line. */
  const total = lines.reduce((sum, line) => sum + (line.key ? line.key.length + 2 : 0) + line.value.length, 0);
  let budget = Math.floor(clamp((q - 0.2) / 0.32) * total);
  const highlight = clamp((q - 0.52) / 0.3);
  const roles = ['domain', 'kind', 'dependencies'] as const;
  const roleLight = (role: FrontmatterLine['role']) => {
    const k = roles.indexOf(role as (typeof roles)[number]);
    return k < 0 ? 0 : smooth((highlight - k / 3) * 3.2) * (1 - inOut((q - 0.86) / 0.14));
  };
  const ends = new Map<string, { x: number; y: number }>();
  let caret: { x: number; y: number } | null = null;
  ctx.font = `${fontPx}px ${palette.mono}`;
  lines.forEach((line, row) => {
    const y = py + barH + 14 + row * lineH + lineH / 2;
    let x = px + padX;
    const lit = roleLight(line.role);
    if (lit > 0) {
      ctx.globalAlpha = text * 0.16 * lit;
      ctx.fillStyle = palette.indigo;
      ctx.beginPath();
      ctx.roundRect(px + 8, y - lineH / 2 + 2, panelW - 16, lineH - 4, 6);
      ctx.fill();
    }
    const write = (part: string, color: string) => {
      if (budget <= 0) return;
      const shown = part.slice(0, budget);
      budget -= part.length;
      ctx.globalAlpha = text;
      ctx.fillStyle = color;
      ctx.fillText(shown, x, y + 0.5);
      x += ctx.measureText(shown).width;
      caret = { x, y };
    };
    if (line.key) {
      write(line.key, lit > 0.5 ? palette.indigo : palette.dim);
      write(': ', palette.dim);
    }
    write(line.value, line.key ? palette.ink : palette.dim);
    if (line.dep !== undefined) ends.set(`dep${line.dep}`, { x: x + 10, y });
    else if (line.role && line.role !== 'dependencies') ends.set(line.role, { x: x + 10, y });
  });
  if (caret && q < 0.56) {
    ctx.globalAlpha = text * (0.5 + 0.5 * Math.sin(time / 160));
    ctx.fillStyle = palette.indigo;
    ctx.fillRect((caret as { x: number }).x + 2, (caret as { y: number }).y - fontPx * 0.6, 2, fontPx * 1.2);
  }
  /* Two lines of body text, as a file reads under its frontmatter. */
  ctx.globalAlpha = text * clamp((q - 0.5) / 0.08) * 0.35;
  ctx.fillStyle = palette.dim;
  const bodyY = py + barH + 14 + lines.length * lineH + 10;
  ctx.fillRect(px + padX, bodyY, (panelW - padX * 2) * 0.86, 3);
  ctx.fillRect(px + padX, bodyY + 14, (panelW - padX * 2) * 0.62, 3);

  /* What the lines become: the mark, the domain that holds it, the concepts it relies on. */
  const gx = wide ? px + panelW + gap + graphW / 2 : w / 2;
  const gy = wide ? py + panelH / 2 : py + panelH + 78;
  const span = wide ? 96 : 56;
  const self = { x: gx, y: gy };
  const holder = { x: gx, y: gy - span };
  const deps = pick.dependencies.map((_, k) => ({
    /* Mirrored, so the first list item reaches the farthest mark and no two connectors cross. */
    x: gx + ((pick.dependencies.length - 1) / 2 - k) * (wide ? 110 : 96),
    y: gy + span,
  }));
  const connector = (end: string, to: { x: number; y: number }, light: number) => {
    const start = ends.get(end);
    /* On a narrow stage a connector would cross the file's own text; the lit line says it. */
    if (!wide || !start || light <= 0) return;
    const grow = smooth(light * 1.4);
    const cx1 = wide ? mix(start.x, to.x, 0.6) : start.x;
    const cy1 = wide ? start.y : mix(start.y, to.y, 0.6);
    ctx.globalAlpha = 0.5 * light;
    ctx.strokeStyle = palette.indigo;
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    const steps = 24;
    for (let s = 1; s <= Math.round(steps * grow); s += 1) {
      const u = s / steps;
      const ax = mix(mix(start.x, cx1, u), mix(cx1, to.x, u), u);
      const ay = mix(mix(start.y, cy1, u), mix(cy1, to.y, u), u);
      ctx.lineTo(ax, ay);
    }
    ctx.stroke();
    ctx.setLineDash([]);
  };
  const mark = (
    at: { x: number; y: number },
    r: number,
    tone: string,
    sprite: HTMLCanvasElement,
    light: number,
    label: string | null,
    above = false,
  ) => {
    if (light <= 0) return;
    const pop = 1 + 0.25 * Math.sin(Math.PI * clamp(light * 1.5));
    const size = r * 9 * (1 + 0.06 * Math.sin(time / 700 + at.x));
    ctx.globalAlpha = 0.8 * light;
    ctx.drawImage(sprite, at.x - size / 2, at.y - size / 2, size, size);
    ctx.globalAlpha = light;
    ctx.fillStyle = tone;
    ctx.beginPath();
    ctx.arc(at.x, at.y, r * pop, 0, Math.PI * 2);
    ctx.fill();
    if (!label) return;
    ctx.font = `12px ${palette.sans}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = above ? 'bottom' : 'top';
    const ly = above ? at.y - r - 8 : at.y + r + 8;
    ctx.strokeStyle = palette.ground;
    ctx.lineWidth = 4;
    ctx.lineJoin = 'round';
    ctx.strokeText(label, at.x, ly);
    ctx.fillStyle = palette.ink;
    ctx.fillText(label, at.x, ly);
    ctx.textAlign = 'start';
    ctx.textBaseline = 'middle';
  };
  const kindLight = roleLight('kind');
  const domainLight = roleLight('domain');
  const depsLight = roleLight('dependencies');
  connector('kind', { x: self.x - 14, y: self.y }, kindLight);
  connector('domain', { x: holder.x - 16, y: holder.y }, domainLight);
  deps.forEach((dep, k) => connector(`dep${k}`, { x: dep.x - 8, y: dep.y }, clamp(depsLight * 1.4 - k * 0.2)));
  /* The relations themselves, solid, between the marks. */
  ctx.lineWidth = 1.4;
  const holds = Math.min(domainLight, kindLight);
  if (holds > 0) {
    ctx.globalAlpha = 0.55 * holds;
    ctx.strokeStyle = palette.ink;
    ctx.beginPath();
    ctx.moveTo(holder.x, holder.y);
    ctx.lineTo(mix(holder.x, self.x, smooth(holds * 1.3)), mix(holder.y, self.y, smooth(holds * 1.3)));
    ctx.stroke();
  }
  deps.forEach((dep, k) => {
    const light = clamp(depsLight * 1.4 - k * 0.2);
    if (light <= 0) return;
    ctx.globalAlpha = 0.6 * light;
    ctx.strokeStyle = palette.indigo;
    ctx.beginPath();
    ctx.moveTo(self.x, self.y);
    ctx.lineTo(mix(self.x, dep.x, smooth(light * 1.3)), mix(self.y, dep.y, smooth(light * 1.3)));
    ctx.stroke();
    const run = (time / 1400 + k * 0.31) % 1;
    ctx.globalAlpha = light * Math.sin(Math.PI * run);
    ctx.drawImage(glow.indigo, mix(self.x, dep.x, run) - 8, mix(self.y, dep.y, run) - 8, 16, 16);
  });
  mark(holder, 6.5, palette.indigo, glow.indigo, domainLight, scene.nodes[pick.parent].label, true);
  deps.forEach((dep, k) => {
    const target = scene.nodes[pick.dependencies[k]];
    mark(dep, 4, target.kind === 'element' ? palette.dim : palette.indigo, glow.indigo, clamp(depsLight * 1.4 - k * 0.2), wide ? target.label : null);
  });
  mark(self, 5, palette.indigo, glow.indigo, kindLight, null);
  if (kindLight > 0) {
    ctx.globalAlpha = kindLight;
    ctx.font = `${FONT_WEIGHT.strong} 13px ${palette.sans}`;
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = palette.ground;
    ctx.lineWidth = 4;
    ctx.strokeText(node.label, self.x + 16, self.y);
    ctx.fillStyle = palette.ink;
    ctx.fillText(node.label, self.x + 16, self.y);
  }
  ctx.globalAlpha = 1;
}

/** Each caption holds its act's span, fading across the seams; the last one stays. */
function captionLight(act: number, p: number): number {
  const [start, end] = ACT_SPANS[act - 1];
  const fadeIn = act === 1 ? 1 : smooth((p - start + 0.02) / 0.05);
  const fadeOut = act === ACT_SPANS.length ? 1 : 1 - smooth((p - end + 0.03) / 0.05);
  return Math.min(fadeIn, fadeOut);
}

/**
 * The page's film: while the visitor scrolls through a tall block, its stage stays pinned and the
 * repository's real concepts go from Markdown files to the map. Without a script or under reduced
 * motion the block is short, the finished map is one still frame and the four captions are a list.
 */
export function FilmSection({ graph }: { graph: StageGraph }) {
  const t = useTranslations('download.film');
  const scene = useMemo(() => buildFilmScene(graph), [graph]);
  const labelled = useMemo(() => {
    const ranked = graph.nodes.map((node, i) => ({ i, d: node.fullDegree })).sort((a, b) => b.d - a.d);
    return new Set(ranked.slice(0, LABELLED_FILES).map((entry) => entry.i));
  }, [graph]);
  const namedCapabilities = useMemo(() => {
    const ranked = graph.nodes
      .map((node, i) => ({ i, d: node.fullDegree, kind: node.kind }))
      .filter((entry) => entry.kind === 'capability')
      .sort((a, b) => b.d - a.d);
    return new Set(ranked.slice(0, LABELLED_CAPABILITIES).map((entry) => entry.i));
  }, [graph]);
  const locale = useLocale();
  const closeUp = useMemo(() => pickCloseUp(scene), [scene]);
  const frontmatter = useMemo<FrontmatterLine[]>(() => {
    if (!closeUp) return [];
    const slug = (i: number) => scene.nodes[i].id.split(':').pop() ?? scene.nodes[i].id;
    const node = scene.nodes[closeUp.index];
    return [
      { key: null, value: '---', role: null },
      /* Top to bottom as the tree grows: the domain that holds it, the concept, what it relies on. */
      { key: 'domain', value: slug(closeUp.parent), role: 'domain' },
      { key: 'kind', value: node.kind, role: 'kind' },
      { key: locale === 'en' ? 'title' : `display_${locale}`, value: node.label, role: null },
      { key: 'dependencies', value: '', role: 'dependencies' },
      ...closeUp.dependencies.map((dep, k): FrontmatterLine => ({ key: null, value: `  - ${slug(dep)}`, role: 'dependencies', dep: k })),
      { key: null, value: '---', role: null },
    ];
  }, [closeUp, scene, locale]);
  const block = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const captions = useRef<(HTMLLIElement | null)[]>([]);
  const [film, setFilm] = useState(false);

  useEffect(() => {
    const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof IntersectionObserver === 'undefined') return;
    const id = requestAnimationFrame(() => setFilm(true));
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    const el = canvas.current;
    const host = stage.current;
    const ctx = el?.getContext('2d');
    if (!el || !host || !ctx || scene.nodes.length === 0) return;
    const palette = readPalette();
    const farFirst = scene.nodes.map((_, i) => i).sort((a, b) => scene.nodes[b].gz - scene.nodes[a].gz);
    const glow = { indigo: glowSprite(palette.indigo), amber: glowSprite(palette.amber) };
    let w = 0;
    let h = 0;
    let shown = film ? 0 : 1;
    let clock = 0;

    const progress = () => {
      const outer = block.current;
      if (!film || !outer) return 1;
      const rect = outer.getBoundingClientRect();
      const travel = outer.offsetHeight - host.offsetHeight;
      return travel > 0 ? clamp(-rect.top / travel) : 1;
    };
    const paint = () => {
      const at = drawFilm(ctx, scene, labelled, namedCapabilities, farFirst, palette, glow, w, h, shown, clock);
      if (film && closeUp && shown > 0.18 && shown < 0.4) {
        drawCloseUp(ctx, scene, closeUp, frontmatter, at[closeUp.index], palette, glow, w, h, (shown - 0.18) / 0.22, clock);
      }
      if (!film) return;
      captions.current.forEach((caption, i) => {
        if (!caption) return;
        const light = captionLight(i + 1, shown);
        caption.style.opacity = String(light);
        caption.style.transform = `translateY(${(1 - light) * 12}px)`;
        caption.style.visibility = light > 0.01 ? 'visible' : 'hidden';
      });
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = el.clientWidth;
      h = el.clientHeight;
      el.width = Math.round(w * dpr);
      el.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      shown = progress();
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();
    if (!film) return () => observer.disconnect();

    const unregister = registerGatedFrameClient(host, ({ t: now, dtMs }) => {
      clock = now;
      shown += (progress() - shown) * Math.min(1, dtMs / 110);
      paint();
    });
    // The page's pause stops the frame loop, so a paused film follows the visitor's own scroll
    // here instead: the acts still advance, the shimmer holds on the clock it stopped at.
    let pending = 0;
    const onScroll = () => {
      if (!isMotionPaused() || pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        shown = progress();
        paint();
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      unregister();
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(pending);
    };
  }, [film, scene, labelled, namedCapabilities, closeUp, frontmatter]);

  const counts = { concepts: graph.nodes.length, relations: graph.edges.length };

  return (
    <div
      ref={block}
      role="region"
      aria-labelledby="gateway-film-title"
      data-testid="gateway-film"
      data-gateway-film={film ? 'playing' : 'still'}
      className={cn('relative mt-[var(--gateway-section-gap)] w-full', film && 'h-[480svh]')}
    >
      <h2 id="gateway-film-title" className="sr-only">
        {t('label')}
      </h2>
      <div
        ref={stage}
        className={cn(
          'relative w-full overflow-hidden',
          film ? 'sticky top-0 h-[100svh]' : cn(PAGE_GUTTER, 'h-[34rem]'),
        )}
      >
        <canvas ref={canvas} aria-hidden className="gateway-film-canvas absolute inset-0 h-full w-full" />
        {film ? <div aria-hidden className="gateway-film-vignette pointer-events-none absolute inset-0" /> : null}
        {film ? (
        <ol className="absolute inset-x-0 bottom-[9svh] grid place-items-center px-6">
          {ACTS.map((act, i) => (
            <li
              key={act}
              ref={(node) => {
                captions.current[i] = node;
              }}
              className="invisible flex max-w-[40rem] flex-col items-center text-center opacity-0 [grid-area:1/1]"
            >
              <span className="font-mono text-caption uppercase leading-caption tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-tertiary)]">
                {String(act).padStart(2, '0')} / {String(ACTS.length).padStart(2, '0')}
              </span>
              <h3 className="mt-3 [text-wrap:balance] text-hero-lg font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
                {t(`acts.${act}.title`)}
              </h3>
              <p className="mt-3 text-title leading-title text-[color:var(--color-text-secondary)]">
                {t(`acts.${act}.body`, counts)}
              </p>
            </li>
          ))}
        </ol>
        ) : null}
      </div>
      {film ? null : (
        <div className={PAGE_GUTTER}>
          <ol className={cn(PAGE_COLUMN, 'mt-8 grid gap-6 @container sm:grid-cols-2 lg:grid-cols-4')}>
            {ACTS.map((act) => (
              <li key={act} className="min-w-0">
                <span className="font-mono text-caption leading-caption text-[color:var(--color-text-tertiary)]">
                  {String(act).padStart(2, '0')}
                </span>
                <h3 className="mt-2 text-title leading-title text-[color:var(--color-text-primary)]">
                  {t(`acts.${act}.title`)}
                </h3>
                <p className="mt-1 text-body leading-body text-[color:var(--color-text-tertiary)]">
                  {t(`acts.${act}.body`, counts)}
                </p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
