import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const SOURCE_ROOT = dirname(fileURLToPath(import.meta.url));

/** `import … from '…'`, `import '…'` and `export … from '…'`; a dynamic `import()` is not followed. */
const STATIC_IMPORT = /^(?:import|export)\s+(?:[^'";]*?\s+from\s+)?['"]([^'"\n]+)['"]/gm;

/** Every local module the server loads before it answers a request, as source-relative paths. */
function staticImportGraph(entry) {
  const seen = new Set();
  const queue = [entry];
  while (queue.length > 0) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, specifier] of readFileSync(file, 'utf8').matchAll(STATIC_IMPORT)) {
      if (specifier.startsWith('.')) queue.push(resolve(dirname(file), specifier));
    }
  }
  return [...seen].map((file) => relative(SOURCE_ROOT, file)).sort();
}

test('the server loads no TypeScript module at startup', () => {
  // Node strips types on demand, and the stripper it loads for one `.mts` import
  // costs every source-run server about 26 MB it never gives back. The analysis
  // archive is read through a dynamic import when one of its operations runs.
  const modules = staticImportGraph(resolve(SOURCE_ROOT, 'index.js'));
  assert.ok(modules.includes('tools/graph.mjs'), 'the walk must reach the tool modules');
  assert.ok(modules.length > 100, `the walk found only ${modules.length} modules`);
  assert.deepEqual(modules.filter((file) => file.endsWith('.mts') || file.endsWith('.ts')), []);
  assert.equal(modules.includes('analysis-records.mjs'), false);
});
