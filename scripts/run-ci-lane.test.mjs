import assert from 'node:assert/strict';
import test from 'node:test';

import { buildImpactPlan, FULL_LANE_COMMANDS, reuseReviewedMainPlan } from './classify-change.mjs';
import { commandsForLane, MACOS_ONLY_GATE_COMMANDS, runCommands } from './run-ci-lane.mjs';

test('verified main reuse emits no duplicate commands in any required lane', () => {
  const head = 'b'.repeat(40);
  const full = buildImpactPlan({ files: ['scripts/classify-change.mjs'] });
  const plan = reuseReviewedMainPlan(full, {
    skip: true, commit: head, tree: 'c'.repeat(40), reviewedHead: 'd'.repeat(40), pullRequest: 12,
  }, { eventName: 'push', base: 'a'.repeat(40), head });
  for (const lane of ['gates', 'unit', 'mcp', 'e2e', 'static', 'web']) {
    for (const shard of ['1/3', '2/3', '3/3']) {
      assert.deepEqual(commandsForLane({ lane, plan, shard, eventName: 'push' }), [], `${lane} ${shard}`);
    }
  }
  assert.ok(commandsForLane({ lane: 'gates', plan: full, eventName: 'push' }).length > 0);
});

test('affected unit lane uses the module graph and keeps filesystem contracts separate', () => {
  const plan = buildImpactPlan({
    files: ['src/widgets/docs-vault/ui/DocsVaultEditor.tsx'],
  });
  const commands = commandsForLane({ lane: 'unit', plan, base: 'abc123', shard: '1/3' });

  assert.ok(commands.includes('pnpm knip'));
  assert.ok(
    commands.includes(
      "pnpm exec vitest run --changed='abc123' --exclude='tests/contract/**' --passWithNoTests --shard=1/3",
    ),
  );
  assert.ok(commands.includes('pnpm exec vitest run tests/contract --shard=1/3'));
  assert.equal(commands.filter((command) => command.includes('tests/contract')).length, 2);
});

/**
 * The unit lane was 437 s average / 705 s at the tail and the only unsharded job in
 * PR CI (measured 2026-09-12). Sharding it is only safe if what gets split is a file
 * sweep: `pnpm knip` walks the whole dependency graph, and a third of the files would
 * report two thirds of the exports as unused.
 */
test('sharding the unit lane splits the file sweeps and keeps whole-graph checks on shard 1', () => {
  const plan = buildImpactPlan({ files: ['src/widgets/docs-vault/ui/DocsVaultEditor.tsx'] });
  const of = (shard) => commandsForLane({ lane: 'unit', plan, base: 'abc123', shard });

  for (const shard of ['2/3', '3/3']) {
    const commands = of(shard);
    assert.ok(!commands.includes('pnpm knip'), `knip must not run on shard ${shard}`);
    assert.ok(commands.every((command) => command.includes(`--shard=${shard}`)));
    assert.ok(commands.includes(`pnpm exec vitest run tests/contract --shard=${shard}`));
  }

  // Every Vitest file the unsharded lane would have run is covered exactly once
  // across the three shards, and no shard is empty.
  for (const shard of ['1/3', '2/3', '3/3']) {
    assert.ok(of(shard).length > 0, `shard ${shard} has nothing to do`);
  }

  const full = buildImpactPlan({ files: [], forceFull: true });
  assert.deepEqual(commandsForLane({ lane: 'unit', plan: full, shard: '2/3' }), [
    'pnpm exec vitest run --shard=2/3',
  ]);
  assert.deepEqual(commandsForLane({ lane: 'unit', plan: full, shard: '1/3' }), [
    'pnpm knip',
    'pnpm exec vitest run --shard=1/3',
  ]);
});

test('a focused contract list is not split three ways', () => {
  // Three startups to run a handful of files, and two shards with nothing to do.
  const plan = buildImpactPlan({ files: ['docs/DESIGN-SYSTEM.md'] });
  if (plan.lanes.unit.contract !== 'focused') return;
  const second = commandsForLane({ lane: 'unit', plan, base: 'abc123', shard: '2/3' });
  assert.ok(second.every((command) => !command.includes('tests/contract/')));
});

test('targeted Playwright runs exact specs once without an empty shard', () => {
  const plan = buildImpactPlan({
    files: ['src/widgets/docs-vault/ui/DocsVaultEditor.tsx'],
  });
  const commands = commandsForLane({ lane: 'e2e', plan, shard: '1/3' });

  assert.equal(commands.length, 1);
  assert.match(commands[0], /docs-deeplink\.spec\.ts/);
  assert.match(commands[0], /document-scroll-lock\.spec\.ts/);
  assert.match(commands[0], /vault-truth-telling\.spec\.ts/);
  assert.doesNotMatch(commands[0], /--shard/);
});

test('unmapped browser work retains the PR smoke sweep and its shard', () => {
  const plan = buildImpactPlan({ files: ['src/widgets/search-hint/ui/SearchHint.tsx'] });
  assert.deepEqual(commandsForLane({ lane: 'e2e', plan, shard: '2/3' }), [
    'pnpm build && PLAYWRIGHT_STATIC=1 node scripts/run-playwright-ci.mjs --project=smoke --shard=2/3',
  ]);
});

test('main plan retains the exhaustive Playwright sweep', () => {
  const plan = buildImpactPlan({ files: [], forceFull: true });
  assert.deepEqual(commandsForLane({ lane: 'e2e', plan, shard: '3/3' }), [
    'pnpm build && PLAYWRIGHT_STATIC=1 node scripts/run-playwright-ci.mjs --shard=3/3 --exclude=contextual-meaning-editor.spec.ts --exclude=web-surface-smoke.spec.ts',
  ]);
});

test('a full self-verifying PR still runs the decision ledger gate', () => {
  const plan = buildImpactPlan({ files: ['scripts/run-ci-lane.mjs'] });
  const commands = commandsForLane({
    lane: 'gates',
    plan,
    base: 'origin/main',
    eventName: 'pull_request',
  });
  assert.ok(commands.includes("pnpm decisions:check -- --base='origin/main'"));
});

test('comparison refs remain one shell argument and malformed shards fail closed', () => {
  const plan = buildImpactPlan({ files: ['src/shared/lib/cn.ts'] });
  const commands = commandsForLane({
    lane: 'unit',
    plan,
    base: "origin/main'; echo injected; '",
    shard: '1/3',
  });
  assert.ok(
    commands.includes(
      "pnpm exec vitest run --changed='origin/main'\"'\"'; echo injected; '\"'\"'' --exclude='tests/contract/**' --passWithNoTests --shard=1/3",
    ),
  );

  const smoke = buildImpactPlan({ files: ['src/widgets/search-hint/ui/SearchHint.tsx'] });
  for (const lane of ['e2e', 'unit']) {
    assert.throws(
      () => commandsForLane({ lane, plan: smoke, base: 'abc123', shard: '1/3; echo injected' }),
      /invalid shard/,
      `${lane} accepted a malformed shard`,
    );
  }
  // A shard index past its total would silently run nothing.
  assert.throws(
    () => commandsForLane({ lane: 'unit', plan: smoke, base: 'abc123', shard: '4/3' }),
    /out of range/,
  );
});

test('the lane runner reports every independent failure', () => {
  const seen = [];
  const status = runCommands({
    commands: ['first', 'second', 'third'],
    stdout: { write() {} },
    stderr: { write() {} },
    spawn(command) {
      seen.push(command);
      return { status: command === 'second' ? 7 : 0 };
    },
  });

  assert.equal(status, 1);
  assert.deepEqual(seen, ['first', 'second', 'third']);
});

/*
 * The Linux gates runner has no GTK headers, so `cargo test` on the Tauri crate cannot even
 * build there (glib-sys, 2026-09-05). The bridge contract belongs to the hosts that own a
 * Tauri toolchain; on any other host it must leave the gates lane, and only it.
 */
test('the Tauri bridge gate leaves the gates lane on a host without a Tauri toolchain', () => {
  const plan = buildImpactPlan({ files: ['src-tauri/src/lib.rs'] });
  const onMac = commandsForLane({ lane: 'gates', plan, base: 'abc123', platform: 'darwin' });
  const onLinux = commandsForLane({ lane: 'gates', plan, base: 'abc123', platform: 'linux' });

  assert.ok(onMac.includes('pnpm test:desktop:bridge'), 'macOS keeps the bridge contract');
  assert.ok(!onLinux.includes('pnpm test:desktop:bridge'), 'Linux cannot compile the crate');
  assert.deepEqual(
    onMac.filter((command) => !MACOS_ONLY_GATE_COMMANDS.includes(command)),
    onLinux,
    'nothing but the toolchain-bound command may differ between hosts',
  );
});

test('a full plan keeps every full gate on Linux, because the bridge is not among them', () => {
  const plan = { full: true, lanes: { gates: { commands: [] } } };
  assert.deepEqual(
    commandsForLane({ lane: 'gates', plan, platform: 'linux' }),
    [...FULL_LANE_COMMANDS.gates],
  );
});

test('shared build consumers omit rebuilding and dedicated surface tests have a single owner', () => {
  const plan=buildImpactPlan({files:[],forceFull:true});
  for(const lane of ['static','web','e2e']) {
    const commands=commandsForLane({lane,plan,prebuilt:true});
    assert.ok(commands.length>0);
    assert.ok(commands.every((command)=>!command.includes('pnpm build')));
  }
  const e2e=commandsForLane({lane:'e2e',plan,prebuilt:true})[0];
  assert.match(e2e,/--exclude=web-surface-smoke.spec.ts/);
  const narrow={...plan,lanes:{...plan.lanes,e2e:{...plan.lanes.e2e,staticExport:false,webSurface:false}}};
  assert.doesNotMatch(commandsForLane({lane:'e2e',plan:narrow})[0],/--exclude/);
});
