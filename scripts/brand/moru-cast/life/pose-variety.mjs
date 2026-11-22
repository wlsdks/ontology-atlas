// How many different poses does a floor of 20 show, and how big must a store of kept poses be to nearly always have the next one?
import { readFile } from 'node:fs/promises';
import { createWorld, addMoru, tick } from './behaviour.mjs';
import { previewPath } from '../lib.mjs';
const atlas = JSON.parse(await readFile(previewPath('life/atlas.json'), 'utf8')), n = 20, DT = 1000 / 12, W = 1920;
const world = createWorld({ atlas, width: W, lanes: 3, seed: 5, spots: [{ x: 1034, dir: 1, clip: 'climb', lane: 0 }] }), palettes = Object.keys(atlas.palettes);
for (let i = 0; i < n; i++) addMoru(world, { id: 'm' + i, x: 30 + (i + 0.5) * ((W - 190) / n) - 64, lane: i % 3, palette: palettes[i % palettes.length], wear: {}, room: i < 2 });
const seq = [], clipUse = {};
for (let t = 0; t < 300 * 12; t++) { tick(world, DT); for (const m of world.morus) if (m.changed || t === 0) { m.changed = false; const id = m.facing < 0 && atlas.clips[m.clip + '~left'] ? m.clip + '~left' : m.clip, pose = id + '|' + m.frame; seq.push([m.id, m.palette, pose]); clipUse[m.clip] = (clipUse[m.clip] ?? 0) + 1; } }
const lru = (keyOf, cap) => { const kept = new Map(); let miss = 0; for (const s of seq) { const k = keyOf(s); if (kept.has(k)) { const v = kept.get(k); kept.delete(k); kept.set(k, v); } else { miss++; kept.set(k, 1); if (kept.size > cap) kept.delete(kept.keys().next().value); } } return (100 * miss / seq.length).toFixed(1); };
console.log('pose changes', seq.length, 'per s', (seq.length / 300).toFixed(0), 'distinct poses', new Set(seq.map(s => s[2])).size, 'per palette+pose', new Set(seq.map(s => s[1] + s[2])).size, 'per moru+pose', new Set(seq.map(s => s[0] + s[2])).size);
for (const cap of [150, 300, 600, 1000, 1500, 2500]) console.log('cap', cap, 'miss% shared poses', lru(s => s[2], cap), 'by palette', lru(s => s[1] + s[2], cap), 'by moru', lru(s => s[0] + s[2], cap));
console.log(Object.entries(clipUse).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ':' + (100 * v / seq.length).toFixed(0)).join(' '));
