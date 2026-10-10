import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
import { withRepo } from './repo-fixture.mjs';

test('root Go module reports exact local package imports as a separate typed receipt', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    mkdirSync(join(r, 'cmd', 'runner'), { recursive: true });
    mkdirSync(join(r, 'internal', 'state'), { recursive: true });
    writeFileSync(
      join(r, 'cmd', 'runner', 'main.go'),
      [
        'package runner',
        '',
        'import "example.test/atlas/internal/state"',
        '',
        'var _ = state.Ready',
      ].join('\n'),
    );
    writeFileSync(join(r, 'internal', 'state', 'state.go'), 'package state\n\nconst Ready = true\n');
  });
  try {
    const result = inferImports(root);

    assert.deepEqual(result.edges, [], 'Go package evidence must not enter legacy file edges');
    assert.equal(result.coverage.supportedLanguages.includes('go'), true);
    assert.equal(result.coverage.supportedExtensions.includes('.go'), true);
    assert.deepEqual(result.packageImportEvidence, {
      contract: 'goPackageImports:v1',
      modulePath: 'example.test/atlas',
      sourceQualification: 'observed_bounded_go_package_imports_not_runtime_or_semantic_impact',
      writeAllowed: false,
      filesScanned: 2,
      fileScanLimited: false,
      perFileByteLimit: 262144,
      perFileImportLimit: 256,
      skipped: [],
      limitations: [
        'External Go modules are not included in local package import evidence.',
        'Nested Go modules and go.work workspaces are not scanned.',
        'Observed imports are bounded static source evidence, not runtime execution or semantic depends_on approval.',
      ],
      packageImports: [
        {
          fromFile: 'cmd/runner/main.go',
          fromPackage: 'cmd/runner',
          toPackage: 'internal/state',
          importSpec: 'example.test/atlas/internal/state',
          kind: 'static',
          sourceRole: 'production',
          importUsage: 'value',
        },
      ],
      moduleEdges: [
        {
          fromPackage: 'cmd/runner',
          toPackage: 'internal/state',
          count: 1,
          kindCounts: { static: 1 },
          sourceRoleCounts: { production: 1, test: 0, unknown: 0 },
          importUsageCounts: { value: 1, type_only: 0, unknown: 0 },
          productValueCount: 1,
          evidence: [
            {
              fromFile: 'cmd/runner/main.go',
              fromPackage: 'cmd/runner',
              toPackage: 'internal/state',
              importSpec: 'example.test/atlas/internal/state',
              kind: 'static',
              sourceRole: 'production',
              importUsage: 'value',
            },
          ],
          evidenceLimited: false,
        },
      ],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('root Go scan excludes nested modules from its bounded local package receipt', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    mkdirSync(join(r, 'app'), { recursive: true });
    mkdirSync(join(r, 'lib'), { recursive: true });
    mkdirSync(join(r, 'nested'), { recursive: true });
    writeFileSync(join(r, 'app', 'main.go'), 'package app\n\nimport "example.test/atlas/lib"\n\nvar _ = lib.Ready\n');
    writeFileSync(join(r, 'lib', 'lib.go'), 'package lib\n\nconst Ready = true\n');
    writeFileSync(join(r, 'nested', 'go.mod'), 'module example.test/nested\n');
    writeFileSync(join(r, 'nested', 'child.go'), 'package nested\n\nimport "example.test/atlas/lib"\n');
  });
  try {
    const result = inferImports(root);

    assert.equal(result.packageImportEvidence.filesScanned, 2);
    assert.deepEqual(result.packageImportEvidence.packageImports, [
      {
        fromFile: 'app/main.go',
        fromPackage: 'app',
        toPackage: 'lib',
        importSpec: 'example.test/atlas/lib',
        kind: 'static',
        sourceRole: 'production',
        importUsage: 'value',
      },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Go grouped normal, alias, dot, and blank imports retain source role and usage counters', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    mkdirSync(join(r, 'worker'), { recursive: true });
    for (const name of ['normal', 'alias', 'dotted', 'side']) {
      mkdirSync(join(r, 'internal', name), { recursive: true });
      writeFileSync(join(r, 'internal', name, `${name}.go`), `package ${name}\n`);
    }
    writeFileSync(
      join(r, 'worker', 'worker_test.go'),
      [
        'package worker',
        '',
        'import (',
        '  "example.test/atlas/internal/normal"',
        '  named "example.test/atlas/internal/alias"',
        '  . "example.test/atlas/internal/dotted"',
        '  _ "example.test/atlas/internal/side"',
        '  "fmt"',
        ')',
      ].join('\n'),
    );
  });
  try {
    const rows = inferImports(root).packageImportEvidence.packageImports;

    assert.deepEqual(
      rows.map((row) => [row.importSpec, row.kind, row.sourceRole, row.importUsage]),
      [
        ['example.test/atlas/internal/alias', 'static', 'test', 'value'],
        ['example.test/atlas/internal/dotted', 'static', 'test', 'value'],
        ['example.test/atlas/internal/normal', 'static', 'test', 'value'],
        ['example.test/atlas/internal/side', 'side', 'test', 'value'],
      ],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Go import scan ignores import-shaped lines inside multiline raw strings', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    mkdirSync(join(r, 'worker'), { recursive: true });
    for (const name of ['real', 'lookalike']) {
      mkdirSync(join(r, 'internal', name), { recursive: true });
      writeFileSync(join(r, 'internal', name, `${name}.go`), `package ${name}\n`);
    }
    writeFileSync(
      join(r, 'worker', 'worker.go'),
      [
        'package worker',
        '',
        'import "example.test/atlas/internal/real"',
        '',
        'const generatedExample = `',
        'import "example.test/atlas/internal/lookalike"',
        '`',
      ].join('\n'),
    );
  });
  try {
    const rows = inferImports(root).packageImportEvidence.packageImports;

    assert.deepEqual(rows.map((row) => row.importSpec), [
      'example.test/atlas/internal/real',
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Go package scan excludes vendor, testdata, and underscore-prefixed fixture trees', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    mkdirSync(join(r, 'app'), { recursive: true });
    mkdirSync(join(r, 'internal', 'real'), { recursive: true });
    writeFileSync(
      join(r, 'app', 'main.go'),
      'package app\n\nimport "example.test/atlas/internal/real"\n',
    );
    writeFileSync(join(r, 'internal', 'real', 'real.go'), 'package real\n');
    for (const directory of ['vendor', 'testdata', '_scratch']) {
      mkdirSync(join(r, directory), { recursive: true });
      writeFileSync(
        join(r, directory, 'fixture.go'),
        `package fixture\n\nimport "example.test/atlas/internal/real"\n`,
      );
    }
  });
  try {
    const receipt = inferImports(root).packageImportEvidence;

    assert.equal(receipt.filesScanned, 2);
    assert.deepEqual(receipt.packageImports.map((row) => row.fromFile), ['app/main.go']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Go package resolution rejects near-prefix imports and escaped symlink directories', () => {
  const outside = withRepo((r) => {
    writeFileSync(join(r, 'outside.go'), 'package outside\n');
  });
  const root = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    mkdirSync(join(r, 'worker'), { recursive: true });
    writeFileSync(
      join(r, 'worker', 'main.go'),
      [
        'package worker',
        '',
        'import (',
        '  "example.test/atlas-extra/lib"',
        '  "example.test/atlas/escaped"',
        ')',
      ].join('\n'),
    );
    symlinkSync(outside, join(r, 'escaped'));
  });
  try {
    const receipt = inferImports(root).packageImportEvidence;

    assert.deepEqual(receipt.packageImports, []);
    assert.deepEqual(receipt.moduleEdges, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('invalid root Go module paths do not add a typed receipt', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module ../outside\n');
    writeFileSync(join(r, 'main.go'), 'package atlas\n');
  });
  try {
    const result = inferImports(root);

    assert.equal(Object.hasOwn(result, 'packageImportEvidence'), false);
    assert.equal(result.filesScanned, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Go scans enforce the shared file budget and per-file text and import caps', () => {
  const fileBoundRoot = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    mkdirSync(join(r, 'src'), { recursive: true });
    mkdirSync(join(r, 'app'), { recursive: true });
    mkdirSync(join(r, 'pkg'), { recursive: true });
    writeFileSync(join(r, 'src', 'main.ts'), 'export const current = true;\n');
    writeFileSync(join(r, 'app', 'main.go'), 'package app\n\nimport "example.test/atlas/pkg"\n');
    writeFileSync(join(r, 'pkg', 'pkg.go'), 'package pkg\n');
  });
  const textBoundRoot = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    writeFileSync(join(r, 'large.go'), `package atlas\n//${'x'.repeat(262144)}\n`);
  });
  const importBoundRoot = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    mkdirSync(join(r, 'app'), { recursive: true });
    const imports = [];
    for (let index = 0; index < 257; index += 1) {
      const name = `p${String(index).padStart(3, '0')}`;
      mkdirSync(join(r, 'internal', name), { recursive: true });
      writeFileSync(join(r, 'internal', name, `${name}.go`), `package ${name}\n`);
      imports.push(`  "example.test/atlas/internal/${name}"`);
    }
    writeFileSync(join(r, 'app', 'main.go'), ['package app', '', 'import (', ...imports, ')'].join('\n'));
  });
  try {
    const fileBound = inferImports(fileBoundRoot, { maxFiles: 1 });
    assert.equal(fileBound.filesScanned, 1);
    assert.equal(fileBound.packageImportEvidence.filesScanned, 0);
    assert.equal(fileBound.packageImportEvidence.fileScanLimited, true);
    assert.deepEqual(fileBound.packageImportEvidence.packageImports, []);

    const textBound = inferImports(textBoundRoot).packageImportEvidence;
    assert.deepEqual(textBound.packageImports, []);
    assert.deepEqual(textBound.skipped, [
      { file: 'large.go', reason: 'go-import-skip: exceeds 262144 byte limit' },
    ]);

    const importBound = inferImports(importBoundRoot).packageImportEvidence;
    assert.equal(importBound.packageImports.length, 256);
    assert.ok(
      importBound.skipped.some(
        (row) => row.reason === 'go-import-skip: import limit 256 reached',
      ),
      JSON.stringify(importBound.skipped),
    );
  } finally {
    rmSync(fileBoundRoot, { recursive: true, force: true });
    rmSync(textBoundRoot, { recursive: true, force: true });
    rmSync(importBoundRoot, { recursive: true, force: true });
  }
});

test('Go package aggregation is deterministic and keeps package evidence separate from file edges', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    for (const name of ['alpha', 'beta', 'source', 'target']) {
      mkdirSync(join(r, name), { recursive: true });
    }
    writeFileSync(join(r, 'alpha', 'main.go'), 'package alpha\n\nimport "example.test/atlas/target"\n');
    writeFileSync(join(r, 'beta', 'main.go'), 'package beta\n\nimport "example.test/atlas/target"\n');
    for (let index = 0; index < 6; index += 1) {
      writeFileSync(
        join(r, 'source', `part-${index}.go`),
        `package source\n\nimport "example.test/atlas/target"\n`,
      );
    }
    writeFileSync(join(r, 'target', 'target.go'), 'package target\n');
  });
  try {
    const first = inferImports(root);
    const second = inferImports(root);

    assert.deepEqual(first.edges, []);
    assert.deepEqual(first.packageImportEvidence, second.packageImportEvidence);
    assert.deepEqual(
      first.packageImportEvidence.moduleEdges.map((edge) => [edge.fromPackage, edge.toPackage, edge.count]),
      [
        ['source', 'target', 6],
        ['alpha', 'target', 1],
        ['beta', 'target', 1],
      ],
    );
    assert.equal(first.packageImportEvidence.moduleEdges[0].evidence.length, 5);
    assert.equal(first.packageImportEvidence.moduleEdges[0].evidenceLimited, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('Go receipt does not alter existing JavaScript file or module evidence', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'go.mod'), 'module example.test/atlas\n');
    mkdirSync(join(r, 'src', 'a'), { recursive: true });
    mkdirSync(join(r, 'src', 'b'), { recursive: true });
    mkdirSync(join(r, 'app'), { recursive: true });
    mkdirSync(join(r, 'pkg'), { recursive: true });
    writeFileSync(join(r, 'src', 'a', 'index.ts'), 'import { value } from "../b";\nexport const current = value;\n');
    writeFileSync(join(r, 'src', 'b', 'index.ts'), 'export const value = true;\n');
    writeFileSync(join(r, 'app', 'main.go'), 'package app\n\nimport "example.test/atlas/pkg"\n');
    writeFileSync(join(r, 'pkg', 'pkg.go'), 'package pkg\n');
  });
  try {
    const result = inferImports(root);

    assert.deepEqual(result.edges, [
      {
        from: 'src/a/index.ts',
        to: 'src/b/index.ts',
        kind: 'static',
        sourceRole: 'production',
        importUsage: 'value',
      },
    ]);
    assert.deepEqual(result.moduleEdges.map((edge) => [edge.from, edge.to, edge.count]), [
      ['capabilities/a', 'capabilities/b', 1],
    ]);
    assert.equal(result.packageImportEvidence.packageImports.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
