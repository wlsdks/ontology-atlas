#!/usr/bin/env node
/**
 * `pnpm harness:smoke` — prove the hooks on the runtimes that run them.
 *
 * **Why this exists.** On 2026-09-02 three hooks that every parity test called
 * green turned out to be silent on a real runtime: the Codex generated-file
 * guard could not read the payload Codex sends, the PreCompact census on both
 * trees reached no model, and the Codex census hook had been marked
 * "SessionStart Failed" on every session because its first line began with a
 * bracket. `scripts/claude-hooks.test.mjs` feeds each script a hand-written
 * payload; it cannot see what the runtime does with the script. Only the
 * runtime can, so this drives one short session per runtime and reads back
 * what fired, what failed, and whether the vault census actually reached the
 * model.
 *
 * **What one run does, per runtime.** One prompt: run `pnpm lint --version`,
 * then answer with the node count from the census. That exercises every wired
 * event in one turn: SessionStart (census), PreToolUse (the three blocks),
 * PostToolUse (the stamp), Stop (the reminder). The answer is compared with
 * the vault's real node count, which is the only proof that context arrived.
 *
 * **What it costs and where it runs.** One small model call per runtime, and
 * it needs the runtime installed and signed in, so it is a local check, never
 * CI. `pnpm harness:report` shows when it last passed, and calls an absent or
 * stale smoke out, because a hook nobody has watched fire is the dead gate
 * this repository keeps finding.
 *
 * Runtime notes, measured on codex-cli 0.151.0 and the Claude Code CLI:
 *   - Both are driven with stdin closed. `codex exec` blocks on an open
 *     non-TTY stdin ("Reading additional input from stdin...").
 *   - Codex runs a project hook only after `/hooks` trust; an untrusted hook
 *     shows up here as a count below the expected one, not as a failure.
 *   - Claude reports each hook as a `hook_response` event with `exit_code`
 *     and `outcome` on `--output-format stream-json --include-hook-events`;
 *     Codex prints `hook: <Event>` / `hook: <Event> Completed|Failed` lines.
 *   - Counts are lower bounds: user-level hooks (`~/.claude`, `~/.codex`) fire
 *     alongside the project's and cannot be told apart in either output.
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const SMOKE_PROMPT =
  'Run the shell command `pnpm lint --version`. Then answer with exactly one line ' +
  'containing only the node count from the ontology vault census you were given as ' +
  'context, or NONE if no such context was given.';

const EVENTS = ['SessionStart', 'PreToolUse', 'PostToolUse', 'Stop'];

/** Number of project hooks the prompt above must fire, per event. */
function expectedFromHooks(hooks, shellTool) {
  const groupsFor = (event) => (Array.isArray(hooks?.[event]) ? hooks[event] : []);
  const size = (group) => (Array.isArray(group?.hooks) ? group.hooks.length : 0);
  const matches = (group) =>
    typeof group?.matcher !== 'string' ||
    group.matcher.split('|').map((part) => part.trim()).includes(shellTool);
  const expected = {};
  for (const event of EVENTS) {
    const groups = groupsFor(event).filter(matches);
    // Several matcher groups can name the same shell tool; the runtime picks
    // one, so the lower bound is the smallest of them.
    expected[event] = groups.length === 0 ? 0 : Math.min(...groups.map(size));
  }
  return expected;
}

export const expectedFromClaudeSettings = (settings) => expectedFromHooks(settings?.hooks, 'Bash');
export const expectedFromCodexHooks = (config) => expectedFromHooks(config?.hooks, 'exec_command');

const ANSWER = /^(\d+|NONE)$/;

/** Claude Code `--output-format stream-json --include-hook-events` output. */
export function parseClaudeStream(text) {
  const events = Object.fromEntries(EVENTS.map((event) => [event, { count: 0, failed: [] }]));
  let answer = null;
  let sessionId = null;
  let censusSeen = false;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof row.session_id === 'string' && !sessionId) sessionId = row.session_id;
    if (row.type === 'system' && row.subtype === 'hook_response') {
      const bucket = events[row.hook_event];
      if (!bucket) continue;
      bucket.count += 1;
      if (row.exit_code !== 0 || row.outcome !== 'success') {
        bucket.failed.push(`${row.hook_name} exit=${row.exit_code} ${String(row.stderr ?? '').trim()}`.trim());
      }
      if (row.hook_event === 'SessionStart' && /Ontology vault: \d+ nodes/.test(String(row.stdout ?? ''))) {
        censusSeen = true;
      }
    }
    if (row.type === 'result' && typeof row.result === 'string') {
      const last = row.result.trim().split('\n').pop().trim();
      answer = ANSWER.test(last) ? last : row.result.trim();
    }
  }
  return { events, answer, sessionId, censusSeen };
}

/** `codex exec` human output: `hook: Event`, `hook: Event Completed|Failed`. */
export function parseCodexOutput(text) {
  const clean = text.replace(/\x1b\[[0-9;]*m/g, '');
  const events = Object.fromEntries(EVENTS.map((event) => [event, { count: 0, failed: [] }]));
  let answer = null;
  let sessionId = null;
  for (const raw of clean.split('\n')) {
    const line = raw.trim();
    const session = /^session id:\s*(\S+)/.exec(line);
    if (session) sessionId = session[1];
    const hook = /^hook:\s+(\w+)(?:\s+(Completed|Failed))?$/.exec(line);
    if (hook) {
      const bucket = events[hook[1]];
      if (!bucket) continue;
      if (hook[2] === 'Completed') bucket.count += 1;
      else if (hook[2] === 'Failed') bucket.failed.push(`${hook[1]} Failed`);
      continue;
    }
    if (ANSWER.test(line)) answer = line;
  }
  return { events, answer, sessionId, censusSeen: null };
}

/** Real node count of the dogfood vault, the number the census hands out. */
export function readVaultNodeCount(cwd = process.cwd()) {
  const result = spawnSync(process.execPath, ['cli/src/index.mjs', 'overview', 'docs/ontology', '--json'], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) return null;
  try {
    const overview = JSON.parse(result.stdout);
    const byKind = overview.byKind ?? {};
    return overview.graph?.nodes ?? Object.values(byKind).reduce((sum, n) => sum + n, 0);
  } catch {
    return null;
  }
}

/** One verdict per runtime, with every reason spelled out. */
export function judge({ runtime, observed, expected, nodeCount }) {
  const problems = [];
  for (const event of EVENTS) {
    const seen = observed.events[event];
    if (seen.failed.length > 0) problems.push(`${event}: ${seen.failed.join('; ')}`);
    if (seen.count < expected[event]) {
      problems.push(
        `${event}: ${seen.count} completed, project wiring expects at least ${expected[event]}` +
          (runtime === 'codex' ? ' (untrusted in /hooks?)' : ''),
      );
    }
  }
  if (observed.censusSeen === false) problems.push('SessionStart: no hook printed the vault census');
  if (nodeCount === null) problems.push('vault: could not read the node count to compare the answer');
  else if (observed.answer === null) problems.push('answer: the model gave no parsable node count');
  else if (String(observed.answer) !== String(nodeCount)) {
    problems.push(`answer: model said ${observed.answer}, the vault has ${nodeCount} nodes; the census did not reach it`);
  }
  return { runtime, ok: problems.length === 0, problems, events: observed.events, answer: observed.answer };
}

const RUNTIMES = {
  claude: {
    expected: (cwd) => expectedFromClaudeSettings(JSON.parse(readFileSync(join(cwd, '.claude/settings.json'), 'utf8'))),
    command: [
      'claude',
      ['-p', SMOKE_PROMPT, '--output-format', 'stream-json', '--verbose', '--include-hook-events', '--model', 'haiku', '--allowedTools', 'Bash(pnpm lint:*)'],
    ],
    parse: parseClaudeStream,
  },
  codex: {
    expected: (cwd) => expectedFromCodexHooks(JSON.parse(readFileSync(join(cwd, '.codex/hooks.json'), 'utf8'))),
    command: ['codex', ['exec', '--sandbox', 'read-only', '-c', 'model_reasoning_effort="low"', SMOKE_PROMPT]],
    parse: parseCodexOutput,
  },
};

function installed(bin) {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0;
}

/** The smoke session leaves ledger files under its own id; they are not data. */
function forgetSession(cwd, sessionId) {
  if (!sessionId) return;
  const safe = sessionId.replace(/[^\w-]/g, '');
  for (const suffix of ['edits', 'verified']) {
    rmSync(join(cwd, '.tmp', 'harness', `session-${safe}.${suffix}`), { force: true });
  }
}

function record(cwd, verdict, now) {
  try {
    const dir = join(cwd, '.tmp', 'harness');
    mkdirSync(dir, { recursive: true });
    appendFileSync(
      join(dir, 'smoke.jsonl'),
      JSON.stringify({ at: new Date(now).toISOString(), runtime: verdict.runtime, ok: verdict.ok, problems: verdict.problems }) + '\n',
    );
  } catch {
    /* a missed record costs one report line, never the verdict */
  }
}

export function runSmokeFor(runtime, { cwd = process.cwd(), now = Date.now(), spawn = spawnSync } = {}) {
  const spec = RUNTIMES[runtime];
  const [bin, args] = spec.command;
  if (!installed(bin)) return { runtime, ok: null, problems: [`${bin} is not installed here`], events: null, answer: null };
  const expected = spec.expected(cwd);
  const result = spawn(bin, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240_000, maxBuffer: 64 * 1024 * 1024 });
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  const observed = spec.parse(text);
  forgetSession(cwd, observed.sessionId);
  const verdict = judge({ runtime, observed, expected, nodeCount: readVaultNodeCount(cwd) });
  if (result.status !== 0) verdict.problems.unshift(`${bin} exited ${result.status ?? result.signal}`);
  verdict.ok = verdict.problems.length === 0;
  record(cwd, verdict, now);
  return verdict;
}

function parseArgs(argv) {
  const args = { json: false, runtimes: Object.keys(RUNTIMES) };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg.startsWith('--runtime=')) {
      const name = arg.slice('--runtime='.length);
      if (!RUNTIMES[name]) throw new Error(`unknown runtime ${name}; expected ${Object.keys(RUNTIMES).join(' or ')}`);
      args.runtimes = [name];
    } else if (arg !== '--') throw new Error(`unknown argument: ${arg}`);
  }
  return args;
}

function format(verdicts) {
  const lines = [];
  for (const v of verdicts) {
    if (v.ok === null) {
      lines.push(`[smoke] ${v.runtime}: skipped (${v.problems[0]})`);
      continue;
    }
    const counts = EVENTS.map((event) => `${event} ${v.events[event].count}`).join(' · ');
    lines.push(`[smoke] ${v.runtime}: ${v.ok ? 'ok' : 'FAILED'} · ${counts} · census answer ${v.answer ?? 'none'}`);
    for (const problem of v.problems) lines.push(`[smoke]   - ${problem}`);
  }
  return lines.join('\n');
}

export function runHarnessSmoke(argv, io = console) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    io.error(`[smoke] ${error.message}`);
    return 2;
  }
  if (!existsSync(join(process.cwd(), '.claude', 'settings.json'))) {
    io.error('[smoke] run from the repository root');
    return 2;
  }
  const verdicts = args.runtimes.map((runtime) => runSmokeFor(runtime));
  io.log(args.json ? JSON.stringify(verdicts, null, 2) : format(verdicts));
  return verdicts.some((v) => v.ok === false) ? 1 : 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exitCode = runHarnessSmoke(process.argv.slice(2));
}
