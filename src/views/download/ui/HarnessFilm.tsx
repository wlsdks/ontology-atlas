'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/cn';
import { PAGE_COLUMN, PAGE_GUTTER } from '@/shared/lib/public-pages/gateway-frame';

import { registerGatedFrameClient } from '../lib/gateway-frame-loop';
import facts from '../lib/harness-facts.json';
import {
  buildHarnessScene,
  layoutReading,
  type HarnessFacts,
  type HarnessScene,
  type Mark,
  type ReadingSpot,
} from '../lib/harness-scene';
import { isMotionPaused } from '@/shared/motion/motion-pause';

const ACTS = [1, 2, 3, 4] as const;
const FILM_MIN_WIDTH = 768;
const FACTS: HarnessFacts = facts;

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
  soft: string;
  dim: string;
  ground: string;
  card: string;
  edge: string;
  indigo: string;
  amber: string;
  pass: string;
  stop: string;
  mono: string;
}

function readPalette(): Palette {
  const root = getComputedStyle(document.documentElement);
  const v = (name: string) => root.getPropertyValue(name).trim();
  return {
    ink: v('--color-text-primary'),
    soft: v('--color-text-secondary'),
    dim: v('--color-text-tertiary'),
    ground: v('--color-canvas'),
    card: v('--color-panel'),
    edge: v('--color-border-strong'),
    indigo: v('--map-indigo-bright'),
    amber: v('--map-amber-hub'),
    pass: v('--color-status-success'),
    stop: v('--color-status-danger'),
    mono: v('--font-mono') || 'ui-monospace, monospace',
  };
}

type Glow = Record<'indigo' | 'amber' | 'pass' | 'stop', HTMLCanvasElement>;

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

/** Text widths per font size, measured once: the same names are drawn every frame. */
function widthCache(ctx: CanvasRenderingContext2D, mono: string) {
  const known = new Map<string, number>();
  return (text: string, px: number) => {
    const key = `${px}|${text}`;
    let width = known.get(key);
    if (width === undefined) {
      ctx.font = `${px}px ${mono}`;
      width = ctx.measureText(text).width;
      known.set(key, width);
    }
    return width;
  };
}

interface Frame {
  ctx: CanvasRenderingContext2D;
  scene: HarnessScene;
  palette: Palette;
  glow: Glow;
  measure: (text: string, px: number) => number;
  /** The reading field for the current stage size, and its cards farthest first. */
  spots: ReadingSpot[];
  farFirst: number[];
  w: number;
  h: number;
  p: number;
  time: number;
}

function stamp(f: Frame, sprite: HTMLCanvasElement, x: number, y: number, size: number, alpha: number) {
  if (alpha <= 0.004) return;
  f.ctx.globalAlpha = alpha;
  f.ctx.drawImage(sprite, x - size / 2, y - size / 2, size, size);
}

/** A labelled pill in the film's file-card look: opaque paper, a hairline, a dot, a mono name. */
function pill(
  f: Frame,
  x: number,
  y: number,
  text: string | null,
  px: number,
  alpha: number,
  dot: string,
  options: { width?: number; rim?: string; ink?: string; rimAlpha?: number } = {},
) {
  const { ctx, palette } = f;
  const bw = options.width ?? (text ? f.measure(text, px) + 30 : 80);
  const bh = px + 13;
  ctx.beginPath();
  ctx.roundRect(x - bw / 2, y - bh / 2, bw, bh, 6);
  ctx.globalAlpha = Math.min(1, alpha * 1.4);
  ctx.fillStyle = palette.ground;
  ctx.fill();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = palette.card;
  ctx.fill();
  ctx.globalAlpha = alpha * (options.rimAlpha ?? 1);
  ctx.strokeStyle = options.rim ?? palette.edge;
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = dot;
  ctx.beginPath();
  ctx.arc(x - bw / 2 + 11, y, 2.5, 0, Math.PI * 2);
  ctx.fill();
  if (text) {
    ctx.font = `${px}px ${palette.mono}`;
    ctx.fillStyle = options.ink ?? palette.ink;
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x - bw / 2 + 21, y + 0.5);
  } else {
    ctx.fillStyle = palette.dim;
    ctx.globalAlpha = alpha * 0.45;
    ctx.fillRect(x - bw / 2 + 21, y - 1, bw - 34, 2);
  }
  return bw;
}

/** The agent: a ring, a slow dashed orbit and a four-point spark, lit by how much it has read. */
function drawAgent(f: Frame, x: number, y: number, lit: number) {
  const { ctx, palette, time } = f;
  const breathe = 1 + 0.06 * Math.sin(time / 1100);
  stamp(f, f.glow.indigo, x, y, (70 + 70 * lit) * breathe, 0.35 + 0.5 * lit);
  ctx.globalAlpha = 0.9;
  ctx.fillStyle = palette.ground;
  ctx.beginPath();
  ctx.arc(x, y, 15, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = palette.indigo;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 0.25 + 0.3 * lit;
  ctx.setLineDash([2, 5]);
  ctx.lineDashOffset = -time / 70;
  ctx.beginPath();
  ctx.arc(x, y, 23, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.globalAlpha = 0.6 + 0.4 * lit;
  ctx.fillStyle = palette.ink;
  ctx.beginPath();
  for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2 - Math.PI / 2;
    const r = k % 2 === 0 ? 8 : 2.4;
    if (k === 0) ctx.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    else ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
}

function toneOf(f: Frame, tone: Mark['tone']): string {
  const { palette } = f;
  if (tone === 'instructions') return palette.amber;
  if (tone === 'rules' || tone === 'guard') return palette.indigo;
  if (tone === 'check') return palette.pass;
  if (tone === 'skill') return palette.soft;
  return palette.dim;
}

/** Act one: the files the agent reads arrive in rows at depth and send their light into it. */
function drawReading(f: Frame, agent: { x: number; y: number }) {
  const { scene, spots, w, p, time } = f;
  const { ctx } = f;
  const appear = smooth((p + 0.16) / 0.24);
  const read = clamp(p / 0.2);
  const leave = smooth((p - 0.22) / 0.1);
  if (leave >= 1 || spots.length === 0) return;

  const at = scene.files.map((file, i) => {
    const spot = spots[i]!;
    /* Rows drift apart in turn, the near ones faster: depth without a camera. */
    const drift = (spot.row % 2 === 0 ? -1 : 1) * (p - 0.1) * 70 * spot.depth;
    const arrive = smooth(appear * 2.2 - file.order * 1.2);
    return {
      x: spot.x + drift - leave * w * (0.25 + 0.5 * spot.depth),
      y: spot.y + (1 - arrive) * 14 * (spot.y < agent.y ? -1 : 1),
      shown: arrive * (1 - leave),
      lit: clamp((read * 1.3 - file.order * 0.9) * 4),
    };
  });

  /* Lines of light first, so every card lies over them. */
  ctx.lineWidth = 1;
  scene.files.forEach((file, i) => {
    const { x, y, shown, lit } = at[i]!;
    const depth = spots[i]!.depth;
    if (lit <= 0 || shown <= 0) return;
    ctx.globalAlpha = shown * (0.08 + 0.14 * depth);
    ctx.strokeStyle = toneOf(f, file.kind);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(mix(x, agent.x, lit), mix(y, agent.y, lit));
    ctx.stroke();
    if (lit >= 1) {
      const phase = (time / 2200 + file.seed) % 1;
      stamp(f, f.glow.indigo, mix(x, agent.x, phase), mix(y, agent.y, phase), 8 + 8 * depth, shown * Math.sin(Math.PI * phase) * 0.9);
    } else {
      stamp(f, f.glow.indigo, mix(x, agent.x, lit), mix(y, agent.y, lit), 16, shown);
    }
  });

  f.farFirst.forEach((i) => {
    const file = scene.files[i]!;
    const { x, y, shown, lit } = at[i]!;
    const spot = spots[i]!;
    if (shown <= 0) return;
    pill(f, x, y, file.label, spot.px, shown * (0.3 + 0.7 * spot.depth), toneOf(f, file.kind), {
      rim: lit > 0 ? f.palette.indigo : undefined,
      rimAlpha: lit > 0 ? 0.35 + 0.45 * lit : 1,
      ink: spot.depth < 1 ? f.palette.soft : undefined,
    });
  });
}

/** Act two: commands leave the agent; the hooks let some through and break the ones they deny. */
function drawGate(f: Frame, agent: { x: number; y: number }) {
  const { ctx, scene, palette, w, h, p } = f;
  const enter = smooth((p - 0.2) / 0.1);
  const leave = smooth((p - 0.48) / 0.08);
  const shown = enter * (1 - leave);
  if (shown <= 0) return;
  const a = clamp((p - 0.27) / 0.21);
  const cy = h * 0.4;
  const unit = Math.min(w * 0.42, h * 0.42);
  const shift = (1 - enter) * w * 0.3 - leave * w * 0.4;
  const gateX = w * 0.58 + shift;
  const lanes = scene.gate.length;
  const gap = Math.min(unit * 0.5, 104);
  const laneY = (k: number) => cy + (k - (lanes - 1) / 2) * gap;
  const top = laneY(0) - gap * 0.8;
  const bottom = laneY(lanes - 1) + gap * 0.8;
  const codeX = w * 0.8 + shift * 1.25;
  const PX = 13;
  const plateW = scene.gate.map((name) => f.measure(name, PX) + 34);
  const course = (chip: (typeof scene.commands)[number]) => {
    const cw = f.measure(chip.command, PX) + 30;
    return {
      cw,
      x0: agent.x + 34 + cw / 2,
      y0: agent.y,
      x1: gateX - plateW[chip.lane]! / 2 - cw / 2 - 6,
      y1: laneY(chip.lane),
    };
  };

  /* The code the commands are aimed at: faint lines that flare where a command lands. */
  const flare = new Array<number>(lanes).fill(0);
  const plateGlow = scene.gate.map(() => ({ pass: 0, stop: 0 }));
  const chips = scene.commands.map((chip) => {
    const travel = (a - chip.launch) / 0.17;
    const after = (a - chip.launch - 0.17) / 0.14;
    if (chip.blockedBy) plateGlow[chip.lane]!.stop = Math.max(plateGlow[chip.lane]!.stop, after < 0 ? 0 : Math.max(0, 1 - Math.max(0, after - 0.4) * 0.6));
    else {
      plateGlow[chip.lane]!.pass = Math.max(plateGlow[chip.lane]!.pass, Math.sin(Math.PI * clamp(after * 2.2)));
      flare[chip.lane] = Math.max(flare[chip.lane]!, Math.sin(Math.PI * clamp((after - 0.55) * 2.2)));
    }
    return { chip, travel, after };
  });

  const rows = Math.floor((bottom - top) / 15);
  for (let r = 0; r <= rows; r += 1) {
    const y = top + r * 15;
    const lane = Math.round((y - laneY(0)) / gap);
    const near = lane >= 0 && lane < lanes ? flare[lane]! * Math.max(0, 1 - Math.abs(y - laneY(lane)) / (gap * 0.5)) : 0;
    const len = (0.35 + 0.6 * ((r * 0.618) % 1)) * w * 0.14;
    const indent = ((r * 3) % 4) * 10;
    ctx.globalAlpha = shown * (0.12 + 0.5 * near);
    ctx.fillStyle = near > 0.05 ? palette.indigo : palette.dim;
    ctx.fillRect(codeX + indent, y, len, 2);
  }

  /* The gate: a curtain of light with the hook names standing in it. */
  const curtain = ctx.createLinearGradient(0, top, 0, bottom);
  curtain.addColorStop(0, 'transparent');
  curtain.addColorStop(0.5, palette.indigo);
  curtain.addColorStop(1, 'transparent');
  ctx.globalAlpha = shown * 0.55;
  ctx.fillStyle = curtain;
  ctx.fillRect(gateX - 0.75, top - gap * 0.4, 1.5, bottom - top + gap * 0.8);
  ctx.globalAlpha = shown * 0.06;
  ctx.fillRect(gateX - 26, top, 52, bottom - top);

  /* A command the hooks let through passes behind its plate, so the hook's name stays readable. */
  for (const { chip, travel, after } of chips) {
    if (chip.blockedBy || travel <= 1) continue;
    const { cw, x1, y1 } = course(chip);
    const s = clamp(after);
    const x = mix(x1, codeX + cw / 2, inOut(s));
    const alpha = shown * (1 - smooth((s - 0.55) / 0.45));
    if (alpha > 0) pill(f, x, y1, chip.command, PX, alpha, palette.pass);
  }

  scene.gate.forEach((name, k) => {
    const y = laneY(k);
    const { pass, stop } = plateGlow[k]!;
    /* The hook's own verdict, as it prints it. */
    if (stop > 0.05) {
      ctx.globalAlpha = shown * stop;
      ctx.font = `11px ${palette.mono}`;
      ctx.fillStyle = palette.stop;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText('"permissionDecision": "deny"', gateX, y + PX + 6);
      ctx.textAlign = 'start';
    }
    stamp(f, f.glow.stop, gateX, y, plateW[k]! * 0.9, shown * stop * 0.55);
    stamp(f, f.glow.indigo, gateX, y, plateW[k]! * 0.8, shown * pass * 0.5);
    pill(f, gateX, y, name, PX, shown, stop > 0.05 ? palette.stop : palette.indigo, {
      rim: stop > 0.05 ? palette.stop : pass > 0.05 ? palette.indigo : undefined,
      ink: stop > 0.4 ? palette.ink : palette.soft,
    });
  });

  /* Commands on their way, and the ones a hook denies. */
  for (const { chip, travel, after } of chips) {
    if (travel <= 0 || (!chip.blockedBy && travel > 1)) continue;
    const { cw, x0, y0, x1, y1 } = course(chip);
    if (travel <= 1) {
      const e = inOut(travel);
      const x = mix(x0, x1, e);
      const y = mix(y0, y1, smooth(travel * 1.3));
      const back = inOut(travel - 0.12);
      ctx.globalAlpha = shown * 0.35 * Math.sin(Math.PI * travel);
      ctx.strokeStyle = palette.indigo;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(mix(x0, x1, back) - cw / 2, mix(y0, y1, smooth((travel - 0.12) * 1.3)));
      ctx.lineTo(x - cw / 2, y);
      ctx.stroke();
      pill(f, x, y, chip.command, PX, shown * clamp(travel * 5), palette.dim);
      continue;
    }
    /* Denied: the chip turns, then breaks apart back toward the agent. */
    const s = clamp(after);
    const hold = 1 - smooth((s - 0.25) / 0.2);
    const recoil = Math.sin(Math.PI * clamp(s * 4)) * 5;
    if (hold > 0) pill(f, x1 - recoil, y1, chip.command, PX, shown * hold, palette.stop, { rim: palette.stop, ink: palette.stop });
    const burst = clamp((s - 0.25) / 0.75);
    if (burst > 0 && burst < 1) {
      const fly = 1 - (1 - burst) ** 3;
      ctx.fillStyle = palette.stop;
      for (let j = 0; j < 14; j += 1) {
        const seed = ((j * 0.6180339 + chip.launch * 7.31) % 1 + 1) % 1;
        const angle = Math.PI + (seed - 0.5) * 2.4;
        const speed = 40 + 120 * ((seed * 13.7) % 1);
        const sx = x1 + (seed - 0.5) * cw * 0.8 + Math.cos(angle) * speed * fly;
        const sy = y1 + Math.sin(angle) * speed * fly * 0.6 + 50 * burst * burst;
        const size = 2 + 4 * ((seed * 5.3) % 1);
        ctx.globalAlpha = shown * (1 - burst);
        ctx.save();
        ctx.translate(sx, sy);
        ctx.rotate(burst * (seed - 0.5) * 9);
        ctx.fillRect(-size / 2, -size / 4, size, size / 2);
        ctx.restore();
      }
      stamp(f, f.glow.stop, x1, y1, 60, shown * (1 - burst) * 0.6);
    }
  }
}

/** Act three: the edit rides a rail of checks; each lights as it passes, the rails behind too. */
function drawRails(f: Frame, agent: { x: number; y: number }) {
  const { ctx, scene, palette, w, h, p } = f;
  const enter = smooth((p - 0.46) / 0.09);
  const leave = smooth((p - 0.73) / 0.08);
  const shown = enter * (1 - leave);
  if (shown <= 0) return;
  const a = clamp((p - 0.52) / 0.2);
  const cy = h * 0.4;
  const unit = Math.min(w * 0.42, h * 0.42);
  const shift = (1 - enter) * w * 0.25 - leave * w * 0.2;
  const x0 = agent.x + 34;
  const x1 = w * 0.92 + shift;
  const pulse = mix(x0, x1, inOut(a * 1.06 - 0.02));
  const PX = 12;

  /* Rails behind, at depth: every other check, drifting past slower the farther they are. */
  const backY = [-0.62, -0.34, 0.34, 0.62];
  scene.backRails.forEach((names, k) => {
    const depth = k === 0 || k === 3 ? 0.55 : 0.8;
    const y = cy + backY[k]! * unit;
    const px = Math.round(9 + 2.5 * depth);
    let x = w * 0.04 + ((k * 137) % 180) + shift * depth - a * w * 0.32 * depth;
    ctx.globalAlpha = shown * 0.08 * depth;
    ctx.fillStyle = palette.ink;
    ctx.fillRect(0, y, w, 1);
    ctx.font = `${px}px ${palette.mono}`;
    ctx.textBaseline = 'middle';
    for (const name of names) {
      const width = f.measure(name, px);
      if (x > w) break;
      if (x + width > -20) {
        const lit = clamp((pulse - x) / 80);
        ctx.globalAlpha = shown * depth * (0.32 + 0.45 * lit);
        ctx.fillStyle = lit > 0 ? palette.pass : palette.dim;
        ctx.beginPath();
        ctx.arc(x - 8, y, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = lit > 0.5 ? palette.soft : palette.dim;
        ctx.fillText(name, x, y);
      }
      x += width + 46;
    }
  });

  /* The front rail and its stations. */
  ctx.globalAlpha = shown * 0.22;
  ctx.fillStyle = palette.ink;
  ctx.fillRect(x0, cy - 0.5, x1 - x0, 1);
  const trail = ctx.createLinearGradient(Math.max(x0, pulse - w * 0.35), 0, pulse, 0);
  trail.addColorStop(0, 'transparent');
  trail.addColorStop(1, palette.pass);
  ctx.globalAlpha = shown * 0.8;
  ctx.fillStyle = trail;
  ctx.fillRect(x0, cy - 1, Math.max(0, pulse - x0), 2);

  const n = scene.stations.length;
  scene.stations.forEach((station, k) => {
    const x = mix(x0 + 70, x1 - 40, n === 1 ? 0.5 : k / (n - 1));
    const lit = clamp((pulse - x) / 40);
    const flash = lit > 0 ? Math.max(0, 1 - (pulse - x) / 260) : 0;
    stamp(f, f.glow.pass, x, cy, 44, shown * (0.25 * lit + 0.6 * flash));
    ctx.globalAlpha = shown;
    ctx.fillStyle = palette.ground;
    ctx.beginPath();
    ctx.arc(x, cy, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = lit > 0 ? palette.pass : palette.edge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (lit > 0) {
      ctx.globalAlpha = shown * lit;
      ctx.strokeStyle = palette.pass;
      ctx.beginPath();
      ctx.moveTo(x - 3, cy);
      ctx.lineTo(x - 0.8, cy + 2.4);
      ctx.lineTo(x + 3.2, cy - 2.6);
      ctx.stroke();
    }
    const above = k % 2 === 0;
    ctx.globalAlpha = shown * (0.55 + 0.45 * lit);
    ctx.font = `${PX}px ${palette.mono}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = above ? 'bottom' : 'top';
    ctx.fillStyle = lit > 0.5 ? palette.ink : palette.dim;
    ctx.fillText(station.label, x, above ? cy - 16 : cy + 16);
    ctx.textAlign = 'start';
  });

  /* The edit: a small diff card with a light behind it. */
  if (a > 0 && a < 1) {
    stamp(f, f.glow.indigo, pulse, cy, 70, shown * 0.8);
    ctx.globalAlpha = shown;
    ctx.beginPath();
    ctx.roundRect(pulse - 17, cy - 12, 34, 24, 5);
    ctx.fillStyle = palette.card;
    ctx.fill();
    ctx.strokeStyle = palette.indigo;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = palette.pass;
    ctx.fillRect(pulse - 10, cy - 6, 18, 2);
    ctx.fillStyle = palette.stop;
    ctx.fillRect(pulse - 10, cy - 1, 12, 2);
    ctx.fillStyle = palette.dim;
    ctx.fillRect(pulse - 10, cy + 4, 15, 2);
  }
}

/** Act four: every instruction file, hook and check at once, quiet, around the agent. */
function drawWhole(f: Frame, agent: { x: number; y: number }) {
  const { ctx, scene, w, h, p, time } = f;
  const a = smooth((p - 0.76) / 0.16);
  if (a <= 0) return;
  const cy = agent.y;
  const unit = Math.min(w * 0.42, h * 0.42);
  const reach = Math.min(w * 0.3, unit * 1.35);
  const r = Math.min(unit * 0.44, reach * 0.55);
  const left = { x: agent.x - reach, y: cy };
  const right = { x: agent.x + reach, y: cy };
  const ring = Math.min(unit * 0.2, 64);

  const place = (marks: readonly Mark[], centre: { x: number; y: number }, radius: number) =>
    marks.map((mark, i) => ({
      x: centre.x + mark.x * radius,
      y: centre.y + mark.y * radius,
      e: smooth(a * 1.8 - (i / Math.max(1, marks.length)) * 0.8),
      tone: mark.tone,
    }));
  const files = place(scene.finale.instructions, left, r);
  const checks = place(scene.finale.checks, right, r * 1.08);
  const hooks = place(scene.finale.hooks, agent, ring);

  ctx.lineWidth = 1;
  for (const group of [files, checks]) {
    ctx.strokeStyle = toneOf(f, group[0]?.tone ?? 'check');
    for (const m of group) {
      ctx.globalAlpha = m.e * 0.06;
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.lineTo(agent.x, agent.y);
      ctx.stroke();
    }
  }
  /* A few lights travel in: files to the agent, the agent out to its checks. */
  for (let k = 0; k < 10; k += 1) {
    const phase = (time / 3400 + k * 0.1) % 1;
    const from = files[(k * 5) % files.length];
    const to = checks[(k * 7) % checks.length];
    if (from) stamp(f, f.glow.amber, mix(from.x, agent.x, phase), mix(from.y, agent.y, phase), 12, a * Math.sin(Math.PI * phase) * 0.8);
    if (to) stamp(f, f.glow.pass, mix(agent.x, to.x, phase), mix(agent.y, to.y, phase), 12, a * Math.sin(Math.PI * phase) * 0.7);
  }

  stamp(f, f.glow.amber, left.x, left.y, r * 2.6, a * 0.22);
  stamp(f, f.glow.pass, right.x, right.y, r * 2.6, a * 0.16);
  for (const m of files) {
    if (m.e <= 0) continue;
    ctx.globalAlpha = m.e;
    ctx.fillStyle = toneOf(f, m.tone);
    ctx.beginPath();
    ctx.roundRect(m.x - 4.5, m.y - 3, 9, 6, 1.5);
    ctx.fill();
  }
  for (const m of checks) {
    if (m.e <= 0) continue;
    ctx.globalAlpha = m.e * 0.9;
    ctx.fillStyle = toneOf(f, m.tone);
    ctx.beginPath();
    ctx.arc(m.x, m.y, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }
  for (const m of hooks) {
    if (m.e <= 0) continue;
    ctx.globalAlpha = m.e;
    ctx.strokeStyle = toneOf(f, m.tone);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(m.x - 3.5, m.y - 3.5, 7, 7, 1.5);
    ctx.stroke();
  }
}

function drawHarness(f: Frame) {
  const { ctx, w, h, p } = f;
  ctx.clearRect(0, 0, w, h);
  const cy = h * 0.4;
  const side = Math.max(56, w * 0.13);
  const agent = {
    x: mix(mix(w / 2, side, inOut((p - 0.22) / 0.1)), w / 2, inOut((p - 0.74) / 0.1)),
    y: cy,
  };
  drawReading(f, agent);
  drawGate(f, agent);
  drawRails(f, agent);
  drawWhole(f, agent);
  drawAgent(f, agent.x, agent.y, clamp(p / 0.2));
  ctx.globalAlpha = 1;
}

/** Each caption holds its quarter, fading across the seams; the last one stays. */
function captionLight(act: number, p: number): number {
  const start = (act - 1) * 0.25;
  const fadeIn = act === 1 ? 1 : smooth((p - start + 0.02) / 0.06);
  const fadeOut = act === 4 ? 1 : 1 - smooth((p - start - 0.21) / 0.06);
  return Math.min(fadeIn, fadeOut);
}

/**
 * The page's second film, beside the map's: this repository's real harness. While the visitor
 * scrolls a tall block its stage stays pinned: the files an agent reads, the hooks that stop it,
 * the checks that verify it, then the whole at once. Without a script, under reduced motion or on a
 * narrow screen the four acts are one visible list and nothing is drawn, so the page never reflows.
 */
export function HarnessFilm() {
  const t = useTranslations('download.harnessFilm');
  const scene = useMemo(() => buildHarnessScene(FACTS), []);
  const block = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const captions = useRef<(HTMLLIElement | null)[]>([]);
  const [film, setFilm] = useState(false);

  useEffect(() => {
    if (typeof matchMedia !== 'function') return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    /* Below this the hook plates and check names cannot stand side by side, so the film rests. */
    const wide = matchMedia(`(min-width: ${FILM_MIN_WIDTH}px)`);
    let id = 0;
    const decide = () => {
      cancelAnimationFrame(id);
      const next = !reduced.matches && wide.matches && typeof IntersectionObserver !== 'undefined';
      id = requestAnimationFrame(() => setFilm(next));
    };
    decide();
    wide.addEventListener('change', decide);
    return () => {
      cancelAnimationFrame(id);
      wide.removeEventListener('change', decide);
    };
  }, []);

  useEffect(() => {
    const el = canvas.current;
    const host = stage.current;
    const ctx = el?.getContext('2d');
    if (!film || !el || !host || !ctx) return;
    const palette = readPalette();
    const glow: Glow = {
      indigo: glowSprite(palette.indigo),
      amber: glowSprite(palette.amber),
      pass: glowSprite(palette.pass),
      stop: glowSprite(palette.stop),
    };
    const measure = widthCache(ctx, palette.mono);
    const frame: Frame = {
      ctx,
      scene,
      palette,
      glow,
      measure,
      spots: [],
      farFirst: [],
      w: 0,
      h: 0,
      p: 0,
      time: 0,
    };

    const progress = () => {
      const outer = block.current;
      if (!outer) return 1;
      const rect = outer.getBoundingClientRect();
      const travel = outer.offsetHeight - host.offsetHeight;
      return travel > 0 ? clamp(-rect.top / travel) : 1;
    };
    const paint = () => {
      drawHarness(frame);
      captions.current.forEach((caption, i) => {
        if (!caption) return;
        const light = captionLight(i + 1, frame.p);
        caption.style.opacity = String(light);
        caption.style.transform = `translateY(${(1 - light) * 12}px)`;
        caption.style.visibility = light > 0.01 ? 'visible' : 'hidden';
      });
    };
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      frame.w = el.clientWidth;
      frame.h = el.clientHeight;
      el.width = Math.round(frame.w * dpr);
      el.height = Math.round(frame.h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      frame.spots = layoutReading(scene.files, measure, frame.w, frame.h);
      frame.farFirst = scene.files.map((_, i) => i).sort((a, b) => frame.spots[a]!.depth - frame.spots[b]!.depth);
      frame.p = progress();
      paint();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(el);
    resize();

    const unregister = registerGatedFrameClient(host, ({ t: now, dtMs }) => {
      frame.time = now;
      frame.p += (progress() - frame.p) * Math.min(1, dtMs / 110);
      paint();
    });
    // The page's pause stops the frame loop, so a paused film follows the visitor's own scroll
    // here instead: the acts still advance, the ambient light holds where it stopped.
    let pending = 0;
    const onScroll = () => {
      if (!isMotionPaused() || pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        frame.p = progress();
        paint();
      });
    };
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      observer.disconnect();
      unregister();
      window.removeEventListener('scroll', onScroll, { capture: true });
      cancelAnimationFrame(pending);
    };
  }, [film, scene]);

  const counts = scene.counts;

  return (
    <div
      ref={block}
      role="region"
      aria-labelledby="gateway-harness-title"
      data-testid="gateway-harness"
      data-gateway-harness={film ? 'playing' : 'still'}
      className={cn('relative mt-[var(--gateway-section-gap)] w-full', film && 'h-[300svh]')}
    >
      <h2 id="gateway-harness-title" className="sr-only">
        {t('label')}
      </h2>
      {film ? (
        <div ref={stage} className="sticky top-0 h-[100svh] w-full overflow-hidden">
          <canvas ref={canvas} aria-hidden className="absolute inset-0 h-full w-full" />
          <div aria-hidden className="gateway-film-vignette pointer-events-none absolute inset-0" />
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
                  {String(act).padStart(2, '0')} / 04
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
        </div>
      ) : (
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
