import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
import { withRepo } from './repo-fixture.mjs';

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
    const e = r.edges.find((x) => x.to === 'src/lib/foo.ts');
    assert.ok(e, `expected alias-resolved edge to src/lib/foo.ts, got: ${JSON.stringify(r.edges)}`);
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

test('tsconfig paths aliases are resolved before fallback @/ guesses', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'app/page'), { recursive: true });
    mkdirSync(join(r, 'src/app/providers'), { recursive: true });
    mkdirSync(join(r, 'messages'), { recursive: true });
    writeFileSync(
      join(r, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            paths: {
              '@/*': ['./*'],
              '@/app-providers/*': ['./src/app/*'],
            },
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(r, 'app/page/index.ts'),
      [
        'import { Provider } from "@/app-providers/providers";',
        'import ko from "@/messages/ko.json";',
      ].join('\n'),
    );
    writeFileSync(join(r, 'src/app/providers/index.ts'), 'export const Provider = 1;');
    writeFileSync(join(r, 'messages/ko.json'), '{"hello":"안녕"}');
  });
  try {
    const r = inferImports(root);
    assert.ok(
      r.edges.some(
        (edge) =>
          edge.from === 'app/page/index.ts' &&
          edge.to === 'src/app/providers/index.ts',
      ),
      `expected tsconfig alias edge to src/app/providers/index.ts, got: ${JSON.stringify(r.edges)}`,
    );
    assert.ok(
      r.edges.some(
        (edge) =>
          edge.from === 'app/page/index.ts' &&
          edge.to === 'messages/ko.json',
      ),
      `expected root alias edge to messages/ko.json, got: ${JSON.stringify(r.edges)}`,
    );
    assert.deepEqual(r.unresolved, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('tsconfig paths resolve non-@ aliases before classifying npm imports', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/shared'), { recursive: true });
    mkdirSync(join(r, 'src/features/search'), { recursive: true });
    writeFileSync(
      join(r, 'tsconfig.json'),
      JSON.stringify(
        {
          compilerOptions: {
            paths: {
              '#shared/*': ['./src/shared/*'],
            },
          },
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(r, 'src/features/search/index.ts'),
      [
        'import { normalize } from "#shared/normalize";',
        'import { missing } from "#shared/missing";',
        'import scoped from "@scope/pkg";',
      ].join('\n'),
    );
    writeFileSync(join(r, 'src/shared/normalize.ts'), 'export const normalize = 1;');
  });
  try {
    const r = inferImports(root);
    assert.ok(
      r.edges.some(
        (edge) =>
          edge.from === 'src/features/search/index.ts' &&
          edge.to === 'src/shared/normalize.ts',
      ),
      `expected #shared alias edge, got: ${JSON.stringify(r.edges)}`,
    );
    assert.ok(
      r.unresolved.some(
        (entry) => entry.spec === '#shared/missing' && entry.reason === 'alias-not-found',
      ),
      `expected missing #shared alias to stay unresolved, got: ${JSON.stringify(r.unresolved)}`,
    );
    assert.ok(
      r.externalImports.some((entry) => entry.spec === '@scope/pkg'),
      `expected unmatched scoped package to stay external, got: ${JSON.stringify(r.externalImports)}`,
    );
    assert.equal(
      r.externalImports.some((entry) => entry.spec === '#shared/missing'),
      false,
      `did not expect unresolved alias as external import: ${JSON.stringify(r.externalImports)}`,
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
    assert.deepEqual(moduleEdge?.evidence, [
      { from: 'src/a/index.ts', to: 'src/b/x.ts', kind: 'dynamic', sourceRole: 'production', importUsage: 'value' },
      { from: 'src/a/index.ts', to: 'src/b/x.ts', kind: 'reexport', sourceRole: 'production', importUsage: 'value' },
      { from: 'src/a/index.ts', to: 'src/b/x.ts', kind: 'require', sourceRole: 'production', importUsage: 'value' },
    ]);
    assert.equal(moduleEdge?.evidenceLimited, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('unresolved relative import of a missing file has reason relative-not-found', () => {
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

test('TypeScript NodeNext — .js specifier resolves to .ts source', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/features/a'), { recursive: true });
    mkdirSync(join(r, 'src/features/b'), { recursive: true });
    writeFileSync(join(r, 'src/features/a/index.ts'), "import '../b/index.js';\n");
    writeFileSync(join(r, 'src/features/b/index.ts'), 'export const b = 1;\n');
  });
  try {
    const r = inferImports(root);
    assert.equal(r.unresolved.length, 0);
    assert.equal(r.edges[0]?.to, 'src/features/b/index.ts');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('detects a side-effect import (import "X")', () => {
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
