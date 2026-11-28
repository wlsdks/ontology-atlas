import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { findJsonParseModules, firstLoadChunkPaths, main } from './first-load-report.mjs';

const html = `<html><head>
<link rel="preload" as="script" href="/_next/static/chunks/a.js?dpl=1"/>
<link rel="stylesheet" href="/_next/static/chunks/s.css"/>
<script src="/_next/static/chunks/a.js" async=""></script>
<script src="/_next/static/chunks/poly.js" nomodule=""></script>
<script src="/_next/static/chunks/b.js" async=""></script>
<script>self.__next_f.push([1,"inline.js"])</script>
</head></html>`;

test('names the scripts the page loads once each, without nomodule polyfills or styles', () => {
  assert.deepEqual(firstLoadChunkPaths(html), ['_next/static/chunks/a.js', '_next/static/chunks/b.js']);
});

test('finds JSON.parse literals over the limit, through escapes and both quote styles', () => {
  const big = `JSON.parse("${'x\\"y'.repeat(40)}")`;
  const small = `JSON.parse('{"a":1}')`;
  const found = findJsonParseModules(`e.exports=${big};f.exports=${small};`, 100);
  assert.equal(found.length, 1);
  assert.equal(found[0].bytes, 40 * 4 + 2);
  assert.deepEqual(findJsonParseModules(`x=JSON.parse(\`${'a'.repeat(200)}\`)`, 100).length, 1);
  assert.deepEqual(findJsonParseModules('JSON.parse("unterminated', 1), []);
});

test('fails only the routes that load a big JSON literal and are not allowed to', () => {
  const out = mkdtempSync(join(tmpdir(), 'first-load-'));
  mkdirSync(join(out, '_next/static/chunks'), { recursive: true });
  writeFileSync(join(out, '_next/static/chunks/data.js'), `e.exports=JSON.parse("${'z'.repeat(2048)}")`);
  writeFileSync(join(out, '_next/static/chunks/app.js'), 'console.log(1)');
  for (const [route, chunk] of [['en', 'app'], ['en/data', 'data']]) {
    mkdirSync(join(out, route), { recursive: true });
    writeFileSync(
      join(out, route, 'index.html'),
      `<script src="/_next/static/chunks/${chunk}.js" async=""></script>`,
    );
  }
  const log = () => {};
  const args = ['--json-limit-kb=1'];
  assert.equal(main([...args, out, 'en'], { log }), 0);
  assert.equal(main([...args, out, 'en', 'en/data'], { log }), 1);
  assert.equal(main([...args, '--allow-json=en/data', out, 'en', 'en/data'], { log }), 0);
  assert.throws(() => main([...args, out, 'en/missing'], { log }), /no exported page/);
});

test('refuses a page that names no chunks or a chunk that is not in the export', () => {
  const out = mkdtempSync(join(tmpdir(), 'first-load-'));
  mkdirSync(join(out, 'en'), { recursive: true });
  const log = () => {};
  writeFileSync(join(out, 'en/index.html'), '<html><body>no scripts</body></html>');
  assert.throws(() => main([out, 'en'], { log }), /names no script chunks/);
  writeFileSync(join(out, 'en/index.html'), '<script src="/_next/static/chunks/gone.js" async=""></script>');
  assert.throws(() => main([out, 'en'], { log }), /which is not under/);
});

test('reads a Vite page: module scripts and module preloads count, a stylesheet does not', () => {
  const page = `<link rel="modulepreload" crossorigin href="/assets/vendor-a1.js"><link rel="stylesheet" href="/assets/app-b2.css">
<script type="module" crossorigin src="/assets/index-c3.js"></script>`;
  assert.deepEqual(firstLoadChunkPaths(page), ['assets/vendor-a1.js', 'assets/index-c3.js']);
});

test('the app screen is the entry plus its route module, and a chunk loaded later is not first load', () => {
  const app = mkdtempSync(join(tmpdir(), 'first-load-app-'));
  mkdirSync(join(app, 'assets'), { recursive: true });
  const bytes = { 'entry.js': 'e()', 'shared.js': 's()', 'map.js': 'm()', 'later.js': `JSON.parse("${'z'.repeat(2048)}")` };
  for (const [name, text] of Object.entries(bytes)) writeFileSync(join(app, 'assets', name), text);
  const manifestPath = join(app, 'manifest.json');
  const mapKey = 'src/app/routes/$locale/_app/topology.tsx?tsr-split=component';
  const manifest = {
    'index.html': { file: 'assets/entry.js', isEntry: true, imports: ['shared'] },
    shared: { file: 'assets/shared.js' },
    [mapKey]: { file: 'assets/map.js', imports: ['shared'], dynamicImports: ['later'] },
    later: { file: 'assets/later.js' },
  };
  writeFileSync(manifestPath, JSON.stringify(manifest));
  const lines = [];
  const log = (line) => lines.push(line);
  const route = '--app-route=src/app/routes/$locale/_app/topology';
  const args = ['--json-limit-kb=1', `--manifest=${manifestPath}`, route, app];
  assert.equal(main(args, { log }), 0, 'the JSON literal sits in a chunk the map loads later');
  assert.match(lines[0], /3 chunks/);

  manifest[mapKey].imports.push('later');
  writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.equal(main(args, { log }), 1, 'the same literal, imported statically, is first load');

  assert.equal(main(['--max-brotli-kb=0.001', `--manifest=${manifestPath}`, route, app], { log }), 1, 'over the brotli budget');
  assert.throws(() => main([`--manifest=${manifestPath}`, '--app-route=src/app/routes/nowhere', app], { log }), /holds no chunk of/);
});
