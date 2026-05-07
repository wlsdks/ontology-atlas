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
    assert.ok(toX.length >= 1, `expected edges to b/x.ts, got: ${JSON.stringify(r.edges)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (FSD features/ — bucket 접두 stripped, analyze 와 일관)', () => {
  // R+ — cycle 35: features/X · entities/X 는 inner 이름만 slug.
  // analyze_repo_structure 가 capability 후보 slug 을 같은 식으로 만들어
  // bootstrap 의 add_relations 가 endpoint 매치 가능.
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
      (x) => x.from === 'auth' && x.to === 'billing',
    );
    assert.ok(e, `expected module edge auth → billing, got: ${JSON.stringify(r.moduleEdges)}`);
    assert.equal(e.count, 2, '두 import 합산');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (FSD widgets/ — path-style 유지, element slug 와 일관)', () => {
  // R+ — cycle 35: widgets/X · views/X 는 path-style 유지 (analyze 가 element
  // 후보 slug 으로 같은 식 — relative path).
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
      (x) => x.from === 'widgets/header' && x.to === 'widgets/footer',
    );
    assert.ok(e, `expected module edge widgets/header → widgets/footer, got: ${JSON.stringify(r.moduleEdges)}`);
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
