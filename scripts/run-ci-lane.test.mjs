import assert from 'node:assert/strict';
import test from 'node:test';

import { buildImpactPlan } from './classify-change.mjs';
import { commandsForLane, runCommands } from './run-ci-lane.mjs';

test('affected unit lane uses the module graph and keeps filesystem contracts separate', () => {
  const plan = buildImpactPlan({
    files: ['src/widgets/docs-vault/ui/DocsVaultEditor.tsx'],
  });
  const commands = commandsForLane({ lane: 'unit', plan, base: 'abc123' });

  assert.ok(commands.includes('pnpm knip'));
  assert.ok(
    commands.includes(
      "pnpm exec vitest run --changed='abc123' --exclude='tests/contract/**' --passWithNoTests",
    ),
  );
  assert.ok(commands.includes('pnpm exec vitest run tests/contract'));
  assert.equal(commands.filter((command) => command.includes('tests/contract')).length, 2);
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
    'pnpm build && PLAYWRIGHT_STATIC=1 pnpm exec playwright test --project=smoke --shard=2/3',
  ]);
});

test('main plan retains the exhaustive Playwright sweep', () => {
  const plan = buildImpactPlan({ files: [], forceFull: true });
  assert.deepEqual(commandsForLane({ lane: 'e2e', plan, shard: '3/3' }), [
    'pnpm build && PLAYWRIGHT_STATIC=1 pnpm exec playwright test --shard=3/3',
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
  });
  assert.ok(
    commands.includes(
      "pnpm exec vitest run --changed='origin/main'\"'\"'; echo injected; '\"'\"'' --exclude='tests/contract/**' --passWithNoTests",
    ),
  );

  const smoke = buildImpactPlan({ files: ['src/widgets/search-hint/ui/SearchHint.tsx'] });
  assert.throws(
    () => commandsForLane({ lane: 'e2e', plan: smoke, shard: '1/3; echo injected' }),
    /invalid Playwright shard/,
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
