// R17 — inferImports unit tests.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { inferImports } from './infer-imports.mjs';

function withRepo(setup) {
  const root = mkdtempSync(join(tmpdir(), 'omot-imports-'));
  setup(root);
  return root;
}

test('relative import resolved to file path', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'src/b'), { recursive: true });
    writeFileSync(
      join(r, 'src/a/index.ts'),
      'import { foo } from "../b/foo";\nexport const a = 1;\n',
    );
    writeFileSync(join(r, 'src/b/foo.ts'), 'export const foo = 2;\n');
  });
  try {
    const r = inferImports(root);
    const e = r.edges.find(
      (x) => x.from === 'src/a/index.ts' && x.to === 'src/b/foo.ts',
    );
    assert.ok(e, `expected edge a/index.ts → b/foo.ts, got: ${JSON.stringify(r.edges)}`);
    assert.equal(e.kind, 'static');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('external (npm) import classified separately', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(
      join(r, 'src/main.ts'),
      'import React from "react";\nimport { z } from "zod";\n',
    );
  });
  try {
    const r = inferImports(root);
    assert.equal(r.edges.length, 0);
    const specs = r.externalImports.map((x) => x.spec).sort();
    assert.deepEqual(specs, ['react', 'zod']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tsconfig path alias (@/) — resolves to src/ when target exists, else unresolved', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/lib'), { recursive: true });
    writeFileSync(join(r, 'src/lib/foo.ts'), 'export const foo = 1;');
    writeFileSync(
      join(r, 'src/main.ts'),
      'import { foo } from "@/lib/foo";\nimport { gone } from "@/missing";\n',
    );
  });
  try {
    const r = inferImports(root);
    // @/lib/foo → resolved to src/lib/foo.ts (internal edge)
    const e = r.edges.find((x) => x.to === 'src/lib/foo.ts');
    assert.ok(e, `expected alias-resolved edge to src/lib/foo.ts, got: ${JSON.stringify(r.edges)}`);
    // @/missing → unresolved with alias-not-found
    assert.ok(
      r.unresolved.some(
        (u) => u.spec === '@/missing' && u.reason === 'alias-not-found',
      ),
      `expected alias-not-found, got: ${JSON.stringify(r.unresolved)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dynamic import + require + reexport detected', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'src/b'), { recursive: true });
    writeFileSync(join(r, 'src/b/x.ts'), 'export const x = 1;');
    writeFileSync(
      join(r, 'src/a/index.ts'),
      [
        'const m = await import("../b/x");',
        'const r = require("../b/x");',
        'export { x } from "../b/x";',
      ].join('\n'),
    );
  });
  try {
    const r = inferImports(root);
    const toX = r.edges.filter((e) => e.to === 'src/b/x.ts');
    assert.deepEqual(
      toX.map((edge) => edge.kind).sort(),
      ['dynamic', 'reexport', 'require'],
    );
    const moduleEdge = r.moduleEdges.find(
      (edge) => edge.from === 'capabilities/a' && edge.to === 'capabilities/b',
    );
    assert.deepEqual(moduleEdge?.kindCounts, {
      dynamic: 1,
      reexport: 1,
      require: 1,
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (FSD features/ — capability folder slug, analyze 와 일관)', () => {
  // features/X · entities/X 는 capabilities/X 로 맞춘다. analyze_repo_structure
  // 후보와 같은 slug 라 bootstrap 의 add_relations endpoint 가 매치된다.
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/features/auth'), { recursive: true });
    mkdirSync(join(r, 'src/features/billing'), { recursive: true });
    writeFileSync(
      join(r, 'src/features/auth/index.ts'),
      'import { invoice } from "../billing/index";\nimport { token } from "../billing/token";\n',
    );
    writeFileSync(join(r, 'src/features/billing/index.ts'), 'export const invoice = 1;');
    writeFileSync(join(r, 'src/features/billing/token.ts'), 'export const token = 1;');
  });
  try {
    const r = inferImports(root);
    const e = r.moduleEdges.find(
      (x) => x.from === 'capabilities/auth' && x.to === 'capabilities/billing',
    );
    assert.ok(e, `expected module edge capabilities/auth → capabilities/billing, got: ${JSON.stringify(r.moduleEdges)}`);
    assert.equal(e.count, 2, '두 import 합산');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (single-file layered repo classifies support layers precisely)', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/features'), { recursive: true });
    mkdirSync(join(r, 'src/domain'), { recursive: true });
    mkdirSync(join(r, 'src/storage'), { recursive: true });
    writeFileSync(
      join(r, 'src/features/check-in.js'),
      [
        'import { normalizeHabit } from "../domain/habit.js";',
        'import { appendEntry } from "../storage/json-store.js";',
        'export const checkIn = () => appendEntry(normalizeHabit("write"));',
      ].join('\n'),
    );
    writeFileSync(
      join(r, 'src/domain/habit.js'),
      'export const normalizeHabit = (habit) => habit;\n',
    );
    writeFileSync(
      join(r, 'src/storage/json-store.js'),
      'export const appendEntry = (entry) => entry;\n',
    );
  });
  try {
    const r = inferImports(root);
    assert.ok(
      r.moduleEdges.some(
        (x) =>
          x.from === 'capabilities/check-in' &&
          x.to === 'elements/src/domain/habit',
      ),
      `expected feature → domain-model element edge, got: ${JSON.stringify(r.moduleEdges)}`,
    );
    assert.ok(
      r.moduleEdges.some(
        (x) =>
          x.from === 'capabilities/check-in' &&
          x.to === 'elements/src/storage/json-store',
      ),
      `expected feature → storage element edge, got: ${JSON.stringify(r.moduleEdges)}`,
    );
    assert.equal(
      r.moduleEdges.some((x) => x.to === 'capabilities/domain'),
      false,
      `did not expect folder-name capability noise: ${JSON.stringify(r.moduleEdges)}`,
    );
    assert.equal(
      r.moduleEdges.some((x) => x.to === 'domains/habit'),
      false,
      `did not expect implementation model as ontology domain: ${JSON.stringify(r.moduleEdges)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (FSD widgets/ — element folder slug, analyze 와 일관)', () => {
  // widgets/X · views/X 는 elements/src/... path-style 로 유지한다.
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/widgets/header'), { recursive: true });
    mkdirSync(join(r, 'src/widgets/footer'), { recursive: true });
    writeFileSync(
      join(r, 'src/widgets/header/index.ts'),
      'import { x } from "../footer";\nexport const h = x;\n',
    );
    writeFileSync(join(r, 'src/widgets/footer/index.ts'), 'export const x = 1;');
  });
  try {
    const r = inferImports(root);
    const e = r.moduleEdges.find(
      (x) => x.from === 'elements/src/widgets/header' && x.to === 'elements/src/widgets/footer',
    );
    assert.ok(e, `expected module edge elements/src/widgets/header → elements/src/widgets/footer, got: ${JSON.stringify(r.moduleEdges)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unresolved relative — 누락 파일 reason: relative-not-found', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src'), { recursive: true });
    writeFileSync(
      join(r, 'src/main.ts'),
      'import { gone } from "./missing";\n',
    );
  });
  try {
    const r = inferImports(root);
    assert.equal(r.edges.length, 0);
    assert.equal(r.unresolved[0]?.reason, 'relative-not-found');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('node_modules / dist / .next ignored', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'node_modules/foo'), { recursive: true });
    mkdirSync(join(r, 'dist'), { recursive: true });
    writeFileSync(join(r, 'src/a/index.ts'), 'export const a = 1;');
    writeFileSync(join(r, 'node_modules/foo/index.js'), 'should not be scanned');
    writeFileSync(join(r, 'dist/build.js'), 'also not scanned');
  });
  try {
    const r = inferImports(root);
    assert.equal(r.filesScanned, 1, 'node_modules / dist 안 의 파일 walk 안 됨');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('side-effect import (import "X") 감지', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'src/b'), { recursive: true });
    writeFileSync(join(r, 'src/b/setup.ts'), 'console.log("setup");');
    writeFileSync(join(r, 'src/a/main.ts'), 'import "../b/setup";\nexport const a = 1;\n');
  });
  try {
    const r = inferImports(root);
    const sideEdge = r.edges.find((e) => e.kind === 'side');
    assert.ok(
      sideEdge,
      `expected side import edge, got: ${JSON.stringify(r.edges)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('invalid infer options are rejected instead of coerced', () => {
  const root = withRepo(() => {});
  try {
    assert.throws(
      () => inferImports(`${root}\0`),
      /rootPath must not contain a null byte/,
    );
    assert.throws(
      () => inferImports(root, { sourceFolders: ['src', ' lib'] }),
      /sourceFolders items must not have leading or trailing whitespace/,
    );
    assert.throws(
      () => inferImports(root, { ignore: ['dist', 7] }),
      /ignore must be an array of strings/,
    );
    assert.throws(
      () => inferImports(root, { maxFiles: 0 }),
      /maxFiles must be a positive integer/,
    );
    assert.throws(
      () => inferImports(root, { maxFiles: 50001 }),
      /maxFiles must be <= 50000/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
