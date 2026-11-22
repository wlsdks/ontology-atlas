// Writes farm/farm.html in the preview folder: the farm scene, put off on 2026-11-22, on the current sheets.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { previewPath } from '../lib.mjs';

const here = new URL('.', import.meta.url), text = name => readFile(new URL(name, here), 'utf8');
const uri = async name => 'data:image/png;base64,' + (await readFile(previewPath('life', name))).toString('base64');
const sheets = `{ base: '${await uri('atlas-base.png')}', over: '${await uri('atlas-over.png')}', wardrobe: '${await uri('wardrobe.png')}' }`;
const parts = { __ATLAS__: (await readFile(previewPath('life/atlas.json'), 'utf8')).trim(), __SHEETS__: sheets, __RUNTIME__: (await text('behaviour-at-hold.js')).replace(/^export /gm, ''), __PAGE__: await text('page-farm.js') };
const html = (await text('farm-page.html')).replace(/__ATLAS__|__SHEETS__|__RUNTIME__|__PAGE__/g, key => parts[key]);
await mkdir(previewPath('farm'), { recursive: true });
await writeFile(previewPath('farm/farm.html'), html);
console.log('farm/farm.html', (html.length / 1024).toFixed(0) + ' KB');
