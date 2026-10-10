import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { inferImports } from '../infer-imports.mjs';
import { withRepo } from './repo-fixture.mjs';

test('source/ TypeScript root preserves feature dependency evidence', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'source', 'features', 'alpha'), { recursive: true });
    mkdirSync(join(r, 'source', 'features', 'beta'), { recursive: true });
    writeFileSync(
      join(r, 'source', 'features', 'alpha', 'index.ts'),
      'import { beta } from "../beta";\nexport const alpha = beta;\n',
    );
    writeFileSync(
      join(r, 'source', 'features', 'beta', 'index.ts'),
      'export const beta = true;\n',
    );
  });
  try {
    const result = inferImports(root);
    assert.ok(
      result.edges.length > 0,
      'fixture must contain at least one observed source import',
    );
    assert.ok(
      result.moduleEdges.some(
        (edge) =>
          edge.from === 'capabilities/alpha' &&
          edge.to === 'capabilities/beta',
      ),
      `expected source/ feature boundary, got: ${JSON.stringify(result.moduleEdges)}`,
    );
    assert.ok(
      inferImports(root, { sourceFolders: ['source/features'] }).moduleEdges.some(
        (edge) =>
          edge.from === 'capabilities/alpha' &&
          edge.to === 'capabilities/beta',
      ),
      'a nested feature scope must not erase its top-level source-root semantics',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('source/ top-level coordinators and helper files stay implementation elements', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'source', 'helpers'), { recursive: true });
    writeFileSync(
      join(r, 'source', 'feature-manager.tsx'),
      'import { enable } from "./helpers/feature-utils";\nexport const run = enable;\n',
    );
    writeFileSync(
      join(r, 'source', 'helpers', 'feature-utils.ts'),
      'export const enable = true;\n',
    );
    writeFileSync(
      join(r, 'source', 'helpers', 'feature-utils.test.ts'),
      'import { enable } from "./feature-utils";\nexport const observed = enable;\n',
    );
  });
  try {
    const result = inferImports(root);
    assert.ok(
      result.edges.length > 0,
      'fixture must contain at least one observed source import',
    );
    assert.ok(
      result.moduleEdges.some(
        (edge) =>
          edge.from === 'elements/feature-manager' &&
          edge.to === 'elements/feature-utils',
      ),
      `expected source coordinator → helper element boundary, got: ${JSON.stringify(result.moduleEdges)}`,
    );
    assert.equal(
      result.moduleEdges.some((edge) => edge.sourceRoleCounts.test > 0),
      false,
      `test files must collapse to their production endpoint, not create ontology nodes: ${JSON.stringify(result.moduleEdges)}`,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('generic lib source folders collapse to implementation elements rather than business capabilities', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'lib', 'format'), { recursive: true });
    mkdirSync(join(r, 'lib', 'parse'), { recursive: true });
    writeFileSync(join(r, 'lib', 'format', 'index.js'), 'export const format = true;\n');
    writeFileSync(
      join(r, 'lib', 'parse', 'index.js'),
      'import { format } from "../format/index.js";\nexport const parse = format;\n',
    );
  });
  try {
    const result = inferImports(root);

    assert.ok(
      result.moduleEdges.some(
        (edge) => edge.from === 'elements/parse' && edge.to === 'elements/format',
      ),
      `generic lib import was not retained as implementation evidence: ${JSON.stringify(result.moduleEdges)}`,
    );
    assert.equal(
      result.moduleEdges.some(
        (edge) => edge.from.startsWith('capabilities/') || edge.to.startsWith('capabilities/'),
      ),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('non-source assets never become ontology module endpoints', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'source', 'features'), { recursive: true });
    writeFileSync(
      join(r, 'source', 'features', 'alpha.tsx'),
      'import "./alpha.css";\nexport const alpha = true;\n',
    );
    writeFileSync(join(r, 'source', 'features', 'alpha.css'), '.alpha {}\n');
  });
  try {
    const result = inferImports(root);
    assert.ok(
      result.edges.length > 0,
      'fixture must contain at least one observed asset import',
    );
    assert.deepEqual(
      result.moduleEdges,
      [],
      'asset imports are file evidence, not ontology capability/element endpoints',
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (FSD features/ uses the capability folder slug, consistent with analyze)', () => {
  // Sharing the analyze_repo_structure slug lets a review line the concepts up.
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
    assert.equal(e.count, 2, 'both imports are summed');
    assert.deepEqual(e.evidence, [
      {
        from: 'src/features/auth/index.ts',
        to: 'src/features/billing/index.ts',
        kind: 'static',
        sourceRole: 'production',
        importUsage: 'value',
      },
      {
        from: 'src/features/auth/index.ts',
        to: 'src/features/billing/token.ts',
        kind: 'static',
        sourceRole: 'production',
        importUsage: 'value',
      },
    ]);
    assert.equal(e.evidenceLimited, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('module-level edge collapse (workspace packages — analyzer element slug parity)', () => {
  const root = withRepo((r) => {
    mkdirSync(join(r, 'apps', 'api', 'src'), { recursive: true });
    mkdirSync(join(r, 'packages', 'memory', 'src'), { recursive: true });
    mkdirSync(join(r, 'packages', 'shared', 'src'), { recursive: true });
    mkdirSync(join(r, 'scripts', 'lib'), { recursive: true });
    writeFileSync(
      join(r, 'apps', 'api', 'package.json'),
      '{"name":"@muse/api"}\n',
    );
    writeFileSync(
      join(r, 'packages', 'memory', 'package.json'),
      '{"name":"@muse/memory"}\n',
    );
    writeFileSync(
      join(r, 'packages', 'shared', 'package.json'),
      '{"name":"@muse/shared"}\n',
    );
    writeFileSync(
      join(r, 'packages', 'memory', 'src', 'index.ts'),
      'import { json } from "../../shared/src/index";\nexport { json };\n',
    );
    writeFileSync(
      join(r, 'packages', 'shared', 'src', 'index.ts'),
      'export const json = true;\n',
    );
    writeFileSync(
      join(r, 'apps', 'api', 'src', 'index.ts'),
      [
        'import { json } from "../../../packages/shared/src/index";',
        'import "../../../scripts/lib/helper";',
        'export { json };',
      ].join('\n'),
    );
    writeFileSync(join(r, 'scripts', 'lib', 'helper.ts'), 'export const helper = true;\n');
  });
  try {
    const r = inferImports(root);
    assert.deepEqual(r.moduleEdges, [
      {
        from: 'elements/api',
        to: 'elements/shared',
        count: 1,
        kindCounts: { static: 1 },
        sourceRoleCounts: { production: 1, test: 0, unknown: 0 },
        importUsageCounts: { value: 1, type_only: 0, unknown: 0 },
        productValueCount: 1,
        evidence: [
          {
            from: 'apps/api/src/index.ts',
            to: 'packages/shared/src/index.ts',
            kind: 'static',
            sourceRole: 'production',
            importUsage: 'value',
          },
        ],
        evidenceLimited: false,
      },
      {
        from: 'elements/memory',
        to: 'elements/shared',
        count: 1,
        kindCounts: { static: 1 },
        sourceRoleCounts: { production: 1, test: 0, unknown: 0 },
        importUsageCounts: { value: 1, type_only: 0, unknown: 0 },
        productValueCount: 1,
        evidence: [
          {
            from: 'packages/memory/src/index.ts',
            to: 'packages/shared/src/index.ts',
            kind: 'static',
            sourceRole: 'production',
            importUsage: 'value',
          },
        ],
        evidenceLimited: false,
      },
    ]);
    assert.deepEqual(
      inferImports(root, {
        sourceFolders: ['apps', 'packages'],
        ignore: ['packages'],
      }).moduleEdges,
      [],
    );
    assert.deepEqual(
      inferImports(root, {
        sourceFolders: ['apps', 'packages'],
        ignore: ['shared'],
      }).moduleEdges,
      [],
    );
    const ignoredWorkspace = inferImports(root, {
      sourceFolders: ['packages'],
      ignore: ['packages'],
    });
    const {
      coverage: ignoredCoverage,
      ...ignoredWorkspaceScan
    } = ignoredWorkspace;
    assert.equal(ignoredCoverage.contract, 'importScanCoverage:v1');
    assert.equal(Object.hasOwn(ignoredWorkspace, 'packageImportEvidence'), false);
    assert.deepEqual(
      ignoredWorkspaceScan,
      {
        rootPath: root,
        filesScanned: 0,
        edges: [],
        externalImports: [],
        unresolved: [],
        moduleEdges: [],
      },
    );
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
          x.to === 'elements/habit',
      ),
      `expected feature → domain-model element edge, got: ${JSON.stringify(r.moduleEdges)}`,
    );
    assert.ok(
      r.moduleEdges.some(
        (x) =>
          x.from === 'capabilities/check-in' &&
          x.to === 'elements/json-store',
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

test('module-level edge collapse (FSD widgets/ uses the element folder slug, consistent with analyze)', () => {
  // Flat `elements/<name>`, like analyze (a layer suffix only on a basename collision).
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
      (x) => x.from === 'elements/header' && x.to === 'elements/footer',
    );
    assert.ok(e, `expected module edge elements/header → elements/footer, got: ${JSON.stringify(r.moduleEdges)}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
