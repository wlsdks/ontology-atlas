// Writes life/index.html in the preview folder: one self-contained page (sheets inline, runtime inline) that opens from disk.
import { copyFile, readFile, writeFile } from 'node:fs/promises';
import { previewPath } from '../lib.mjs';
const here = new URL('.', import.meta.url), text = async n => readFile(new URL(n, here), 'utf8'), built = async n => readFile(previewPath('life', n), 'utf8'), uri = async n => 'data:image/png;base64,' + (await readFile(previewPath('life', n))).toString('base64');
const behaviour = (await text('behaviour.mjs')).replace(/^export /gm, '');
const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Moru life</title>
<style>
  html, body { margin: 0; height: 100%; background: #0b0b0a; color: #d6d3c9; font: 13px/1.5 ui-sans-serif, system-ui, sans-serif; overflow: hidden; }
  #view { position: absolute; left: 0; bottom: 0; display: block; }
  #hud { position: absolute; left: 24px; top: 20px; font: 12px/1.6 ui-monospace, Menlo, monospace; color: #99968f; white-space: pre; }
</style></head>
<body><div id="hud"></div><canvas id="view"></canvas>
<script type="module">
const ATLAS = ${await built('atlas.json')};
const SHEETS = { base: '${await uri('atlas-base.png')}', over: '${await uri('atlas-over.png')}', wardrobe: '${await uri('wardrobe.png')}' };
${behaviour}
${await text('page.js')}
</script></body></html>`;
await writeFile(previewPath('life/index.html'), html);
// The browser's own cost of one kind of drawing, beside the page, for `browser/cpu.mjs`.
await copyFile(new URL('browser/floor.html', here), previewPath('life/floor.html'));
console.log('index.html', (html.length / 1024).toFixed(0) + ' KB');
