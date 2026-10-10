import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
import { discoverDeclaredWorkspacePackages } from './workspace-packages.mjs';
import { withRepo } from './repo-fixture.mjs';

test('declared workspace globs scan nested package roots, resolve workspace imports, and honor exclusions', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'workspace-root', private: true }));
    writeFileSync(
      join(r, 'pnpm-workspace.yaml'),
      [
        'packages:',
        "  - 'packages/*'",
        "  - 'packages/tooling/*'",
        "  - '!packages/ignored'",
        '',
      ].join('\n'),
    );
    mkdirSync(join(r, 'packages', 'core', 'src'), { recursive: true });
    mkdirSync(join(r, 'packages', 'tooling', 'worker', 'src'), { recursive: true });
    mkdirSync(join(r, 'packages', 'ignored', 'src'), { recursive: true });
    writeFileSync(join(r, 'packages', 'core', 'package.json'), '{"name":"@scope/core"}\n');
    writeFileSync(join(r, 'packages', 'tooling', 'worker', 'package.json'), '{"name":"@scope/worker"}\n');
    writeFileSync(join(r, 'packages', 'ignored', 'package.json'), '{"name":"@scope/ignored"}\n');
    writeFileSync(
      join(r, 'packages', 'core', 'src', 'index.ts'),
      'import { worker } from "@scope/worker";\nexport const core = worker;\n',
    );
    writeFileSync(join(r, 'packages', 'tooling', 'worker', 'src', 'index.ts'), 'export const worker = 1;\n');
    writeFileSync(join(r, 'packages', 'ignored', 'src', 'index.ts'), 'export const ignored = true;\n');
  });
  try {
    const result = inferImports(root);
    assert.equal(result.filesScanned, 2, 'excluded workspace roots are not silently scanned');
    assert.ok(
      result.edges.some(
        (edge) =>
          edge.from === 'packages/core/src/index.ts' &&
          edge.to === 'packages/tooling/worker/src/index.ts',
      ),
      `declared workspace package import did not resolve: ${JSON.stringify(result)}`,
    );
    assert.ok(
      result.moduleEdges.some(
        (edge) => edge.from === 'elements/core' && edge.to === 'elements/worker',
      ),
      `workspace package boundary did not become bounded implementation evidence: ${JSON.stringify(result.moduleEdges)}`,
    );
    assert.equal(
      result.edges.some((edge) => edge.from.startsWith('packages/ignored/')),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('package.json workspaces use the same declared package boundary discovery', () => {
  const root = withRepo((r) => {
    writeFileSync(
      join(r, 'package.json'),
      JSON.stringify({
        name: 'workspace-root',
        private: true,
        workspaces: { packages: ['modules/*'] },
      }),
    );
    mkdirSync(join(r, 'modules', 'client', 'src'), { recursive: true });
    mkdirSync(join(r, 'modules', 'transport', 'src'), { recursive: true });
    writeFileSync(join(r, 'modules', 'client', 'package.json'), '{"name":"@scope/client"}\n');
    writeFileSync(join(r, 'modules', 'transport', 'package.json'), '{"name":"@scope/transport"}\n');
    writeFileSync(
      join(r, 'modules', 'client', 'src', 'index.ts'),
      'import { transport } from "@scope/transport";\nexport const client = transport;\n',
    );
    writeFileSync(join(r, 'modules', 'transport', 'src', 'index.ts'), 'export const transport = 1;\n');
  });
  try {
    const result = inferImports(root);
    assert.equal(result.filesScanned, 2);
    assert.ok(
      result.moduleEdges.some(
        (edge) => edge.from === 'elements/client' && edge.to === 'elements/transport',
      ),
      `package.json workspace boundary did not resolve: ${JSON.stringify(result.moduleEdges)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workspace manifest entrypoints and subpath exports never escape their package or repository', () => {
  const outside = withRepo((r) => {
    writeFileSync(join(r, 'outside.ts'), 'export const outside = true;\n');
  });
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'workspace-root', private: true }));
    writeFileSync(join(r, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    writeFileSync(join(r, 'outside.ts'), 'export const repoOutsidePackage = true;\n');
    mkdirSync(join(r, 'packages', 'client', 'src'), { recursive: true });
    mkdirSync(join(r, 'packages', 'worker'), { recursive: true });
    writeFileSync(join(r, 'packages', 'client', 'package.json'), '{"name":"@scope/client"}\n');
    writeFileSync(
      join(r, 'packages', 'worker', 'package.json'),
      JSON.stringify({
        name: '@scope/worker',
        main: '../../outside.ts',
        exports: { '.': './linked.ts', './escaped': '../../outside.ts' },
      }),
    );
    symlinkSync(join(outside, 'outside.ts'), join(r, 'packages', 'worker', 'linked.ts'));
    writeFileSync(
      join(r, 'packages', 'client', 'src', 'index.ts'),
      [
        'import { root } from "@scope/worker";',
        'import { escaped } from "@scope/worker/escaped";',
        'export const client = [root, escaped];',
      ].join('\n'),
    );
  });
  try {
    const result = inferImports(root);

    assert.equal(result.edges.length, 0, `workspace escape became an internal edge: ${JSON.stringify(result.edges)}`);
    assert.deepEqual(result.moduleEdges, []);
    assert.deepEqual(result.externalImports, []);
    assert.deepEqual(
      result.unresolved.filter((row) => row.from === 'packages/client/src/index.ts'),
      [
        { from: 'packages/client/src/index.ts', spec: '@scope/worker', reason: 'alias-not-found' },
        { from: 'packages/client/src/index.ts', spec: '@scope/worker/escaped', reason: 'alias-not-found' },
      ],
      `unsafe workspace targets must be surfaced as unresolved, never silently accepted: ${JSON.stringify(result.unresolved)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  }
});

test('workspace declaration rejects repeated globstar patterns before bounded matching', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'workspace-root', private: true }));
    writeFileSync(
      join(r, 'pnpm-workspace.yaml'),
      [
        'packages:',
        "  - 'packages/**/**/**'",
        "  - 'packages/*'",
        '',
      ].join('\n'),
    );
    mkdirSync(join(r, 'packages', 'core', 'src'), { recursive: true });
    writeFileSync(join(r, 'packages', 'core', 'package.json'), '{"name":"@scope/core"}\n');
    writeFileSync(join(r, 'packages', 'core', 'src', 'index.ts'), 'export const core = true;\n');
  });
  try {
    const result = inferImports(root);
    const discovery = discoverDeclaredWorkspacePackages(root);

    assert.equal(result.filesScanned, 1, 'a bounded sibling declaration still discovers the package');
    assert.ok(
      discovery.skipped.some((row) =>
        row.reason === 'workspace-declaration-skip: globstar limit 2 exceeded',
      ),
      `repeated globstar must be explicitly skipped before matching: ${JSON.stringify(discovery)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('workspace declaration count limit fails closed before an omitted exclusion can re-admit a package', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'workspace-root', private: true }));
    writeFileSync(
      join(r, 'pnpm-workspace.yaml'),
      [
        'packages:',
        ...Array.from({ length: 64 }, () => "  - 'packages/*'"),
        "  - '!packages/ignored'",
        '',
      ].join('\n'),
    );
    mkdirSync(join(r, 'packages', 'ignored', 'src'), { recursive: true });
    writeFileSync(join(r, 'packages', 'ignored', 'package.json'), '{"name":"@scope/ignored"}\n');
    writeFileSync(join(r, 'packages', 'ignored', 'src', 'index.ts'), 'export const ignored = true;\n');
  });
  try {
    const discovery = discoverDeclaredWorkspacePackages(root);
    const result = inferImports(root);

    assert.deepEqual(discovery.packages, []);
    assert.equal(result.filesScanned, 0);
    assert.ok(
      discovery.skipped.some(
        (row) => row.reason === 'workspace-declaration-pattern-limit: omitted 1 patterns',
      ),
      `an omitted exclusion must fail declaration discovery closed: ${JSON.stringify(discovery)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
