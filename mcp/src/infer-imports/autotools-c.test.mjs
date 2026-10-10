import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
import { withRepo } from './repo-fixture.mjs';

test('Autotools C repositories expose unsupported import-graph coverage instead of presenting zero edges as absence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(join(r, 'configure.ac'), 'AC_INIT([native-boundary], [1.0])\nAC_PROG_CC\n');
    writeFileSync(join(r, 'Makefile.am'), 'bin_PROGRAMS = native-boundary\nnative_boundary_SOURCES = src/main.c\n');
    writeFileSync(join(r, 'src', 'main.c'), '#include "engine.h"\nint main(void) { return run(); }\n');
    writeFileSync(join(r, 'src', 'engine.h'), 'int run(void);\n');
  });
  try {
    const result = inferImports(root);
    assert.equal(result.filesScanned, 0);
    assert.deepEqual(result.edges, []);
    assert.deepEqual(result.moduleEdges, []);
    assert.deepEqual(result.coverage.detectedUnsupportedLanguages, ['c']);
    assert.equal(result.coverage.allDetectedLanguagesSupported, false);
    assert.ok(
      result.coverage.limitations.some((row) =>
        row.includes('C include') && row.includes('zero edges')),
      JSON.stringify(result.coverage),
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Autotools metadata without a C or header source does not invent a detected C language', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(join(r, 'configure.ac'), 'AC_INIT([script-boundary], [1.0])\nAC_PROG_CC\n');
    writeFileSync(join(r, 'Makefile.am'), 'dist_bin_SCRIPTS = src/run.py\n');
    writeFileSync(join(r, 'src', 'run.py'), 'print("ok")\n');
  });
  try {
    const result = inferImports(root);
    assert.deepEqual(result.coverage.detectedUnsupportedLanguages, []);
    assert.equal(result.coverage.allDetectedLanguagesSupported, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
