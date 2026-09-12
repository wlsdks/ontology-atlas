#!/usr/bin/env node
import { appendFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

import { decodePlan, FULL_LANE_COMMANDS } from './classify-change.mjs';

function unique(values) {
  return [...new Set(values)];
}

function shellArgument(value) {
  if (value.includes('\0')) throw new Error('CI comparison contains a NUL byte');
  return `'${value.replaceAll("'", `'"'"'`)}'`;
}

function planFromEnvironment(env = process.env) {
  return decodePlan(env.CI_IMPACT_PLAN);
}

/**
 * Gate commands that compile the Tauri crate, which the Linux gates runner cannot do.
 *
 * `checks.yml` runs the gates lane on ubuntu with Node only: no GTK, WebKitGTK or glib
 * headers, so `cargo test` on `src-tauri` dies in `glib-sys`'s build script before a single
 * test runs (measured 2026-09-05 on PR #1445 and on the main push for #1442, both of which
 * touched `src-tauri/src/lib.rs`). The bridge contract is still executed where a Tauri
 * toolchain exists: the Windows beta job runs the crate's tests on every `src-tauri/**`
 * change, and the macOS release rehearsal runs `test:desktop:bridge` before a tag. Dropping
 * the command here on a non-macOS host is therefore a routing decision, not a skipped gate,
 * and the runner says so in its log instead of failing silently.
 */
export const MACOS_ONLY_GATE_COMMANDS = Object.freeze(['pnpm test:desktop:bridge']);

/** `"2/3"` -> `[2, 3]`, refusing anything that is not a shard. */
export function shardParts(shard) {
  if (!/^[1-9]\d*\/[1-9]\d*$/.test(String(shard))) {
    throw new Error(`invalid shard: ${shard}`);
  }
  const [index, total] = String(shard).split('/').map(Number);
  if (index > total) throw new Error(`shard ${shard} is out of range`);
  return [index, total];
}

export function commandsForLane({
  lane,
  plan,
  base,
  shard = '1/3',
  eventName = 'pull_request',
  platform = process.platform,
}) {
  if (!plan?.lanes?.[lane] && !['static', 'web', 'e2e'].includes(lane)) {
    throw new Error(`unknown CI lane: ${lane}`);
  }

  if (lane === 'gates') {
    const commands = plan.full
      ? [...FULL_LANE_COMMANDS.gates]
      : ['pnpm po:pilot -- --check', ...plan.lanes.gates.commands];
    if (eventName === 'pull_request' && base) {
      commands.splice(1, 0, `pnpm decisions:check -- --base=${shellArgument(base)}`);
    }
    return unique(
      platform === 'darwin'
        ? commands
        : commands.filter((command) => !MACOS_ONLY_GATE_COMMANDS.includes(command)),
    );
  }

  /**
   * The slowest job in PR CI, and the only one that was unsharded.
   *
   * Measured over the last 20 runs (2026-09-12): **437 s average, 705 s at the
   * tail**, against an 8-minute budget for the whole PR. Nothing in it was wasted
   * work — the impact plan already selects it — it was simply one runner doing all
   * of it. Both Vitest invocations take `--shard`, so three runners split the files
   * and the job's wall clock falls to roughly a third.
   *
   * What must **not** be sharded is everything that is not a Vitest file sweep:
   * `pnpm knip` walks the whole dependency graph and a third of the files would
   * report two thirds of the exports as unused. Those commands run on shard 1 and
   * the other shards say so in their log, the same way an inactive lane does.
   */
  if (lane === 'unit') {
    const unit = plan.lanes.unit;
    const [index, total] = shardParts(shard);
    const sharded = (command) => (total > 1 ? `${command} --shard=${index}/${total}` : command);
    const wholeGraphOnly = index === 1;
    if (unit.mode === 'full') {
      return FULL_LANE_COMMANDS.unit.flatMap((command) => {
        if (command === 'pnpm test:run') return [sharded('pnpm exec vitest run')];
        return wholeGraphOnly ? [command] : [];
      });
    }
    const commands = [];
    if (unit.knip && wholeGraphOnly) commands.push('pnpm knip');
    if (unit.affected) {
      if (!base) throw new Error('affected Vitest lane requires a comparison base');
      commands.push(
        sharded(
          `pnpm exec vitest run --changed=${shellArgument(base)} --exclude='tests/contract/**' --passWithNoTests`,
        ),
      );
    }
    if (unit.contract === 'full') commands.push(sharded('pnpm exec vitest run tests/contract'));
    if (unit.contract === 'focused') {
      // A focused list is already small; splitting it three ways pays three startups
      // to run a handful of files and two shards would have nothing to do.
      if (wholeGraphOnly) commands.push(`pnpm exec vitest run ${unit.contractFiles.join(' ')}`);
    }
    if (wholeGraphOnly) commands.push(...unit.extraCommands);
    return unique(commands);
  }

  if (lane === 'mcp') return [...plan.lanes.mcp.commands];

  if (lane === 'static') return ['pnpm test:e2e:static'];

  if (lane === 'web') {
    return [
      'pnpm build && PLAYWRIGHT_STATIC=1 pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts',
    ];
  }

  if (lane === 'e2e') {
    const e2e = plan.lanes.e2e;
    if (e2e.mode === 'targeted') {
      if (e2e.specs.length === 0) throw new Error('targeted Playwright plan has no specs');
      return [
        `pnpm build && PLAYWRIGHT_STATIC=1 pnpm exec playwright test ${e2e.specs.join(' ')}`,
      ];
    }
    shardParts(shard);
    if (e2e.mode === 'smoke') {
      return [
        `pnpm build && PLAYWRIGHT_STATIC=1 pnpm exec playwright test --project=smoke --shard=${shard}`,
      ];
    }
    if (e2e.mode === 'full') {
      return [
        `pnpm build && PLAYWRIGHT_STATIC=1 pnpm exec playwright test --shard=${shard}`,
      ];
    }
    return [];
  }

  throw new Error(`unknown CI lane: ${lane}`);
}

export function runCommands({
  commands,
  cwd = process.cwd(),
  env = process.env,
  spawn = spawnSync,
  stdout = process.stdout,
  stderr = process.stderr,
}) {
  const failures = [];
  for (const [index, command] of commands.entries()) {
    stdout.write(`\n[ci-lane] (${index + 1}/${commands.length}) ${command}\n`);
    const started = Date.now();
    const result = spawn(command, { cwd, env, shell: true, stdio: 'inherit' });
    const status = result.status ?? 1;
    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    stdout.write(`[ci-lane] ${status === 0 ? 'PASS' : 'FAIL'} ${seconds}s: ${command}\n`);
    if (env.GITHUB_STEP_SUMMARY) {
      const safe = command.replace(/[|`\r\n]/g, ' ');
      try { appendFileSync(env.GITHUB_STEP_SUMMARY, `- ${status === 0 ? 'PASS' : 'FAIL'} **${seconds}s**: ${safe}\n`); } catch { /* Reporting cannot change the gate verdict. */ }
    }
    if (status !== 0) failures.push({ command, status });
  }
  if (failures.length > 0) {
    stderr.write(
      `\n[ci-lane] ${failures.length} command(s) failed:\n` +
        failures.map(({ command, status }) => `  ${status}: ${command}`).join('\n') +
        '\n',
    );
    return 1;
  }
  stdout.write(`\n[ci-lane] ${commands.length} command(s) passed\n`);
  return 0;
}

export function runCiLane({ argv = process.argv.slice(2), env = process.env } = {}) {
  const lane = argv.find((arg) => arg.startsWith('--lane='))?.slice('--lane='.length);
  const base = argv.find((arg) => arg.startsWith('--base='))?.slice('--base='.length) || '';
  const shard = argv.find((arg) => arg.startsWith('--shard='))?.slice('--shard='.length) || '1/3';
  if (!lane) {
    process.stderr.write('[ci-lane] --lane is required\n');
    return 2;
  }
  try {
    const plan = planFromEnvironment(env);
    const commands = commandsForLane({
      lane,
      plan,
      base,
      shard,
      eventName: env.GITHUB_EVENT_NAME || 'pull_request',
    });
    if (lane === 'gates' && process.platform !== 'darwin') {
      const planned = commandsForLane({
        lane,
        plan,
        base,
        shard,
        eventName: env.GITHUB_EVENT_NAME || 'pull_request',
        platform: 'darwin',
      });
      for (const command of planned.filter((entry) => !commands.includes(entry))) {
        process.stdout.write(
          `[ci-lane] ${lane}: ${command} needs a Tauri toolchain and runs on the Windows beta job and the macOS release rehearsal instead of this ${process.platform} runner\n`,
        );
      }
    }
    if (commands.length === 0) {
      process.stdout.write(`[ci-lane] ${lane}: no affected command\n`);
      return 0;
    }
    return runCommands({ commands, env });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[ci-lane] ${message}\n`);
    return 2;
  }
}

if (process.argv[1]?.endsWith('run-ci-lane.mjs')) {
  process.exitCode = runCiLane();
}
