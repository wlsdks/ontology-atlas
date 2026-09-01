import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';

import {
  buildImpactPlan,
  decide,
  decodePlan,
  encodePlan,
  FULL_LANE_COMMANDS,
} from './classify-change.mjs';

test('main and missing comparisons run every exhaustive lane', () => {
  for (const input of [
    { base: 'same', head: 'same', files: [], eventName: 'pull_request' },
    { base: null, head: 'head', files: [], eventName: 'pull_request' },
    { base: 'base', head: 'head', files: [], eventName: 'push' },
  ]) {
    const plan = decide(input);
    assert.equal(plan.full, true);
    assert.equal(plan.lanes.unit.mode, 'full');
    assert.equal(plan.lanes.mcp.mode, 'full');
    assert.equal(plan.lanes.e2e.mode, 'full');
    assert.equal(plan.lanes.e2e.staticExport, true);
    assert.equal(plan.lanes.e2e.webSurface, true);
  }
});

test('prose-only PRs do not install or execute unrelated test lanes', () => {
  const plan = buildImpactPlan({ files: ['README.md'] });

  assert.equal(plan.full, false);
  assert.equal(plan.lanes.unit.mode, 'skip');
  assert.equal(plan.lanes.mcp.mode, 'skip');
  assert.equal(plan.lanes.e2e.mode, 'skip');
  assert.equal(plan.lanes.e2e.staticExport, false);
  assert.equal(plan.lanes.e2e.webSurface, false);
  assert.ok(plan.lanes.gates.commands.includes('pnpm docs:links'));
});

test('app tests run affected Vitest without waking Playwright', () => {
  const plan = buildImpactPlan({ files: ['src/shared/lib/cn.test.ts'] });

  assert.equal(plan.lanes.unit.mode, 'affected');
  assert.equal(plan.lanes.unit.affected, true);
  assert.equal(plan.lanes.unit.contract, 'skip');
  assert.equal(plan.lanes.e2e.mode, 'skip');
});

test('a filesystem-scanned UI file runs affected units, contracts, and mapped e2e only', () => {
  const plan = buildImpactPlan({
    files: ['src/widgets/docs-vault/ui/DocsVaultEditor.tsx'],
  });

  assert.equal(plan.lanes.unit.mode, 'affected');
  assert.equal(plan.lanes.unit.contract, 'full');
  assert.equal(plan.lanes.mcp.mode, 'skip');
  assert.equal(plan.lanes.e2e.mode, 'targeted');
  assert.deepEqual(plan.lanes.e2e.specs, [
    'tests/e2e/docs-deeplink.spec.ts',
    'tests/e2e/document-scroll-lock.spec.ts',
    'tests/e2e/vault-truth-telling.spec.ts',
  ]);
});

test('an unmapped rendered dependency fails closed to the smoke suite', () => {
  const plan = buildImpactPlan({ files: ['src/widgets/search-hint/ui/SearchHint.tsx'] });

  assert.equal(plan.lanes.e2e.mode, 'smoke');
  assert.deepEqual(plan.lanes.e2e.unmappedPaths, [
    'src/widgets/search-hint/ui/SearchHint.tsx',
  ]);
});

test('unmapped pure TypeScript relies on affected units instead of browser guesswork', () => {
  const plan = buildImpactPlan({ files: ['src/shared/lib/cn.ts'] });
  assert.equal(plan.lanes.unit.mode, 'affected');
  assert.equal(plan.lanes.e2e.mode, 'skip');
});

test('MCP is skipped when untouched and focused by handler family when touched', () => {
  assert.equal(
    buildImpactPlan({ files: ['src/shared/lib/cn.test.ts'] }).lanes.mcp.mode,
    'skip',
  );

  const plan = buildImpactPlan({ files: ['mcp/src/index.js'] });
  assert.equal(plan.lanes.mcp.mode, 'focused');
  assert.deepEqual(plan.lanes.mcp.commands, [
    'pnpm docs:surface:check',
    'pnpm test:mcp:unit',
    'pnpm integration:mcp:surface',
    'pnpm integration:mcp:write',
  ]);
  assert.ok(!plan.lanes.mcp.commands.includes('pnpm integration:mcp'));
});

test('MCP dependency changes promote only the MCP boundary to its exhaustive lane', () => {
  const plan = buildImpactPlan({ files: ['mcp/package.json'] });

  assert.equal(plan.full, false);
  assert.equal(plan.lanes.mcp.mode, 'full');
  assert.deepEqual(plan.lanes.mcp.commands, FULL_LANE_COMMANDS.mcp);
  assert.notEqual(plan.lanes.e2e.mode, 'full');
});

test('direct Playwright spec edits run that spec, including post-merge instruments', () => {
  const plan = buildImpactPlan({
    files: ['tests/e2e/camera-transition.spec.ts'],
  });

  assert.equal(plan.lanes.e2e.mode, 'targeted');
  assert.deepEqual(plan.lanes.e2e.specs, ['tests/e2e/camera-transition.spec.ts']);
});

test('Playwright helpers and configuration run every browser project', () => {
  for (const path of ['tests/e2e/global-setup.ts', 'playwright.config.ts']) {
    const plan = buildImpactPlan({ files: [path] });
    assert.equal(plan.lanes.e2e.mode, 'full');
    assert.equal(plan.lanes.e2e.staticExport, true);
    assert.equal(plan.lanes.e2e.webSurface, true);
  }
});

test('dedicated static and web jobs own their exact specs without suite duplication', () => {
  const staticPlan = buildImpactPlan({
    files: ['src/features/ontology-change-review/ui/OntologyChangeReview.tsx'],
  });
  assert.equal(staticPlan.lanes.e2e.staticExport, true);
  assert.equal(staticPlan.lanes.e2e.mode, 'skip');

  const webPlan = buildImpactPlan({ files: ['src-tauri/src/lib.rs'] });
  assert.equal(webPlan.lanes.e2e.webSurface, true);
  assert.equal(webPlan.lanes.e2e.mode, 'skip');
});

test('generated documentation bundles do not masquerade as runtime changes', () => {
  const plan = buildImpactPlan({
    files: [
      'public/docs-vault/FEATURES.md',
      'src/entities/docs-vault/data/content.json',
    ],
  });

  assert.equal(plan.lanes.unit.mode, 'skip');
  assert.equal(plan.lanes.e2e.mode, 'skip');
});

test('unknown paths and planner changes fail closed to exhaustive verification', () => {
  for (const path of ['new-runtime/entry.wasm', 'scripts/run-ci-lane.mjs']) {
    const plan = buildImpactPlan({ files: [path] });
    assert.equal(plan.full, true);
    assert.equal(plan.lanes.unit.mode, 'full');
    assert.equal(plan.lanes.mcp.mode, 'full');
    assert.equal(plan.lanes.e2e.mode, 'full');
  }
});

test('deletions still participate in rule mapping without becoming direct file arguments', () => {
  const plan = buildImpactPlan({
    deletedFiles: ['tests/contract/obsolete.contract.test.ts'],
  });

  assert.equal(plan.lanes.unit.contract, 'full');
  assert.deepEqual(plan.lanes.unit.contractFiles, []);
});

test('the serialized workflow plan is versioned and round-trips exactly', () => {
  const plan = buildImpactPlan({ files: ['README.md'] });
  assert.deepEqual(decodePlan(encodePlan(plan)), plan);
  assert.throws(() => decodePlan(''), /missing/);
  assert.throws(
    () =>
      decodePlan(
        encodePlan({
          ...plan,
          lanes: { ...plan.lanes, mcp: { mode: 'skip', commands: ['pnpm integration:mcp'] } },
        }),
      ),
    /MCP mode\/command mismatch/,
  );
  assert.throws(
    () =>
      decodePlan(
        encodePlan({
          ...plan,
          unknownPaths: ['future-runtime/entry.wasm'],
        }),
      ),
    /unknown paths did not fail closed/,
  );
});

test('gate inventories are non-empty so exhaustive mode cannot pass vacuously', () => {
  assert.ok(FULL_LANE_COMMANDS.gates.length >= 30);
  assert.ok(FULL_LANE_COMMANDS.unit.length >= 2);
  assert.ok(FULL_LANE_COMMANDS.mcp.length >= 5);
});

test('every currently tracked path belongs to a known impact namespace', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  assert.ok(files.length > 1_000, 'tracked-path inventory is unexpectedly empty');
  assert.deepEqual(buildImpactPlan({ files }).unknownPaths, []);
});
