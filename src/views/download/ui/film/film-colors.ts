import { clamp01 } from '../../lib/film/timeline/film-easing';

type Rgb = [number, number, number, number];

export function parseColor(color: string, probe?: CanvasRenderingContext2D | null): Rgb {
  let value = color.trim();
  if (probe) {
    probe.fillStyle = '#000';
    probe.fillStyle = value;
    value = String(probe.fillStyle);
  }
  const hex = value.match(/^#([0-9a-f]{6})$/i);
  if (hex) {
    const n = parseInt(hex[1]!, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgb = value.match(/rgba?\(([^)]+)\)/i);
  if (rgb) {
    const parts = rgb[1]!.split(/[ ,/]+/).filter(Boolean).map(Number);
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, parts[3] ?? 1];
  }
  return [0, 0, 0, 1];
}

const LEVELS = 48;
const mixCache = new Map<string, string[]>();

/** `a` mixed toward `b` by `t` (0 is `b`, 1 is `a`), opaque and quantised so a frame allocates nothing. */
export function mix(a: string, b: string, t: number): string {
  const level = Math.round(clamp01(t) * LEVELS);
  if (level >= LEVELS) return a;
  const key = `${a}|${b}`;
  let row = mixCache.get(key);
  if (!row) mixCache.set(key, (row = []));
  if (!row[level]) {
    const x = parseColor(a);
    const y = parseColor(b);
    const k = level / LEVELS;
    const c = (i: number) => Math.round(y[i]! + (x[i]! - y[i]!) * k);
    row[level] = `rgb(${c(0)}, ${c(1)}, ${c(2)})`;
  }
  return row[level]!;
}

export function rgba(color: string, alpha: number): string {
  const [r, g, b] = parseColor(color);
  return `rgba(${r}, ${g}, ${b}, ${Math.round(clamp01(alpha) * 1000) / 1000})`;
}
