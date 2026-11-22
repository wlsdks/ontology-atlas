// Cast palettes: only the body fill and the belly tone change. Each tint is moved toward white or black until its
// luminance equals the original tone's (times `keep`), so every variant holds the original's contrast on any background.
import { HEX, RGB, STONE, IVORY } from './rig.mjs';
const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
export const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
const rgb = hex => [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16)), hex = c => c.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
function matched(tint, like, keep = 1) {
  const from = rgb(tint), goal = luminance(RGB[like]) * keep, toward = luminance(from) < goal ? 255 : 0; let lo = 0, hi = 1;
  for (let i = 0; i < 40; i++) { const t = (lo + hi) / 2, c = from.map(v => Math.round(v + (toward - v) * t)); if ((luminance(c) < goal) === (toward === 255)) lo = t; else hi = t; }
  return hex(from.map(v => Math.round(v + (toward - v) * (lo + hi) / 2)));
}
const TINTS = {
  horn: ['e2c48f', 'ffe9bf'], unicorn: ['d6c8f0', 'f6eaff'], dragon: ['b4e0c8', 'e6fae6'], rabbit: ['ecd2c6', 'fff0e6'],
  builder: ['c9c4b6', 'f6ead2', 0.93, 0.96], scholar: ['c4d0e0', 'eaf2ff'],
};
// The cast's one added hue, the mane and inner-ear pink, takes the next palette index.
HEX.push('f2b3c6'); RGB.push(rgb('f2b3c6'));
export const PALETTES = {};
for (const [name, [body, belly, keepBody = 1, keepBelly = 1]] of Object.entries(TINTS)) {
  const pair = [matched(body, STONE, keepBody), matched(belly, IVORY, keepBelly)];
  PALETTES[name] = { body: HEX.length, belly: HEX.length + 1, hex: pair }; HEX.push(...pair); RGB.push(...pair.map(rgb));
}
/** Which original tone a palette index stands for, so a recoloured pose is still recognised as the same drawing. */
export const ORIGINAL = HEX.map((_, i) => i); for (const p of Object.values(PALETTES)) { ORIGINAL[p.body] = STONE; ORIGINAL[p.belly] = IVORY; }
/** Recolours a drawn pose (body, belly and any costume part in those two tones) in place. */
export function tinted(drawn, name) { const p = PALETTES[name]; if (p) drawn.canvas = drawn.canvas.map(c => c === STONE ? p.body : c === IVORY ? p.belly : c); return drawn; }

// The shipped neutral carries two pixels of this tone at the tail's root; kept so the neutral is exact.
export const SOOT = HEX.length; HEX.push('555451'); RGB.push(rgb('555451'));
ORIGINAL[SOOT] = SOOT;
