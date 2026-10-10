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

test('a workspace package without a name takes its slug from the folder, and the full path when folders repeat', () => {
  const root = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'workspace-root', private: true }));
    writeFileSync(join(r, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n");
    mkdirSync(join(r, 'packages', 'tools'), { recursive: true });
    writeFileSync(join(r, 'packages', 'tools', 'package.json'), '{}\n');
  });
  const twins = withRepo((r) => {
    writeFileSync(join(r, 'package.json'), JSON.stringify({ name: 'workspace-root', private: true }));
    writeFileSync(join(r, 'pnpm-workspace.yaml'), "packages:\n  - 'packages/*'\n  - 'apps/*'\n");
    mkdirSync(join(r, 'packages', 'tools'), { recursive: true });
    mkdirSync(join(r, 'apps', 'tools'), { recursive: true });
    writeFileSync(join(r, 'packages', 'tools', 'package.json'), '{}\n');
    writeFileSync(join(r, 'apps', 'tools', 'package.json'), '{}\n');
  });
  try {
    assert.deepEqual(discoverDeclaredWorkspacePackages(root).packages, [
      { path: 'packages/tools', name: null, slug: 'tools' },
    ]);
    assert.doesNotThrow(() => inferImports(root));
    assert.deepEqual(discoverDeclaredWorkspacePackages(twins).packages, [
      { path: 'apps/tools', name: null, slug: 'apps-tools' },
      { path: 'packages/tools', name: null, slug: 'packages-tools' },
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
    rmSync(twins, { recursive: true, force: true });
  }
});

function declareWorkspace(root, patterns) {
  writeFileSync(join(root, 'package.json'), JSON.stringify({ name: 'workspace-root', private: true }));
  writeFileSync(
    join(root, 'pnpm-workspace.yaml'),
    ['packages:', ...patterns.map((pattern) => `  - '${pattern}'`), ''].join('\n'),
  );
}

function discoverIn(root, setup) {
  const dir = withRepo((r) => {
    declareWorkspace(r, setup.patterns);
    setup.build(r);
  });
  root.push(dir);
  return discoverDeclaredWorkspacePackages(dir);
}

test('a workspace pattern of 24 segments is accepted and one of 25 is skipped', () => {
  const made = [];
  try {
    for (const depth of [24, 25]) {
      const segments = Array.from({ length: depth }, () => 'a');
      const discovery = discoverIn(made, {
        patterns: [segments.join('/')],
        build: (r) => {
          mkdirSync(join(r, ...segments), { recursive: true });
          writeFileSync(join(r, ...segments, 'package.json'), '{"name":"deep"}\n');
        },
      });
      const skippedForSegments = discovery.skipped.some(
        (row) => row.reason === 'workspace-declaration-skip: segment limit 24 exceeded',
      );
      assert.equal(skippedForSegments, depth === 25, `depth ${depth}: ${JSON.stringify(discovery)}`);
      assert.deepEqual(discovery.packages.map((row) => row.name), depth === 24 ? ['deep'] : []);
    }
  } finally {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  }
});

test('a workspace pattern with 16 wildcards is accepted and one with 17 is skipped', () => {
  const made = [];
  try {
    for (const stars of [16, 17]) {
      const discovery = discoverIn(made, {
        patterns: [`packages/${'*'.repeat(stars)}`],
        build: (r) => {
          mkdirSync(join(r, 'packages', 'core'), { recursive: true });
          writeFileSync(join(r, 'packages', 'core', 'package.json'), '{"name":"core"}\n');
        },
      });
      const skippedForWildcards = discovery.skipped.some(
        (row) => row.reason === 'workspace-declaration-skip: wildcard limit 16 exceeded',
      );
      assert.equal(skippedForWildcards, stars === 17, `${stars} wildcards: ${JSON.stringify(discovery)}`);
      assert.deepEqual(discovery.packages.map((row) => row.name), stars === 16 ? ['core'] : []);
    }
  } finally {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  }
});

test('workspace discovery stops after 10000 directory entries and reports it', () => {
  const made = [];
  try {
    for (const entries of [10000, 10001]) {
      const discovery = discoverIn(made, {
        patterns: ['zpkgs/*'],
        build: (r) => {
          mkdirSync(join(r, 'zpkgs', 'core'), { recursive: true });
          writeFileSync(join(r, 'zpkgs', 'core', 'package.json'), '{"name":"core"}\n');
          for (let index = 0; index < entries - 5; index += 1) {
            writeFileSync(join(r, 'zpkgs', `f${index}`), '');
          }
        },
      });
      const reported = discovery.skipped.some(
        (row) => row.reason === 'workspace-discovery-entry-limit: reached 10000',
      );
      assert.equal(reported, entries === 10001, `${entries} entries: ${JSON.stringify(discovery.skipped)}`);
    }
  } finally {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  }
});

test('workspace pattern matching stops at 250000 states and reports it', () => {
  const patterns = [...Array.from({ length: 63 }, () => 'x'), 'a/y'];
  const made = [];
  try {
    for (const deepCount of [16, 17]) {
      const shallowCount = 3906 - deepCount;
      const discovery = discoverIn(made, {
        patterns,
        build: (r) => {
          mkdirSync(join(r, 'a'), { recursive: true });
          for (let index = 0; index < deepCount; index += 1) {
            mkdirSync(join(r, 'a', `d${index}`));
            writeFileSync(join(r, 'a', `d${index}`, 'package.json'), '{}\n');
          }
          for (let index = 0; index < shallowCount; index += 1) {
            mkdirSync(join(r, `s${index}`));
            writeFileSync(join(r, `s${index}`, 'package.json'), '{}\n');
          }
        },
      });
      const reported = discovery.skipped.some(
        (row) => row.reason === 'workspace-declaration-match-limit: reached 250000 pattern states',
      );
      assert.equal(reported, deepCount === 17, `${deepCount}: ${JSON.stringify(discovery.skipped.slice(0, 3))}`);
    }
  } finally {
    for (const dir of made) rmSync(dir, { recursive: true, force: true });
  }
});
