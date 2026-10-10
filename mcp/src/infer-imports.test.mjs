import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inferImports } from './infer-imports.mjs';
import { withRepo } from './infer-imports/repo-fixture.mjs';

test('module edge evidence receipt is bounded and declares truncation', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/a'), { recursive: true });
    mkdirSync(join(r, 'src/b'), { recursive: true });
    for (let index = 0; index < 6; index += 1) {
      writeFileSync(join(r, 'src/b', `dep-${index}.ts`), `export const v${index} = ${index};\n`);
    }
    writeFileSync(
      join(r, 'src/a/index.ts'),
      Array.from({ length: 6 }, (_, index) =>
        `import { v${index} } from "../b/dep-${index}";`,
      ).join('\n'),
    );
  });
  try {
    const edge = inferImports(root).moduleEdges.find(
      (row) => row.from === 'capabilities/a' && row.to === 'capabilities/b',
    );
    assert.equal(edge?.count, 6);
    assert.equal(edge?.evidence.length, 5);
    assert.equal(edge?.evidenceLimited, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module edge qualifies product value evidence separately from test-only type evidence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'src/features/source'), { recursive: true });
    mkdirSync(join(r, 'src/features/target'), { recursive: true });
    writeFileSync(join(r, 'src/features/target/index.ts'), 'export const target = true;\nexport type Target = boolean;\n');
    writeFileSync(
      join(r, 'src/features/source/index.ts'),
      'import { target } from "../target/index";\nexport const source = target;\n',
    );
    writeFileSync(
      join(r, 'src/features/source/index.test.ts'),
      'import type { Target } from "../target/index";\nexport const fixture: Target = true;\n',
    );
  });
  try {
    const edge = inferImports(root).moduleEdges.find(
      (row) =>
        row.from === 'capabilities/source' &&
        row.to === 'capabilities/target',
    );

    assert.equal(edge?.count, 2, 'fixture must exercise both product and test evidence');
    assert.deepEqual(edge?.sourceRoleCounts, {
      production: 1,
      test: 1,
      unknown: 0,
    });
    assert.deepEqual(edge?.importUsageCounts, {
      value: 1,
      type_only: 1,
      unknown: 0,
    });
    assert.equal(edge?.productValueCount, 1);
    assert.deepEqual(edge?.evidence, [
      {
        from: 'src/features/source/index.ts',
        to: 'src/features/target/index.ts',
        kind: 'static',
        sourceRole: 'production',
        importUsage: 'value',
      },
      {
        from: 'src/features/source/index.test.ts',
        to: 'src/features/target/index.ts',
        kind: 'static',
        sourceRole: 'test',
        importUsage: 'type_only',
      },
    ]);
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
      () => inferImports(root, { sourceFolders: Array.from({ length: 51 }, (_, index) => `src-${index}`) }),
      /sourceFolders must contain at most 50 items/,
    );
    assert.throws(
      () => inferImports(root, { ignore: ['dist', 7] }),
      /ignore must be an array of strings/,
    );
    assert.throws(
      () => inferImports(root, { ignore: Array.from({ length: 201 }, (_, index) => `skip-${index}`) }),
      /ignore must contain at most 200 items/,
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

test('the default file budget scans exactly 5000 source files', () => {
  for (const count of [5000, 5001]) {
    const root = withRepo((r) => {
      mkdirSync(join(r, 'src'), { recursive: true });
      for (let index = 0; index < count; index += 1) {
        writeFileSync(join(r, 'src', `f${index}.ts`), 'export const a = 1;\n');
      }
    });
    try {
      assert.equal(inferImports(root).filesScanned, 5000, `${count} files on disk`);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  }
});
