import { hash01 } from "./cosmos-morphology";

export interface CosmosBody {
  id: string;
  radius: number;
}

export interface CosmosLink {
  a: number;
  b: number;
  weight: number;
}

export interface SettleTuning {
  fill: number;
  gravity: number;
  contact: number;
  spring: number;
  charge: number;
}

const DEFAULT_SETTLE_TUNING: SettleTuning = { fill: 0.4, gravity: 0.03, contact: 0.32, spring: 0.016, charge: 0.35 };

export interface SettleOptions {
  coreRadius: number;
  iterations?: number;
  keyframeEvery?: number;
  tuning?: Partial<SettleTuning>;
}

export interface SettleResult {
  x: Float64Array;
  y: Float64Array;
  keyframes: Float32Array[];
  iterations: number;
  targetRadius: number;
}

const SOFTEN = 0.5;

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function voidGap(ra: number, rb: number, meanRadius: number): number {
  return 0.45 * Math.min(ra, rb) + 0.35 * meanRadius;
}

export function settleGalaxies(bodies: readonly CosmosBody[], links: readonly CosmosLink[], options: SettleOptions): SettleResult {
  const n = bodies.length;
  const { fill: FILL, gravity: GRAVITY, contact: CONTACT, spring: SPRING, charge: CHARGE } = { ...DEFAULT_SETTLE_TUNING, ...options.tuning };
  const iterations = options.iterations ?? 600;
  const keyframeEvery = options.keyframeEvery ?? 15;
  const x = new Float64Array(n);
  const y = new Float64Array(n);
  const keyframes: Float32Array[] = [];
  if (n === 0) return { x, y, keyframes, iterations: 0, targetRadius: options.coreRadius };

  const radius = bodies.map((b) => b.radius);
  const meanRadius = radius.reduce((s, r) => s + r, 0) / n;
  const maxRadius = Math.max(...radius);
  const coreRadius = options.coreRadius;
  let area = Math.PI * (coreRadius + 0.5 * voidGap(coreRadius, meanRadius, meanRadius)) ** 2;
  for (const r of radius) area += Math.PI * (r + 0.5 * voidGap(r, meanRadius, meanRadius)) ** 2;
  const targetRadius = Math.sqrt(area / (Math.PI * FILL));
  const charge = radius.reduce((s, r) => s + r, 0);
  const repulsion = (CHARGE * GRAVITY * targetRadius * targetRadius) / (charge * meanRadius);

  for (let i = 0; i < n; i += 1) {
    const id = bodies[i]!.id;
    const angle = hash01(id, "orbit-angle") * Math.PI * 2;
    const bias = 1.12 - 0.32 * (radius[i]! / maxRadius);
    const r = targetRadius * (0.42 + 0.58 * Math.sqrt(hash01(id, "orbit-radius"))) * bias;
    x[i] = Math.cos(angle) * r;
    y[i] = Math.sin(angle) * r;
  }

  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  const snapshot = () => {
    const frame = new Float32Array(n * 2);
    for (let i = 0; i < n; i += 1) {
      frame[i * 2] = x[i]!;
      frame[i * 2 + 1] = y[i]!;
    }
    keyframes.push(frame);
  };
  snapshot();

  for (let it = 0; it < iterations; it += 1) {
    const progress = it / Math.max(1, iterations - 1);
    const contactWeight = smoothstep(0.18, 0.5, progress);
    const step = 1 - 0.96 * progress ** 1.4;
    const maxMove = meanRadius * (0.6 * (1 - progress) + 0.01);
    fx.fill(0);
    fy.fill(0);

    for (let i = 0; i < n; i += 1) {
      const ri = radius[i]!;
      for (let j = i + 1; j < n; j += 1) {
        const rj = radius[j]!;
        let dx = x[i]! - x[j]!;
        let dy = y[i]! - y[j]!;
        let d2 = dx * dx + dy * dy;
        if (d2 < 1e-9) {
          const a = hash01(`${bodies[i]!.id}|${bodies[j]!.id}`, "part") * Math.PI * 2;
          dx = Math.cos(a) * 1e-3;
          dy = Math.sin(a) * 1e-3;
          d2 = dx * dx + dy * dy;
        }
        const d = Math.sqrt(d2);
        let f = (repulsion * ri * rj) / (d2 + SOFTEN * meanRadius * meanRadius) ;
        const s = ri + rj + voidGap(ri, rj, meanRadius);
        if (d < s) f += (CONTACT * contactWeight * (s - d)) / d;
        fx[i] += dx * f;
        fy[i] += dy * f;
        fx[j] -= dx * f;
        fy[j] -= dy * f;
      }
    }

    for (const link of links) {
      const ra = radius[link.a]!;
      const rb = radius[link.b]!;
      const dx = x[link.b]! - x[link.a]!;
      const dy = y[link.b]! - y[link.a]!;
      const d = Math.sqrt(dx * dx + dy * dy);
      const rest = ra + rb + voidGap(ra, rb, meanRadius) * 1.05;
      if (d <= rest) continue;
      const f = (SPRING * link.weight * (d - rest)) / d;
      fx[link.a] += dx * f;
      fy[link.a] += dy * f;
      fx[link.b] -= dx * f;
      fy[link.b] -= dy * f;
    }

    for (let i = 0; i < n; i += 1) {
      const ri = radius[i]!;
      const d = Math.sqrt(x[i]! * x[i]! + y[i]! * y[i]!);
      const pull = GRAVITY * (0.6 + 0.4 * (ri / meanRadius));
      fx[i] -= x[i]! * pull;
      fy[i] -= y[i]! * pull;
      const s = ri + coreRadius + voidGap(ri, coreRadius, meanRadius);
      if (d < s) {
        const ux = d > 1e-6 ? x[i]! / d : Math.cos(hash01(bodies[i]!.id, "core-part") * Math.PI * 2);
        const uy = d > 1e-6 ? y[i]! / d : Math.sin(hash01(bodies[i]!.id, "core-part") * Math.PI * 2);
        const push = CONTACT * Math.max(contactWeight, 0.35) * (s - d) * 2;
        fx[i] += ux * push;
        fy[i] += uy * push;
      }
    }

    for (let i = 0; i < n; i += 1) {
      let mx = fx[i]! * step;
      let my = fy[i]! * step;
      const m = Math.sqrt(mx * mx + my * my);
      if (m > maxMove) {
        mx *= maxMove / m;
        my *= maxMove / m;
      }
      x[i] += mx;
      y[i] += my;
    }
    if ((it + 1) % keyframeEvery === 0) snapshot();
  }

  separateGalaxies(x, y, radius, coreRadius, meanRadius);
  snapshot();

  return { x, y, keyframes, iterations, targetRadius };
}

function separateGalaxies(
  x: Float64Array,
  y: Float64Array,
  radius: readonly number[],
  coreRadius: number,
  meanRadius: number,
  fixed?: Uint8Array,
): void {
  const n = x.length;
  const floor = 0.82;
  for (let pass = 0; pass < 60; pass += 1) {
    let moved = 0;
    for (let i = 0; i < n; i += 1) {
      const ri = radius[i]!;
      for (let j = i + 1; j < n; j += 1) {
        const rj = radius[j]!;
        const dx = x[j]! - x[i]!;
        const dy = y[j]! - y[i]!;
        const s = ri + rj + voidGap(ri, rj, meanRadius) * floor;
        const d2 = dx * dx + dy * dy;
        if (d2 >= s * s) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const push = (s - d) / d;
        const pi = fixed?.[i] ?? 0;
        const pj = fixed?.[j] ?? 0;
        const wi = pi && !pj ? 0 : pj && !pi ? 1 : rj / (ri + rj);
        x[i] -= dx * push * wi;
        y[i] -= dy * push * wi;
        x[j] += dx * push * (1 - wi);
        y[j] += dy * push * (1 - wi);
        moved += 1;
      }
      const d = Math.sqrt(x[i]! * x[i]! + y[i]! * y[i]!);
      const s = ri + coreRadius + voidGap(ri, coreRadius, meanRadius) * floor;
      if (d < s && d > 1e-6) {
        x[i] *= s / d;
        y[i] *= s / d;
        moved += 1;
      }
    }
    if (moved === 0) break;
  }
}

export function relaxGalaxies(
  startX: Float64Array,
  startY: Float64Array,
  bodies: readonly CosmosBody[],
  links: readonly CosmosLink[],
  options: SettleOptions & {
    fixed?: Uint8Array;
  },
): { x: Float64Array; y: Float64Array; frames: Float32Array[] } {
  const n = bodies.length;
  const x = Float64Array.from(startX);
  const y = Float64Array.from(startY);
  const frames: Float32Array[] = [];
  if (n === 0) return { x, y, frames };
  const { gravity: GRAVITY, contact: CONTACT, spring: SPRING, charge: CHARGE, fill: FILL } = { ...DEFAULT_SETTLE_TUNING, ...options.tuning };
  const radius = bodies.map((b) => b.radius);
  const meanRadius = radius.reduce((s, r) => s + r, 0) / n;
  const coreRadius = options.coreRadius;
  let area = Math.PI * (coreRadius + 0.5 * voidGap(coreRadius, meanRadius, meanRadius)) ** 2;
  for (const r of radius) area += Math.PI * (r + 0.5 * voidGap(r, meanRadius, meanRadius)) ** 2;
  const targetRadius = Math.sqrt(area / (Math.PI * FILL));
  const charge = radius.reduce((s, r) => s + r, 0);
  const repulsion = (CHARGE * GRAVITY * targetRadius * targetRadius) / (charge * meanRadius);
  const iterations = 160;
  const fx = new Float64Array(n);
  const fy = new Float64Array(n);
  for (let it = 0; it < iterations; it += 1) {
    const progress = it / (iterations - 1);
    const step = 0.35 * (1 - 0.94 * progress);
    const maxMove = meanRadius * 0.03;
    fx.fill(0);
    fy.fill(0);
    for (let i = 0; i < n; i += 1) {
      const ri = radius[i]!;
      for (let j = i + 1; j < n; j += 1) {
        const rj = radius[j]!;
        const dx = x[i]! - x[j]!;
        const dy = y[i]! - y[j]!;
        const d2 = dx * dx + dy * dy + 1e-9;
        const d = Math.sqrt(d2);
        let f = (repulsion * ri * rj) / (d2 + SOFTEN * meanRadius * meanRadius);
        const s = ri + rj + voidGap(ri, rj, meanRadius);
        if (d < s) f += (CONTACT * (s - d)) / d;
        fx[i] += dx * f;
        fy[i] += dy * f;
        fx[j] -= dx * f;
        fy[j] -= dy * f;
      }
    }
    for (const link of links) {
      const ra = radius[link.a]!;
      const rb = radius[link.b]!;
      const dx = x[link.b]! - x[link.a]!;
      const dy = y[link.b]! - y[link.a]!;
      const d = Math.sqrt(dx * dx + dy * dy);
      const rest = ra + rb + voidGap(ra, rb, meanRadius) * 1.05;
      if (d <= rest) continue;
      const f = (SPRING * link.weight * (d - rest)) / d;
      fx[link.a] += dx * f;
      fy[link.a] += dy * f;
      fx[link.b] -= dx * f;
      fy[link.b] -= dy * f;
    }
    for (let i = 0; i < n; i += 1) {
      const ri = radius[i]!;
      const pull = GRAVITY * (0.6 + 0.4 * (ri / meanRadius));
      fx[i] -= x[i]! * pull;
      fy[i] -= y[i]! * pull;
      const d = Math.sqrt(x[i]! * x[i]! + y[i]! * y[i]!);
      const s = ri + coreRadius + voidGap(ri, coreRadius, meanRadius);
      if (d < s && d > 1e-6) {
        fx[i] += (x[i]! / d) * CONTACT * (s - d) * 2;
        fy[i] += (y[i]! / d) * CONTACT * (s - d) * 2;
      }
    }
    for (let i = 0; i < n; i += 1) {
      if (options.fixed?.[i]) continue;
      let mx = fx[i]! * step;
      let my = fy[i]! * step;
      const m = Math.sqrt(mx * mx + my * my);
      if (m > maxMove) {
        mx *= maxMove / m;
        my *= maxMove / m;
      }
      x[i] += mx;
      y[i] += my;
    }
    if ((it + 1) % 20 === 0) {
      const frame = new Float32Array(n * 2);
      for (let i = 0; i < n; i += 1) {
        frame[i * 2] = x[i]!;
        frame[i * 2 + 1] = y[i]!;
      }
      frames.push(frame);
    }
  }
  separateGalaxies(x, y, radius, coreRadius, meanRadius, options.fixed);
  const last = new Float32Array(n * 2);
  for (let i = 0; i < n; i += 1) {
    last[i * 2] = x[i]!;
    last[i * 2 + 1] = y[i]!;
  }
  frames.push(last);
  return { x, y, frames };
}

export function relaxDiscs(
  ux: Float64Array,
  uy: Float64Array,
  anchorX: Float64Array,
  anchorY: Float64Array,
  radius: Float64Array,
  pad: number,
  iterations = 60,
): void {
  const n = ux.length;
  for (let it = 0; it < iterations; it += 1) {
    const cool = 1 - 0.8 * (it / Math.max(1, iterations - 1));
    for (let i = 0; i < n; i += 1) {
      for (let j = i + 1; j < n; j += 1) {
        const dx = ux[j]! - ux[i]!;
        const dy = uy[j]! - uy[i]!;
        const s = radius[i]! + radius[j]! + pad;
        const d2 = dx * dx + dy * dy;
        if (d2 >= s * s) continue;
        const d = Math.sqrt(d2) || 1e-6;
        const push = ((s - d) / d) * 0.5 * cool;
        const wi = radius[j]! / (radius[i]! + radius[j]!);
        const wj = 1 - wi;
        ux[i] -= dx * push * wi;
        uy[i] -= dy * push * wi;
        ux[j] += dx * push * wj;
        uy[j] += dy * push * wj;
      }
    }
    for (let i = 0; i < n; i += 1) {
      ux[i] += (anchorX[i]! - ux[i]!) * 0.06 * cool;
      uy[i] += (anchorY[i]! - uy[i]!) * 0.06 * cool;
    }
  }
}

export function separatePoints(px: Float64Array, py: Float64Array, minSpacing: number, passes = 3): void {
  const n = px.length;
  if (n < 2) return;
  const cell = minSpacing;
  for (let pass = 0; pass < passes; pass += 1) {
    const grid = new Map<number, number[]>();
    const key = (cx: number, cy: number) => cx * 73856093 + cy * 19349663;
    for (let i = 0; i < n; i += 1) {
      const k = key(Math.floor(px[i]! / cell), Math.floor(py[i]! / cell));
      const list = grid.get(k);
      if (list) list.push(i);
      else grid.set(k, [i]);
    }
    for (let i = 0; i < n; i += 1) {
      const cx = Math.floor(px[i]! / cell);
      const cy = Math.floor(py[i]! / cell);
      for (let ox = -1; ox <= 1; ox += 1) {
        for (let oy = -1; oy <= 1; oy += 1) {
          const list = grid.get(key(cx + ox, cy + oy));
          if (!list) continue;
          for (const j of list) {
            if (j <= i) continue;
            const dx = px[j]! - px[i]!;
            const dy = py[j]! - py[i]!;
            const d2 = dx * dx + dy * dy;
            if (d2 >= minSpacing * minSpacing) continue;
            const d = Math.sqrt(d2);
            const a = d > 1e-9 ? 0 : hash01(String(i * 7919 + j), "split") * Math.PI * 2;
            const nx = d > 1e-9 ? dx / d : Math.cos(a);
            const ny = d > 1e-9 ? dy / d : Math.sin(a);
            const push = (minSpacing - d) * 0.5;
            px[i] -= nx * push;
            py[i] -= ny * push;
            px[j] += nx * push;
            py[j] += ny * push;
          }
        }
      }
    }
  }
}
