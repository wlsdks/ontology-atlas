import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import test from 'node:test';

import { suggestFocusedChecks } from '../lib/ci/focused-check-suggestions.mjs';
import { RUST_LINT_COMMAND } from '../lib/check-rules/desktop.mjs';
import { commandsForLane } from './run-ci-lane.mjs';
import {
  CORE_CONTRACT_DIRECTORIES,
  coreContractFiles,
  FORBIDDEN_PATTERN_CONTRACTS,
  ratchetContractFiles,
  browserBuildFiles,
  buildImpactPlan,
  withoutSubsetsOfWholeFiles,
  decide,
  decodePlan,
  encodeLanePlan,
  encodePlan,
  FULL_LANE_COMMANDS,
  NATIVE_TOOLCHAIN_COMMANDS,
  unitUsesAllShards,
  isRelatedSweep,
  reuseReviewedMainPlan,
  fullBrowserAfterMerge,
  validatePlan,
} from './classify-change.mjs';

test('only a proven main push reuses every lane while retaining changed-path evidence', () => {
  const base = 'a'.repeat(40); const head = 'b'.repeat(40);
  const plan = buildImpactPlan({ files: ['scripts/ci/classify-change.mjs'] });
  const proof = { skip: true, commit: head, tree: 'c'.repeat(40), reviewedHead: 'd'.repeat(40), pullRequest: 12 };
  const reused = reuseReviewedMainPlan(plan, proof, { eventName: 'push', base, head });
  const decoded = decodePlan(encodePlan(reused));
  assert.equal(decoded.full, false);
  assert.deepEqual(decoded.paths, plan.paths);
  assert.equal(decoded.lanes.gates.run, false);
  for (const lane of ['unit', 'perf', 'mcp', 'e2e']) assert.equal(decoded.lanes[lane].mode, 'skip');
  assert.equal(decoded.reusedFrom.tree, proof.tree);
  assert.equal(plan.full, true, 'reuse must not mutate the original fallback plan');
  for (const options of [
    { eventName: 'pull_request', base, head }, { eventName: 'schedule', base, head },
    { eventName: 'workflow_dispatch', base, head }, { eventName: 'merge_group', base, head },
    { eventName: 'push', base: null, head }, { eventName: 'push', base, head: 'e'.repeat(40) },
  ]) assert.equal(reuseReviewedMainPlan(plan, proof, options), plan);
  for (const invalid of [undefined, { ...proof, skip: false }, { ...proof, tree: '' }, { ...proof, pullRequest: 0 }]) {
    assert.equal(reuseReviewedMainPlan(plan, invalid, { eventName: 'push', base, head }), plan);
  }
  const unknown = buildImpactPlan({ files: ['unknown-system/input'] });
  assert.equal(reuseReviewedMainPlan(unknown, proof, { eventName: 'push', base, head }), unknown);
});

test('scheduled runs and missing comparisons run every exhaustive lane', () => {
  for (const input of [
    { base: 'same', head: 'same', files: [], eventName: 'pull_request' },
    { base: null, head: 'head', files: [], eventName: 'pull_request' },
    { base: 'base', head: 'head', files: [], eventName: 'schedule' },
  ]) {
    const plan = decide(input);
    assert.equal(plan.full, true);
    assert.equal(plan.lanes.unit.mode, 'full');
    assert.equal(plan.lanes.perf.mode, 'full');
    assert.equal(plan.lanes.mcp.mode, 'full');
    assert.equal(plan.lanes.e2e.mode, 'full');
    assert.equal(plan.lanes.e2e.staticExport, true);
    assert.equal(plan.lanes.e2e.webSurface, true);
  }
});

test('prose-only PRs run only the core contracts beside their documentation gates', () => {
  const plan = buildImpactPlan({ files: ['README.md'] });

  assert.equal(plan.full, false);
  assert.equal(plan.lanes.unit.mode, 'focused');
  assert.equal(plan.lanes.unit.affected, false);
  assert.equal(plan.lanes.unit.knip, false);
  assert.deepEqual(plan.lanes.unit.contractFiles, coreContractFiles());
  assert.equal(unitUsesAllShards(plan.lanes.unit), false, 'the core alone stays on one runner');
  assert.equal(plan.lanes.mcp.mode, 'skip');
  assert.equal(plan.lanes.e2e.mode, 'skip');
  assert.equal(plan.lanes.e2e.staticExport, false);
  assert.equal(plan.lanes.e2e.webSurface, false);
  assert.ok(plan.lanes.gates.commands.includes('pnpm docs:links'));
});

test('app tests run affected Vitest and the test-source ratchets without waking Playwright', () => {
  const plan = buildImpactPlan({ files: ['src/shared/lib/cn.test.ts'] });

  assert.equal(plan.lanes.unit.mode, 'affected');
  assert.equal(plan.lanes.unit.affected, true);
  assert.equal(plan.lanes.unit.contract, 'focused');
  assert.deepEqual(plan.lanes.unit.contractFiles, [...new Set([
    'tests/contract/ci-gates/test-title-language.contract.test.ts',
    ...coreContractFiles(),
    ...ratchetContractFiles(),
  ])].sort());
  assert.equal(plan.lanes.e2e.mode, 'skip');
});

test('a stylesheet change runs the token gates that read it whole', () => {
  for (const file of ['app/globals.css', 'app/styles/tokens.css']) {
    const { contract, contractFiles } = buildImpactPlan({ files: [file] }).lanes.unit;
    assert.equal(contract, 'focused', file);
    for (const gate of [
      'tests/contract/design-tokens/design-doc-token-integrity.contract.test.ts',
      'tests/contract/design-tokens/undeclared-token-ref.contract.test.ts',
      'tests/contract/design-tokens/quaternary-ink-surface.contract.test.ts',
    ]) assert.ok(contractFiles.includes(gate), `${file} -> ${gate}`);
  }
});

test('a widely imported source leaves related tests to the sharded affected run', () => {
  const plan = buildImpactPlan({ files: ['src/shared/ui/control-class.ts'] });

  assert.equal(plan.lanes.unit.affected, true);
  assert.equal(
    plan.lanes.unit.extraCommands.some((command) => command.startsWith('pnpm exec vitest related ')),
    false,
    'vitest related repeated the affected run unsharded on shard 1',
  );
});

test('code outside app and src runs every suite and contract its importers reach', () => {
  const unit = buildImpactPlan({ files: ['scripts/lib/desktop-release/release-secret-env.mjs'] }).lanes.unit;
  assert.equal(unit.affected, true, 'a src suite imports this release script module');
  assert.equal(unit.contract, 'focused');
  assert.ok(unit.contractFiles.includes('tests/contract/release/release-preflight.contract.test.ts'));
  assert.equal(unitUsesAllShards(unit), true);
});

test('script server code is reached by contracts that start it, and by no src suite', () => {
  const unit = buildImpactPlan({ files: ['mcp/src/architecture/architecture-profile.mjs'] }).lanes.unit;
  assert.equal(unit.affected, false, 'no src suite imports the script server any more, so --changed selects nothing');
  assert.equal(unit.contract, 'focused');
  assert.ok(unit.contractFiles.includes('tests/contract/security/mcp-vault-safety.contract.test.ts'));
  assert.equal(unitUsesAllShards(unit), false);
});

test('a message part runs the suites importing the composed catalogue on every shard, and the core contracts', () => {
  const unit = buildImpactPlan({ files: ['messages/en/library.json'] }).lanes.unit;
  assert.equal(unit.affected, false, 'no module imports a part, so --changed would select nothing');
  assert.equal(unit.contract, 'focused', 'the full contract sweep runs after the merge');
  for (const core of coreContractFiles()) assert.ok(unit.contractFiles.includes(core), core);
  assert.ok(unit.extraCommands.some(isRelatedSweep));
  assert.equal(unitUsesAllShards(unit), true);
});

test('a deleted file still imported somewhere runs the suites that import it by name', () => {
  const unit = buildImpactPlan({ files: [], deletedFiles: ['scripts/lib/desktop-release/release-secret-env.mjs'] }).lanes.unit;
  const stale = 'src/views/download/lib/release/release-facts.test.ts';
  assert.ok(unit.extraCommands.some((command) => command.split(' ').includes(stale)));
  assert.ok(unit.contractFiles.includes('tests/contract/release/release-preflight.contract.test.ts'));
});

test('a filesystem-scanned UI file runs affected units, contracts, and mapped e2e only', () => {
  const plan = buildImpactPlan({
    files: ['src/widgets/docs-vault/ui/DocsVaultEditor.tsx'],
  });

  assert.equal(plan.lanes.unit.mode, 'affected');
  assert.equal(plan.lanes.unit.contract, 'focused', 'the full contract sweep runs after the merge');
  assert.equal(plan.lanes.unit.knip, false, 'the whole-graph analyzer runs after the merge');
  assert.ok(plan.lanes.unit.contractFiles.includes('tests/contract/security/workflow-security.contract.test.ts'));
  assert.equal(plan.lanes.mcp.mode, 'skip');
  assert.equal(plan.lanes.e2e.mode, 'targeted');
  assert.deepEqual(plan.lanes.e2e.specs, [
    'tests/e2e/design-audits/document-scroll-lock.spec.ts',
    'tests/e2e/library/docs/docs-deeplink.spec.ts',
    'tests/e2e/vault-session/vault-truth-telling.spec.ts',
  ]);
});

test('an unmapped rendered dependency fails closed to the smoke suite', () => {
  const plan = buildImpactPlan({ files: ['src/views/guide/ui/GuidePage.tsx'] });

  assert.equal(plan.lanes.e2e.mode, 'smoke');
  assert.deepEqual(plan.lanes.e2e.unmappedPaths, [
    'src/views/guide/ui/GuidePage.tsx',
  ]);
});

test('every Sources home source runs its spec and its ui keeps the smoke sweep', () => {
  const sources = readdirSync('src/widgets/library-sources-overview', { recursive: true })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .map((file) => `src/widgets/library-sources-overview/${file}`);
  const specs = readdirSync('tests/e2e', { recursive: true })
    .filter((file) => /(?:^|\/)sources-home\.spec\.ts$/.test(file))
    .map((file) => `tests/e2e/${file}`);
  assert.ok(sources.length > 0 && specs.length > 0, 'the Sources home or its spec moved; move this case');
  for (const source of sources) {
    const e2e = buildImpactPlan({ files: [source] }).lanes.e2e;
    for (const spec of specs) assert.ok(e2e.specs.includes(spec), `${source} does not run ${spec}`);
    if (source.includes('/ui/')) assert.equal(e2e.mode, 'smoke', `${source} dropped the smoke sweep`);
  }
});

test('unmapped pure TypeScript runs its affected units and the merge smoke set', () => {
  const plan = buildImpactPlan({ files: ['src/shared/lib/cn.ts'] });
  assert.equal(plan.lanes.unit.mode, 'affected');
  assert.equal(plan.lanes.e2e.mode, 'smoke');
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

test('a focused MCP wrapper is dropped only when another planned script runs its whole file', () => {
  const scripts = {
    'integration:mcp': 'node --test mcp/src/integration.test.mjs',
    'integration:mcp:write': 'node scripts/ci/run-focused-node-test.mjs --test-name-pattern "^(add_concepts|patch_concept)" mcp/src/integration.test.mjs',
    'test:mcp:maintenance': 'node scripts/ci/run-focused-node-test.mjs --test-name-pattern "maintenance" mcp/src/maintenance.test.mjs',
  };
  const planned = ['pnpm integration:mcp:write', 'pnpm test:mcp:maintenance', 'pnpm docs:surface:check'];
  assert.deepEqual(withoutSubsetsOfWholeFiles(planned, scripts), planned);
  assert.deepEqual(
    withoutSubsetsOfWholeFiles(['pnpm integration:mcp', ...planned], scripts),
    ['pnpm integration:mcp', 'pnpm test:mcp:maintenance', 'pnpm docs:surface:check'],
  );
});

test('MCP dependency changes promote only the MCP boundary to its exhaustive lane', () => {
  const plan = buildImpactPlan({ files: ['mcp/package.json'] });

  assert.equal(plan.full, false);
  assert.equal(plan.lanes.mcp.mode, 'full');
  assert.deepEqual(plan.lanes.mcp.commands, FULL_LANE_COMMANDS.mcp);
  assert.notEqual(plan.lanes.e2e.mode, 'full');
});

test('direct Playwright spec edits run that spec, including post-merge instruments', () => {
  for (const spec of ['tests/e2e/map/camera/camera-transition.spec.ts', 'tests/e2e/gray-area/gray-area.spec.ts']) {
    const focused = suggestFocusedChecks([spec]).commands.map((row) => row.command);
    assert.ok(focused.includes(`pnpm exec playwright test ${spec}`));
    const plan = buildImpactPlan({ files: [spec] });
    assert.equal(plan.lanes.e2e.mode, 'targeted', spec);
    assert.deepEqual(plan.lanes.e2e.specs, [spec]);
    const commands = commandsForLane({ lane: 'e2e', plan, prebuilt: true });
    assert.equal(commands.length, 1);
    assert.ok(commands[0].startsWith('PLAYWRIGHT_STATIC=1 node scripts/ci/run-playwright-ci.mjs '), commands[0]);
    assert.ok(commands[0].includes(` --only=${spec.replace('tests/e2e/', '')}`), commands[0]);
  }
});

test('unsafe spec paths never become browser command arguments', () => {
  for (const path of [
    '/tests/e2e/outside.spec.ts',
    'tests/e2e/../outside.spec.ts',
    'tests/e2e/gray-area/./gray-area.spec.ts',
    'tests/e2e/gray-area//gray-area.spec.ts',
    'tests/e2e/gray area/gray-area.spec.ts',
    'tests/e2e/gray-area/;echo-injected.spec.ts',
  ]) {
    const plan = buildImpactPlan({ files: [path] });
    assert.ok(['smoke', 'full'].includes(plan.lanes.e2e.mode), path);
    assert.deepEqual(plan.lanes.e2e.specs, [], path);
    for (const command of commandsForLane({ lane: 'e2e', plan, prebuilt: true })) {
      assert.ok(!command.includes(path), command);
    }
  }
});

test('Playwright helpers and configuration run the merge smoke set and both surfaces, not the full suite', () => {
  for (const path of ['tests/e2e/global-setup.ts', 'playwright.config.ts']) {
    const plan = buildImpactPlan({ files: [path] });
    assert.equal(plan.lanes.e2e.mode, 'smoke');
    assert.deepEqual(plan.lanes.e2e.unmappedPaths, [path]);
    assert.equal(plan.lanes.e2e.staticExport, true);
    assert.equal(plan.lanes.e2e.webSurface, true);
  }
});

test('dedicated static and web jobs own their exact specs without suite duplication', () => {
  const staticPlan = buildImpactPlan({
    files: ['src/features/ontology-change-review/ui/OntologyChangeReview.tsx'],
  });
  assert.equal(staticPlan.lanes.e2e.staticExport, true);
  // The source change still runs the merge smoke set on the shards, never the delegated spec.
  assert.equal(staticPlan.lanes.e2e.mode, 'smoke');
  assert.deepEqual(staticPlan.lanes.e2e.specs, []);
  for (const command of commandsForLane({ lane: 'e2e', plan: staticPlan, shard: '1/8', prebuilt: true })) {
    assert.doesNotMatch(command, /contextual-meaning-editor/);
  }

  const webPlan = buildImpactPlan({ files: ['src-tauri/src/lib.rs'] });
  assert.equal(webPlan.lanes.e2e.webSurface, true);
  assert.equal(webPlan.lanes.e2e.mode, 'skip');
});

/*
 * A Tauri sync command that panics takes the app down, so the Rust lint (clippy with unwrap, slice
 * indexing and panic as findings, plus rustfmt) must run whenever Rust changes. Only the Windows
 * beta job has a Tauri toolchain, so the planner must name the command for the change yet keep it
 * out of every Linux lane, and that workflow must run the same commands on the same paths.
 */
test('the Rust lint is suggested for Rust changes, left out of every Linux lane, and run by the Windows beta job', () => {
  const changes = [
    'src-tauri/src/vault/write.rs',
    'src-tauri/crates/vault-index/src/lib.rs',
    'src-tauri/Cargo.toml',
    'src-tauri/clippy.toml',
  ];
  for (const path of changes) {
    const named = suggestFocusedChecks([path]).commands.map((row) => row.command);
    assert.ok(named.includes(RUST_LINT_COMMAND), `${path} must name the Rust lint`);
    const plan = buildImpactPlan({ files: [path] });
    for (const lane of ['gates', 'unit', 'mcp']) {
      for (const command of commandsForLane({ lane, plan, base: 'abc123', platform: 'linux' })) {
        assert.notEqual(command, RUST_LINT_COMMAND, `${path} would run the Rust lint on the ${lane} lane`);
      }
    }
  }
  assert.deepEqual(NATIVE_TOOLCHAIN_COMMANDS, [RUST_LINT_COMMAND]);
  assert.ok(
    !suggestFocusedChecks(['src/features/ontology-change-review/ui/OntologyChangeReview.tsx']).commands.some(
      (row) => row.command === RUST_LINT_COMMAND,
    ),
    'a web change does not ask for the Rust lint',
  );

  const workflow = readFileSync(new URL('../../.github/workflows/windows-beta-check.yml', import.meta.url), 'utf8');
  const [clippy, format] = RUST_LINT_COMMAND.split(' && ').slice(1);
  const job = (name) => {
    const start = workflow.indexOf(`\n  ${name}:\n`);
    assert.ok(start > -1, `windows-beta-check.yml has no ${name} job`);
    const next = workflow.slice(start + 1).search(/\n  [A-Za-z][\w-]*:\n/);
    return next === -1 ? workflow.slice(start) : workflow.slice(start, start + 1 + next);
  };
  // Windows compiles the `windows` and `not(unix)` code, macOS the `unix` and macOS-only code.
  for (const name of ['verify-windows', 'lint-rust-macos']) {
    assert.ok(job(name).includes(`run: ${clippy}`), `${name} must run: ${clippy}`);
    assert.match(job(name), /components: clippy, rustfmt/);
    assert.ok(
      job(name).indexOf('run: pnpm mcp:build-binary') < job(name).indexOf(`run: ${clippy}`),
      `${name} builds the sidecar before the first cargo call`,
    );
  }
  assert.ok(job('lint-rust-macos').includes(`run: ${format}`), 'rustfmt runs on macOS');
  assert.match(job('lint-rust-macos'), /runs-on: macos-15/);
  for (const trigger of ['src-tauri/**', 'rust-toolchain.toml']) {
    assert.equal(workflow.split(`- "${trigger}"`).length - 1, 2, `pull_request and push both trigger on ${trigger}`);
  }

  // One toolchain everywhere: the file, the lint jobs and the release jobs agree, and none floats.
  const channel = /^channel = "([^"]+)"$/m.exec(readFileSync(new URL('../../rust-toolchain.toml', import.meta.url), 'utf8'))?.[1];
  assert.match(channel ?? '', /^\d+\.\d+\.\d+$/, 'rust-toolchain.toml pins an exact version');
  for (const file of ['release-macos.yml', 'windows-beta-check.yml']) {
    const text = readFileSync(new URL(`../../.github/workflows/${file}`, import.meta.url), 'utf8');
    const pins = [...text.matchAll(/^ +toolchain: (\S+)$/gm)].map((match) => match[1]);
    assert.ok(pins.length > 0, `${file} sets up Rust`);
    assert.deepEqual([...new Set(pins)], [channel], `${file} must use the toolchain ${channel}`);
  }
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
  for (const [path, browser] of [['new-runtime/entry.wasm', 'smoke'], ['scripts/ci/run-ci-lane.mjs', 'full'], ['scripts/ci/merge-smoke-specs.mjs', 'full']]) {
    const plan = buildImpactPlan({ files: [path] });
    assert.equal(plan.full, true);
    assert.equal(plan.lanes.unit.mode, 'full');
    assert.equal(plan.lanes.mcp.mode, 'full');
    // Only a planner change runs the whole browser suite before merge; the rest runs after it.
    assert.equal(plan.lanes.e2e.mode, browser, path);
    assert.equal(plan.lanes.e2e.staticExport, true);
    assert.equal(plan.lanes.e2e.webSurface, true);
  }
});

test('deletions still participate in rule mapping without becoming direct file arguments', () => {
  const plan = buildImpactPlan({
    deletedFiles: ['tests/contract/obsolete.contract.test.ts'],
  });

  assert.equal(plan.lanes.unit.contract, 'focused');
  assert.ok(!plan.lanes.unit.contractFiles.includes('tests/contract/obsolete.contract.test.ts'));
  for (const core of coreContractFiles()) assert.ok(plan.lanes.unit.contractFiles.includes(core), core);
});

test('the core contracts are the security and vault-format directories, and never empty', () => {
  assert.deepEqual([...CORE_CONTRACT_DIRECTORIES], ['tests/contract/security', 'tests/contract/vault-format']);
  const core = coreContractFiles();
  assert.ok(core.length >= 40, `the core measured ${core.length} files`);
  for (const directory of CORE_CONTRACT_DIRECTORIES) assert.ok(core.some((path) => path.startsWith(`${directory}/`)), directory);
  assert.deepEqual(coreContractFiles(() => ['a.contract.test.ts', 'notes.md', 'nested/b.contract.test.ts']), [
    'tests/contract/security/a.contract.test.ts',
    'tests/contract/security/nested/b.contract.test.ts',
    'tests/contract/vault-format/a.contract.test.ts',
    'tests/contract/vault-format/nested/b.contract.test.ts',
  ]);
});

test('knip runs before merge only when the analyzer itself changed', () => {
  assert.equal(buildImpactPlan({ files: ['src/shared/lib/cn.ts'] }).lanes.unit.knip, false);
  assert.equal(buildImpactPlan({ files: ['scripts/quality/dead-code/scope-configs.mjs'] }).lanes.unit.knip, true);
  assert.equal(buildImpactPlan({ files: ['package.json'] }).lanes.unit.knip, true, 'a full plan keeps it');
});

test('a contract the import graph reaches runs before merge; one it does not reach waits for main', () => {
  const unit = buildImpactPlan({ files: ['scripts/lib/parse-frontmatter.mjs'] }).lanes.unit;
  assert.ok(unit.contractFiles.includes('tests/contract/vault-format/parse-frontmatter.contract.test.ts'));
  const ui = buildImpactPlan({ files: ['src/views/download/ui/DownloadPage.tsx'] }).lanes.unit;
  assert.ok(!ui.contractFiles.includes('tests/contract/ci-gates/workflow-budgets.contract.test.ts'));
});

test('an exhaustive plan for a 5,000-file branch reaches lanes under the 128 KiB environment cap', () => {
  const files = ['package.json', ...Array.from({ length: 5_000 }, (_, index) => `src/features/area-${index % 40}/model/rule-number-${index}.ts`)];
  const plan = buildImpactPlan({ files });
  const encoded = encodeLanePlan(plan);
  assert.ok(encoded.length < 128 * 1024, `lane plan is ${encoded.length} bytes`);
  assert.deepEqual(decodePlan(encoded).lanes, plan.lanes);
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
  assert.ok(FULL_LANE_COMMANDS.gates.length > 0);
  assert.ok(FULL_LANE_COMMANDS.unit.length > 0);
  assert.ok(FULL_LANE_COMMANDS.mcp.length > 0);
});

test('dependency patches are known and run every exhaustive lane', () => {
  for (const file of ['patches/three@0.185.1.patch', 'patches/future-package@2.0.0.patch']) {
    const plan = buildImpactPlan({ files: [file] });
    assert.deepEqual(plan.unknownPaths, []);
    assert.equal(plan.full, true);
    assert.equal(plan.lanes.gates.run, true);
    // A dependency can move any screen: the whole browser suite runs before merge.
    for (const lane of ['unit', 'perf', 'mcp', 'e2e']) assert.equal(plan.lanes[lane].mode, 'full');
    assert.equal(plan.lanes.e2e.staticExport, true);
    assert.equal(plan.lanes.e2e.webSurface, true);
  }
});

test('every currently tracked path belongs to a known impact namespace', () => {
  const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
    .trim()
    .split('\n')
    .filter(Boolean);
  assert.ok(files.length > 0, 'tracked-path inventory is unexpectedly empty');
  assert.deepEqual(buildImpactPlan({ files }).unknownPaths, []);
});

test('the external judgment example is inventoried and runs its offline contract', () => {
  const files = execFileSync('git', ['ls-files', 'examples/external-judgment'], { encoding: 'utf8' })
    .trim().split('\n').filter(Boolean);
  assert.ok(files.length >= 2, 'the example inventory must contain its source and test');
  assert.ok(files.includes('examples/external-judgment/probe.mjs'));
  assert.ok(files.includes('examples/external-judgment/probe.test.mjs'));
  for (const path of files) {
    const plan = buildImpactPlan({ files: [path] });
    assert.deepEqual(plan.unknownPaths, []);
    assert.ok(plan.lanes.gates.commands.includes('pnpm test:guide-examples'), path);
  }
});

test('token, toc, and package gates reach the PRs that touch their inputs', () => {
  const tokens = buildImpactPlan({ files: ['app/globals.css'] });
  assert.ok(tokens.lanes.gates.commands.includes('pnpm check:tokens'));
  // The stylesheet lives in app/styles parts that app/globals.css imports; a
  // part-only change must plan the same token gate and styling sweep.
  const part = buildImpactPlan({ files: ['app/styles/tokens.css'] });
  assert.ok(part.lanes.gates.commands.includes('pnpm check:tokens'));
  assert.deepEqual(part.lanes.e2e.specs, ['tests/e2e/design-audits/overflow-sweep.spec.ts']);
  assert.equal(part.lanes.e2e.webSurface, true);

  const toc = buildImpactPlan({ files: ['docs/DESIGN-SYSTEM.md'] });
  assert.ok(toc.lanes.gates.commands.includes('pnpm design:toc:check'));

  const init = buildImpactPlan({ files: ['cli/src/lib/init/run-init.mjs'] });
  assert.ok(init.lanes.gates.commands.includes('pnpm test:cli'));
});

test('per-file lint carries the warning ratchet', () => {
  const plan = buildImpactPlan({ files: ['src/shared/lib/cn.ts'] });
  const lint = plan.lanes.gates.commands.find((command) => command.includes('exec eslint'));
  assert.ok(lint, 'changed source must plan a lint command');
  assert.match(lint, /--max-warnings 0/);
});

test('every non-test source file reaches the browser; its own tests do not', () => {
  for (const file of [
    'src/widgets/ontology-map/ui/input/topology-pointer-handlers.ts',
    // A model module can break first run or sending as surely as a component.
    'src/entities/vault-session/model/local-vault/vault-starter.ts',
    'src/widgets/acp-chat-panel/model/use-vault-agent-runtime.ts',
    'app/[locale]/layout.tsx',
  ]) {
    assert.ok(['smoke', 'targeted'].includes(buildImpactPlan({ files: [file] }).lanes.e2e.mode), file);
  }
  for (const file of ['src/shared/lib/cn.test.ts', 'src/widgets/acp-chat-panel/ui/AcpChatPanel.test.tsx']) {
    assert.equal(buildImpactPlan({ files: [file] }).lanes.e2e.mode, 'skip', file);
  }
});

test('MCP-spawning smokes raise the needsMcp flag', () => {
  const plan = buildImpactPlan({ files: ['scripts/dogfood/smoke-clean-onboarding.mjs'] });
  if (plan.lanes.gates.commands.includes('pnpm smoke:onboarding')) {
    assert.equal(plan.lanes.gates.needsMcp, true);
  } else {
    assert.fail('smoke:onboarding must stay planned for its own script');
  }
});

test('a script test whose imports reach mcp/src raises the needsMcp flag', () => {
  // walk.test.mjs loads mcp/src/ontology-engine.mjs, which needs packages from
  // mcp/node_modules; without the flag the lane never installs them.
  const plan = buildImpactPlan({ files: ['scripts/lib/dogfood-walk/walk.test.mjs'] });
  assert.ok(plan.lanes.gates.commands.includes('pnpm exec node --test scripts/lib/dogfood-walk/walk.test.mjs'));
  assert.equal(plan.lanes.gates.needsMcp, true);

  const unrelated = buildImpactPlan({ files: ['scripts/ci/run-with-retry.mjs'] });
  assert.equal(unrelated.lanes.gates.needsMcp, false);
});

test('the Playwright setup action is planner surface and forces the full plan', () => {
  const plan = buildImpactPlan({ files: ['.github/actions/setup-playwright/action.yml'] });
  assert.equal(plan.full, true);
});

test('a merge group builds every lane and says why', () => {
  // A merge group stacks pull requests on today's main, so the combination has
  // no prior evidence at all. Narrowing it to one pull request's paths would
  // test the part and merge the whole.
  const plan = decide({
    base: 'aaaaaaa',
    head: 'bbbbbbb',
    files: ['README.md'],
    eventName: 'merge_group',
  });
  assert.equal(plan.full, true);
  assert.match(plan.reason, /merge group/);
  assert.equal(plan.lanes.unit.mode, 'full');
  assert.equal(plan.lanes.mcp.mode, 'full');
  assert.equal(plan.lanes.e2e.mode, 'full');
  assert.equal(plan.lanes.e2e.staticExport, true);
  assert.equal(plan.lanes.e2e.webSurface, true);
});

 test('push with a verified comparison uses the same scope as a PR', () => {
  const plan = decide({base:'before', head:'after', files:['README.md'], eventName:'push'});
  assert.equal(plan.full, false);
  assert.equal(plan.lanes.unit.mode, 'focused');
  assert.equal(plan.lanes.e2e.mode, 'skip');
  assert.equal(decide({base:null, head:'after', eventName:'push'}).full, true);
});

test('the Checks post-merge push runs the full set; a compared manual run plans like a PR', () => {
  const merged = decide({base:'before', head:'after', files:['README.md'], eventName:'push', mainPushFull:true});
  assert.equal(merged.full, true);
  assert.match(merged.reason, /post-merge/);
  assert.equal(merged.lanes.unit.knip, true);
  assert.equal(merged.lanes.unit.contract, 'full');
  const compared = decide({base:'before', head:'after', files:['README.md'], eventName:'workflow_dispatch'});
  assert.equal(compared.full, false);
  assert.equal(decide({base:null, head:'after', eventName:'workflow_dispatch'}).full, true);
});

test('push entrypoint uses the exact ancestor and fails closed for missing or unrelated history', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const { join } = await import('node:path');
  const cwd = mkdtempSync(join(tmpdir(), 'atlas-push-plan-'));
  try {
    const git = (...args) => execFileSync('git', args, { cwd, encoding:'utf8', stdio:['ignore','pipe','pipe'] }).trim();
    git('init'); git('config','user.email','test@example.com'); git('config','user.name','Test');
    writeFileSync(join(cwd,'README.md'),'before'); git('add','.'); git('commit','-m','base');
    const before=git('rev-parse','HEAD');
    writeFileSync(join(cwd,'README.md'),'after'); git('add','.'); git('commit','-m','change');
    git('update-ref','refs/remotes/origin/main','HEAD');
    const script = new URL('./classify-change.mjs', import.meta.url).pathname;
    const run = (base) => execFileSync(process.execPath,[script,'--event=push'],{
      cwd, encoding:'utf8', env:{...process.env, GITHUB_OUTPUT:'', PUSH_BEFORE:base},
    });
    assert.match(run(before), /unit=skip perf=skip mcp=skip playwright=skip/, "a repository with no core contracts has nothing to run");
    const merged = execFileSync(process.execPath,[script,'--event=push','--main-push=full'],{
      cwd, encoding:'utf8', env:{...process.env, GITHUB_OUTPUT:'', PUSH_BEFORE:before},
    });
    assert.match(merged, /unit=full perf=full mcp=full playwright=full .*post-merge/, 'the Checks post-merge push must run the full set');
    assert.doesNotMatch(merged, /main-push reuse/, 'the post-merge push must not reuse the train\'s partial result');
    for (const base of ['', '0'.repeat(40), 'a'.repeat(40), git('commit-tree',git('rev-parse','HEAD^{tree}'),'-m','unrelated')]) {
      assert.match(run(base), /unit=full perf=full mcp=full playwright=full/);
    }
  } finally { rmSync(cwd,{recursive:true,force:true}); }
});

test('only the Checks workflow asks its planner for the full set after a merge', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (name) => readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
  const plan = read('checks').split('\n').find((line) => line.includes('node scripts/ci/classify-change.mjs'));
  assert.match(plan, /--main-push=full/, 'checks.yml plan step lost --main-push=full');
  assert.doesNotMatch(read('e2e'), /--main-push=full/);
  // On a push the merge base with origin/main is HEAD itself, and a ratchet compared with HEAD
  // can never fail; the post-merge run compares with the previous tip.
  assert.match(read('checks'), /^      DECISION_BASE_REF: \$\{\{ github\.event_name == 'push' && github\.event\.before \|\| needs\.plan\.outputs\.base \}\}$/m);
});

test('ratchets run for the files they count, and message parts reach their catalogue readers', () => {
  const ratchets = ratchetContractFiles();
  assert.ok(ratchets.includes('tests/contract/security/security-surfaces.contract.test.ts'));
  assert.ok(ratchets.includes('tests/contract/ci-gates/test-title-language.contract.test.ts'));
  const ui = buildImpactPlan({ files: ['src/views/download/ui/ScreensStage.tsx'] }).lanes.unit.contractFiles;
  for (const ratchet of ratchets) assert.ok(ui.includes(ratchet), ratchet);
  assert.ok(!buildImpactPlan({ files: ['README.md'] }).lanes.unit.contractFiles.some((path) => ratchets.includes(path) && !path.includes('/security/')));
  const part = buildImpactPlan({ files: ['messages/ko/library.json'] }).lanes.unit.contractFiles;
  const nonCore = part.filter((path) => !coreContractFiles().includes(path) && !ratchets.includes(path));
  assert.ok(nonCore.length > 10, `a message part reached only ${nonCore.length} catalogue readers`);
});

test('the forbidden-pattern contracts run before every merge', () => {
  const core = coreContractFiles();
  for (const path of FORBIDDEN_PATTERN_CONTRACTS) assert.ok(core.includes(path), `${path} is missing or left the core`);
  assert.ok(buildImpactPlan({ files: ['README.md'] }).lanes.unit.contractFiles.includes('tests/contract/copy/label-decoration.contract.test.ts'));
});

test('both workflows retain exhaustive triggers isolated from ordinary push cancellation', async () => {
  const { readFileSync } = await import('node:fs');
  const read = (name) => readFileSync(new URL(`../../.github/workflows/${name}.yml`, import.meta.url), 'utf8');
  for (const name of ['checks', 'e2e']) {
    assert.match(read(name), /^  schedule:\n    - cron:/m);
    assert.match(read(name), /^  workflow_dispatch:/m);
  }
  const checks = read('checks');
  assert.match(checks, /PUSH_BEFORE: \$\{\{ github\.event\.before \}\}/);
  const group = checks.split('\n').find((line) => line.startsWith('  group:'));
  assert.match(group, /github\.event_name == 'schedule'/);
  assert.match(group, /github\.event_name == 'workflow_dispatch'/);
  assert.match(group, /'full'? \|\|.*'change' \}\}$/);
  // The browser suite runs only on the schedule and dispatch, never cancelled; a dispatch that plans
  // from a named base gets its own group, so it never replaces a whole run waiting on the same ref.
  const e2eGroup = read('e2e').split('\n').find((line) => line.startsWith('  group:'));
  assert.match(e2eGroup, /inputs\.plan_from \|\| 'whole'/);
});

test('browser execution inputs promote only browser evidence, while shared routing remains exhaustive', () => {
  for (const file of ['scripts/data/playwright-file-durations.json', 'scripts/ci/run-playwright-ci.mjs']) {
    const plan=buildImpactPlan({files:[file]});
    assert.equal(plan.full,false);
    assert.equal(plan.lanes.e2e.mode,'full');
    assert.equal(plan.lanes.mcp.mode,'skip');
    assert.notEqual(plan.lanes.unit.mode,'full');
    assert.ok(!plan.lanes.gates.commands.includes('pnpm lint'));
    assert.ok(plan.lanes.gates.commands.includes('node --test scripts/ci/run-playwright-ci.test.mjs'));
  }
  assert.equal(buildImpactPlan({files:['scripts/data/playwright-file-durations.json']}).lanes.unit.affected,false);
  for (const file of ['scripts/ci/classify-change.mjs','scripts/ci/run-ci-lane.mjs','.github/workflows/checks.yml']) {
    assert.equal(buildImpactPlan({files:[file]}).full,true);
  }
});

test('unit distribution keeps all full file sweeps and avoids setup for empty focused shards', () => {
  assert.equal(unitUsesAllShards({mode:'full'}),true);
  assert.equal(unitUsesAllShards({mode:'affected',affected:true}),true);
  assert.equal(unitUsesAllShards({mode:'focused',contract:'full'}),true);
  assert.equal(unitUsesAllShards({mode:'focused',contract:'focused',affected:false}),false);
  assert.equal(unitUsesAllShards({mode:'skip',contract:'skip',affected:false}),false);
});

test('exhaustive architecture coverage is owned once across the three lanes', () => {
  assert.ok(!FULL_LANE_COMMANDS.gates.includes('pnpm test:architecture'));
  for(const command of ['pnpm package:check']) assert.ok(FULL_LANE_COMMANDS.gates.includes(command));
  for(const command of ['pnpm test:mcp:unit','pnpm integration:mcp']) assert.ok(FULL_LANE_COMMANDS.mcp.includes(command));
  assert.ok(FULL_LANE_COMMANDS.unit.includes('pnpm test:run'));
});

/*
 * The performance ratios get a runner of their own (`checks.yml`, `perf`), so the plan says when
 * that runner is worth starting: only when a changed path could sit in a measurement file's
 * import graph, which Vitest then resolves with `--changed`.
 */
test('the perf lane starts only for code a measurement could import, and on every full plan', () => {
  const mode = (options) => buildImpactPlan(options).lanes.perf.mode;
  assert.equal(mode({ files: ['src/shared/lib/search-match/node-name-match.ts'] }), 'affected');
  assert.equal(mode({ files: ['src/shared/lib/library/source-units.perf.test.ts'] }), 'affected');
  // The import graph decides, wherever the imported code lives.
  assert.equal(mode({ files: ['tests/helpers/work-clock.ts'] }), 'affected');
  // No measurement imports the script server: it answers over stdio, and a contract starts it.
  assert.equal(mode({ files: ['mcp/src/library/wiki-schema.mjs'] }), 'skip');
  assert.equal(mode({ files: ['app/[locale]/page.tsx'] }), 'skip');
  assert.equal(mode({ files: ['src/shared/lib/cn.test.ts'] }), 'skip');
  assert.equal(mode({ files: ['docs/DESIGN-SYSTEM.md'] }), 'skip');
  assert.equal(mode({ files: ['mcp/src/schema.mjs'] }), 'skip');
  assert.equal(mode({ files: ['tests/contract/ci-gates/workflow-budgets.contract.test.ts'] }), 'skip');
  // A vanished module is in nobody's import graph, so `--changed` could not find its users.
  assert.equal(mode({ files: [], deletedFiles: ['src/shared/lib/search-match/hangul-match.ts'] }), 'full');
  // The Vitest configuration decides what the perf project is.
  assert.equal(mode({ files: ['vitest.config.ts'] }), 'full');
  assert.equal(mode({ files: [], forceFull: true }), 'full');
  // The plan survives the encode/validate round trip the workflow performs.
  const plan = buildImpactPlan({ files: ['src/shared/lib/search-match/node-name-match.ts'] });
  assert.equal(decodePlan(encodePlan(plan)).lanes.perf.mode, 'affected');
  assert.throws(
    () => decodePlan(encodePlan({ ...plan, lanes: { ...plan.lanes, perf: { mode: 'sometimes' } } })),
    /perf verdict/,
  );
});

test('CI regression-test edits run their checks without promoting unrelated product lanes', () => {
  for (const file of [
    'scripts/ci/classify-change.test.mjs', 'scripts/ci/run-ci-lane.test.mjs',
    'scripts/lib/ci/focused-check-suggestions.test.mjs', 'scripts/lib/import-graph/test-reach.test.mjs',
    'scripts/ci/run-playwright-ci.test.mjs', 'scripts/web/serve-static-export.test.mjs',
  ]) {
    const plan = buildImpactPlan({ files: [file] });
    assert.equal(plan.full, false, file);
    assert.notEqual(plan.lanes.unit.mode, 'full', file);
    for (const lane of ['perf', 'mcp', 'e2e']) assert.equal(plan.lanes[lane].mode, 'skip', `${file}: ${lane}`);
    assert.equal(plan.lanes.e2e.staticExport, false, file);
    assert.equal(plan.lanes.e2e.webSurface, false, file);
    assert.ok(plan.lanes.gates.commands.some((command) => command.includes(file) && command.includes('node --test')), file);
    const implementation = file.replace('.test.mjs', '.mjs');
    // The planner and the browser executor run the whole suite; the static server reaches it broadly.
    const browser = implementation === 'scripts/web/serve-static-export.mjs' ? 'smoke' : 'full';
    const runtime = buildImpactPlan({ files: [implementation] });
    assert.equal(runtime.lanes.e2e.mode, browser, implementation);
    const mixed = buildImpactPlan({ files: [file, implementation] });
    assert.equal(mixed.lanes.e2e.mode, browser, `${implementation} with its test`);
  }
});

test('every push to main runs the browser suite in full, even over a reused reviewed tree', () => {
  const reused = reuseReviewedMainPlan(buildImpactPlan({ files: ['src/views/x/ui/view.tsx'] }), {
    skip: true, commit: 'a'.repeat(40), tree: 'b'.repeat(40), reviewedHead: 'c'.repeat(40), pullRequest: 7,
  }, { eventName: 'push', base: 'd'.repeat(40), head: 'a'.repeat(40) });
  assert.equal(reused.lanes.e2e.mode, 'skip');
  const after = fullBrowserAfterMerge(reused, { eventName: 'push' });
  assert.deepEqual(after.lanes.e2e, { mode: 'full', specs: [], unmappedPaths: [], staticExport: true, webSurface: true });
  assert.equal(after.lanes.unit.mode, 'skip', 'only the browser lane runs again');
  assert.doesNotThrow(() => validatePlan(after));
  const pr = buildImpactPlan({ files: ['src/views/x/ui/view.tsx'] });
  assert.equal(fullBrowserAfterMerge(pr, { eventName: 'pull_request' }), pr, 'a pull request keeps its narrow plan');
});

test('root dependencies plan the whole browser suite before merge', () => {
  for (const file of ['package.json', 'pnpm-lock.yaml', 'patches/three@0.185.1.patch']) {
    const plan = buildImpactPlan({ files: [file] });
    assert.equal(plan.lanes.e2e.mode, 'full', file);
    assert.equal(plan.lanes.e2e.staticExport, true, file);
    assert.equal(plan.lanes.e2e.webSurface, true, file);
  }
});

test('reproduced: a vault edit plans the MCP tests that read the vault, so a moved `path:` turns the PR red', () => {
  // A fix that edits a node's `path:` was planned no MCP work, and `detect-drift.test.mjs` failed on main.
  const plan = buildImpactPlan({ files: ['docs/ontology/capabilities/gray-area-discovery.md'] });
  assert.deepEqual(plan.lanes.mcp, {
    mode: 'focused',
    commands: ['pnpm exec node --test mcp/src/drift/detect-drift.test.mjs mcp/src/project-meaning/project-meaning-receipt.test.mjs'],
  });
});

test('every plan audits vault paths, because a move anywhere can break one', () => {
  for (const files of [['scripts/landing/pr-land.mjs'], ['docs/FEATURES.md'], ['src/widgets/acp-chat-panel/ui/AcpPermissionCard.tsx']]) {
    assert.ok(buildImpactPlan({ files }).lanes.gates.commands.includes('pnpm vault:audit'), files[0]);
  }
  assert.deepEqual(reuseReviewedMainPlan(buildImpactPlan({ files: ['README.md'] }), {
    skip: true, commit: 'c'.repeat(40), tree: 'd'.repeat(40), reviewedHead: 'e'.repeat(40), pullRequest: 1,
  }, { eventName: 'push', base: 'b'.repeat(40), head: 'c'.repeat(40) }).lanes.gates.commands, [], 'a reused tree runs nothing again');
});

test('tsconfig and every script the browser build runs are broad browser inputs', () => {
  const build = browserBuildFiles();
  for (const path of ['scripts/web/next-build.mjs', 'scripts/web/localize-html-lang.mjs', 'scripts/docs-vault/build-docs-vault.mjs', 'scripts/i18n/build-messages.mjs', 'scripts/prepare-worktree.mjs']) {
    assert.ok(build.includes(path), path);
  }
  for (const path of ['tsconfig.json', 'scripts/web/next-build.mjs', 'scripts/docs-vault/build-docs-vault.mjs']) {
    const { e2e } = buildImpactPlan({ files: [path] }).lanes;
    assert.deepEqual([e2e.mode, e2e.staticExport, e2e.webSurface], ['smoke', true, true], path);
  }
  assert.equal(buildImpactPlan({ files: ['scripts/landing/pr-land.mjs'] }).lanes.e2e.mode, 'skip');
});
