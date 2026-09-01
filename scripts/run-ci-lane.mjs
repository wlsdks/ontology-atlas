#!/usr/bin/env node
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

export function commandsForLane({
  lane,
  plan,
  base,
  shard = '1/3',
  eventName = 'pull_request',
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
    return unique(commands);
  }

  if (lane === 'unit') {
    const unit = plan.lanes.unit;
    if (unit.mode === 'full') return [...FULL_LANE_COMMANDS.unit];
    const commands = [];
    if (unit.knip) commands.push('pnpm knip');
    if (unit.affected) {
      if (!base) throw new Error('affected Vitest lane requires a comparison base');
      commands.push(
        `pnpm exec vitest run --changed=${shellArgument(base)} --exclude='tests/contract/**' --passWithNoTests`,
      );
    }
    if (unit.contract === 'full') commands.push('pnpm exec vitest run tests/contract');
    if (unit.contract === 'focused') {
      commands.push(`pnpm exec vitest run ${unit.contractFiles.join(' ')}`);
    }
    commands.push(...unit.extraCommands);
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
    if (!/^[1-9]\d*\/[1-9]\d*$/.test(shard)) {
      throw new Error(`invalid Playwright shard: ${shard}`);
    }
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
    const result = spawn(command, { cwd, env, shell: true, stdio: 'inherit' });
    const status = result.status ?? 1;
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
