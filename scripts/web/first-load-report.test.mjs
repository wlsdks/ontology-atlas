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
