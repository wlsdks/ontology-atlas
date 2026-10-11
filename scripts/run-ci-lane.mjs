#!/usr/bin/env node
import { appendFileSync, closeSync, mkdtempSync, openSync, readFileSync, rmSync } from 'node:fs';
import { spawn as spawnAsync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { decodePlan, FULL_LANE_COMMANDS, isRelatedSweep } from './classify-change.mjs';
import { collapseCoveredContractCommands } from './suggest-focused-checks.mjs';

/*
 * Measurement files never ride a shard: a ratio's result depends on which files land beside it.
 * The sweeps skip them here and the `perf` job (`checks.yml`) runs them alone.
 */
const MEASURED_LANES_EXCLUDED = "--project=contract-node --project=jsdom";

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
 * Gate commands that compile the Tauri crate, which the Linux gates runner cannot (no
 * GTK/WebKitGTK headers, so `glib-sys` fails). The bridge contract still runs on the Windows beta
 * job and the macOS release rehearsal, so dropping it here is routing, not a skipped gate.
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
  prebuilt = false,
}) {
  if (!plan?.lanes?.[lane] && !['static', 'web', 'e2e'].includes(lane)) {
    throw new Error(`unknown CI lane: ${lane}`);
  }
  if (plan.reusedFrom) return [];

  if (lane === 'gates') {
    const commands = plan.full
      ? [...FULL_LANE_COMMANDS.gates]
      : ['pnpm po:pilot -- --check', ...plan.lanes.gates.commands];
    if (eventName === 'pull_request' && base) {
      commands.splice(1, 0, `pnpm decisions:check -- --base=${shellArgument(base)}`);
    }
    return collapseCoveredContractCommands(unique(
      platform === 'darwin'
        ? commands
        : commands.filter((command) => !MACOS_ONLY_GATE_COMMANDS.includes(command)),
    ).map((command) => ({ command }))).commands.map((row) => row.command);
  }

  /**
   * Both Vitest invocations take `--shard`, so runners split the files. Do not shard what is not a
   * file sweep: `pnpm knip` walks the whole dependency graph. Those commands run on shard 1 and the
   * other shards say so in their log.
   */
  if (lane === 'unit') {
    const unit = plan.lanes.unit;
    const [index, total] = shardParts(shard);
    const sharded = (command) => (total > 1 ? `${command} --shard=${index}/${total}` : command);
    const wholeGraphOnly = index === 1;
    if (unit.mode === 'full') {
      return FULL_LANE_COMMANDS.unit.flatMap((command) => {
        if (command === 'pnpm test:run') {
          return [sharded(`pnpm exec vitest run ${MEASURED_LANES_EXCLUDED}`)];
        }
        return wholeGraphOnly ? [command] : [];
      });
    }
    const commands = [];
    if (unit.knip && wholeGraphOnly) commands.push('pnpm knip');
    if (unit.affected) {
      if (!base) throw new Error('affected Vitest lane requires a comparison base');
      commands.push(
        sharded(
          `pnpm exec vitest run --changed=${shellArgument(base)} --exclude='tests/contract/**' ${MEASURED_LANES_EXCLUDED} --passWithNoTests`,
        ),
      );
    }
    if (unit.contract === 'full') commands.push(sharded('pnpm exec vitest run tests/contract'));
    if (unit.contract === 'focused') {
      // A focused list is already small; splitting it three ways pays three startups
      // to run a handful of files and two shards would have nothing to do.
      if (wholeGraphOnly) commands.push(`pnpm exec vitest run ${unit.contractFiles.join(' ')}`);
    }
    for (const command of unit.extraCommands) {
      if (isRelatedSweep(command)) commands.push(sharded(`${command} ${MEASURED_LANES_EXCLUDED}`));
      else if (wholeGraphOnly) commands.push(command);
    }
    return unique(commands);
  }

  /*
   * The measurement files the unit sweeps skip, alone on their own runner. `affected` lets
   * Vitest's import graph choose which of them reach the change; `full` runs them all.
   */
  if (lane === 'perf') {
    const { mode } = plan.lanes.perf;
    if (mode === 'full') return ['pnpm test:perf'];
    if (mode === 'affected') {
      if (!base) throw new Error('affected perf lane requires a comparison base');
      return [`pnpm test:perf --changed=${shellArgument(base)} --passWithNoTests`];
    }
    return [];
  }

  if (lane === 'mcp') return [...plan.lanes.mcp.commands];

  const build = prebuilt ? '' : 'pnpm build && ';
  if (lane === 'static') return [prebuilt
    ? 'PLAYWRIGHT_STATIC=1 pnpm exec playwright test tests/e2e/contextual-meaning-editor.spec.ts'
    : 'pnpm test:e2e:static'];
  if (lane === 'web') return [
    `${build}PLAYWRIGHT_STATIC=1 pnpm exec playwright test tests/e2e/web-surface-smoke.spec.ts`,
  ];
  if (lane === 'e2e') {
    const e2e = plan.lanes.e2e;
    const dedicated = [
      ...(e2e.staticExport ? ['contextual-meaning-editor.spec.ts'] : []),
      ...(e2e.webSurface ? ['web-surface-smoke.spec.ts'] : []),
    ];
    if (e2e.mode === 'targeted') {
      if (e2e.specs.length === 0) throw new Error('targeted Playwright plan has no specs');
      const specs = e2e.specs.filter((file) => !dedicated.includes(file.split('/').at(-1)));
      return specs.length ? [`${build}PLAYWRIGHT_STATIC=1 pnpm exec playwright test ${specs.join(' ')}`] : [];
    }
    const [shardIndex] = shardParts(shard);
    if (e2e.mode === 'smoke' || e2e.mode === 'full') {
      const project = e2e.mode === 'smoke' ? ' --project=smoke' : '';
      const exclusions = dedicated.map((file) => ` --exclude=${file}`).join('');
      const sweep = `${build}PLAYWRIGHT_STATIC=1 node scripts/run-playwright-ci.mjs${project} --shard=${shard}${exclusions}`;
      const mapped = e2e.specs.filter((file) => !dedicated.includes(file.split('/').at(-1)));
      if (e2e.mode !== 'smoke' || shardIndex !== 1 || mapped.length === 0) return [sweep];
      return [sweep, `PLAYWRIGHT_STATIC=1 pnpm exec playwright test ${mapped.join(' ')} --project=post-merge --pass-with-no-tests --output=output/playwright/mapped-post-merge`];
    }
    return [];
  }

  throw new Error(`unknown CI lane: ${lane}`);
}

/**
 * Commands that read the tree and write nothing, long enough to run beside the rest of their
 * lane. `pnpm lint` was 108 of the gates lane's 210 serial seconds (train run 36285265924);
 * beside the other 57 commands it costs the lane nothing it was not already waiting for.
 */
export const CONCURRENT_COMMANDS = Object.freeze(['pnpm lint', 'pnpm licenses:check', 'pnpm notice:check']);

/** Start a command beside the serial ones, its output held in a file until it is reported. */
function startConcurrent(command, { cwd, env }) {
  const dir = mkdtempSync(join(tmpdir(), 'atlas-ci-lane-'));
  const file = join(dir, 'output.log');
  const fd = openSync(file, 'w');
  const started = Date.now();
  const child = spawnAsync(command, { cwd, env, shell: true, stdio: ['ignore', fd, fd] });
  closeSync(fd);
  const done = new Promise((resolve) => {
    child.once('error', () => resolve({ status: 1, finished: Date.now() }));
    child.once('close', (code) => resolve({ status: code ?? 1, finished: Date.now() }));
  });
  return done.then(({ status, finished }) => {
    const output = readFileSync(file, 'utf8');
    rmSync(dir, { recursive: true, force: true });
    return { status, output, started, finished };
  });
}

/**
 * One JSON line per command into `CI_LANE_REPORT`, for `pnpm gates:yield`. A report is evidence,
 * never the gate: a failed write says so on stderr and the lane result stays what the commands
 * made it.
 */
export function appendLaneReport({ env = process.env, record, appendFile = appendFileSync, stderr = process.stderr }) {
  if (!env.CI_LANE_REPORT) return;
  const line = {
    lane: record.lane ?? '',
    shard: record.shard ?? '',
    command: record.command,
    status: record.status,
    ms: record.ms ?? 0,
    sha: env.GITHUB_SHA || '',
    runId: env.GITHUB_RUN_ID || '',
  };
  try {
    appendFile(env.CI_LANE_REPORT, `${JSON.stringify(line)}\n`);
  } catch (error) {
    stderr.write(`[ci-lane] could not write lane report ${env.CI_LANE_REPORT}: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}

function runForeground(command, options) {
  return new Promise((resolve) => {
    const child = spawnAsync(command, options);
    child.once('error', () => resolve({ status: 1 }));
    child.once('close', (status) => resolve({ status }));
  });
}

export async function runCommands({
  commands,
  cwd = process.cwd(),
  env = process.env,
  spawn = runForeground,
  startBeside = startConcurrent,
  stdout = process.stdout,
  stderr = process.stderr,
  lane = '',
  shard = '',
  appendFile = appendFileSync,
}) {
  const failures = [];
  // The report belongs to this runner: a nested runner or a test that runs `runCommands`
  // must never append its own lines to the real CI report.
  const { CI_LANE_REPORT: _report, ...childEnv } = env;
  const report = (command, status, started, finished = Date.now()) => {
    appendLaneReport({
      env, appendFile, stderr,
      record: { lane, shard, command, status: status === 0 ? 'pass' : 'fail', ms: Math.round(finished - started) },
    });
    const seconds = ((finished - started) / 1000).toFixed(1);
    stdout.write(`[ci-lane] ${status === 0 ? 'PASS' : 'FAIL'} ${seconds}s: ${command}\n`);
    if (env.GITHUB_STEP_SUMMARY) {
      const safe = command.replace(/[|`\r\n]/g, ' ');
      try { appendFileSync(env.GITHUB_STEP_SUMMARY, `- ${status === 0 ? 'PASS' : 'FAIL'} **${seconds}s**: ${safe}\n`); } catch { /* Reporting cannot change the gate result. */ }
    }
    if (status !== 0) failures.push({ command, status });
  };
  const beside = commands.length > 1 ? commands.filter((command) => CONCURRENT_COMMANDS.includes(command)) : [];
  const running = beside.map((command) => {
    stdout.write(`\n[ci-lane] started beside the lane: ${command}\n`);
    return { command, result: startBeside(command, { cwd, env: childEnv }) };
  });
  const serial = commands.filter((command) => !beside.includes(command));
  for (const [index, command] of serial.entries()) {
    stdout.write(`\n[ci-lane] (${index + 1}/${serial.length}) ${command}\n`);
    const started = Date.now();
    const result = await spawn(command, { cwd, env: childEnv, shell: true, stdio: 'inherit' });
    report(command, result.status ?? 1, started);
  }
  for (const { command, result } of running) {
    const { status, output, started, finished } = await result;
    stdout.write(`\n[ci-lane] beside the lane: ${command}\n${output}`);
    report(command, status, started, finished);
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

export async function runCiLane({ argv = process.argv.slice(2), env = process.env } = {}) {
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
      prebuilt: env.PLAYWRIGHT_PREBUILT === '1',
    });
    if (lane === 'gates' && process.platform !== 'darwin') {
      const planned = commandsForLane({
        lane,
        plan,
        base,
        shard,
        eventName: env.GITHUB_EVENT_NAME || 'pull_request',
      prebuilt: env.PLAYWRIGHT_PREBUILT === '1',
        platform: 'darwin',
      });
      for (const command of planned.filter((entry) => !commands.includes(entry))) {
        appendLaneReport({ env, record: { lane, shard, command, status: 'skip', ms: 0 } });
        process.stdout.write(
          `[ci-lane] ${lane}: ${command} needs a Tauri toolchain and runs on the Windows beta job and the macOS release rehearsal instead of this ${process.platform} runner\n`,
        );
      }
    }
    if (commands.length === 0) {
      process.stdout.write(`[ci-lane] ${lane}: no affected command\n`);
      return 0;
    }
    return runCommands({ commands, env, lane, shard });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`[ci-lane] ${message}\n`);
    return 2;
  }
}

if (process.argv[1]?.endsWith('run-ci-lane.mjs')) {
  runCiLane().then((code) => { process.exitCode = code; });
}
