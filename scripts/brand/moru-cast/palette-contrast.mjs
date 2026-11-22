// Contrast of every cast palette against the dark and light backgrounds and the outline, beside the original's.
import { writeFile } from 'node:fs/promises';
import { RGB, STONE, IVORY, INK } from './rig.mjs';
import { PALETTES, contrast } from './palette.mjs';
import { previewPath } from './lib.mjs';
const grounds = { 'app canvas #0b0b0a': [0x0b, 0x0b, 0x0a], 'preview dark #171a24': [0x17, 0x1a, 0x24], 'light #f4f1ea': [0xf4, 0xf1, 0xea], 'outline #17192d': RGB[INK] };
const row = (body, belly) => ({ ...Object.fromEntries(Object.entries(grounds).flatMap(([k, g]) => [[`body / ${k}`, +contrast(RGB[body], g).toFixed(2)], [`belly / ${k}`, +contrast(RGB[belly], g).toFixed(2)]])), 'body / belly': +contrast(RGB[body], RGB[belly]).toFixed(2) });
const table = { original: { hex: ['d6d3c9', 'fff1d7'], ...row(STONE, IVORY) }, ...Object.fromEntries(Object.entries(PALETTES).map(([n, p]) => [n, { hex: p.hex, ...row(p.body, p.belly) }])) };
table['outline / light #f4f1ea'] = +contrast(RGB[INK], grounds['light #f4f1ea']).toFixed(2);
await writeFile(previewPath('palette-contrast.json'), JSON.stringify(table, null, 1));
for (const [n, r] of Object.entries(table)) if (r.hex) console.log(n.padEnd(9), r.hex.join(' '), 'body: canvas', r['body / app canvas #0b0b0a'], 'light', r['body / light #f4f1ea'], 'outline', r['body / outline #17192d'], '| belly: canvas', r['belly / app canvas #0b0b0a'], 'light', r['belly / light #f4f1ea'], '| body/belly', r['body / belly']);
console.log('outline on light', table['outline / light #f4f1ea']);
