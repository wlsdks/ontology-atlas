// @vitest-environment node
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { hookEventStep, scanHarness, type HarnessScanPort } from '@/entities/agent-files';

import facts from './harness-facts.json';

/**
 * `harness-facts.json` is this test's output: the app's own harness scanner run over the
 * repository's tracked files, and the Claude PreToolUse hooks run on each command the film shows.
 * The download page is a static export with no disk to read, so the film reads this file. When the
 * harness changes, this test fails with the diff; `pnpm exec vitest run src/views/download -u`
 * rewrites the file.
 */

const ROOT = process.cwd();

/** Only tracked files, so a local untracked skill or setting never reaches the published page. */
function trackedPort(): HarnessScanPort {
  const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
  const files = new Set(tracked);
  const dirs = new Map<string, Map<string, 'file' | 'directory'>>();
  const add = (dir: string, name: string, kind: 'file' | 'directory') => {
    const entries = dirs.get(dir) ?? new Map<string, 'file' | 'directory'>();
    if (!entries.has(name) || kind === 'directory') entries.set(name, kind);
    dirs.set(dir, entries);
  };
  for (const path of tracked) {
    const parts = path.split('/');
    for (let i = 0; i < parts.length; i += 1) {
      add(parts.slice(0, i).join('/'), parts[i]!, i === parts.length - 1 ? 'file' : 'directory');
    }
  }
  return {
    async listDir(relativePath) {
      const entries = dirs.get(relativePath);
      return entries ? [...entries].sort(([a], [b]) => a.localeCompare(b)).map(([name, kind]) => ({ name, kind })) : null;
    },
    async readText(relativePath) {
      if (!files.has(relativePath)) return null;
      const absolute = join(ROOT, relativePath);
      const text = readFileSync(absolute, 'utf8');
      return { text, lastModified: null, bytes: statSync(absolute).size };
    },
    async pathExists(relativePath) {
      return files.has(relativePath) || dirs.has(relativePath);
    },
  };
}

/** Commands the film sends at the gate. Whether each passes is decided below by the hooks themselves. */
const COMMANDS = [
  'git status',
  'pnpm typecheck',
  'git commit -m "fix: tidy"',
  'git push --force',
  'pnpm test',
  'git reset --hard',
  'git push origin fix/tidy',
  'npm publish',
  'gh pr merge 42',
] as const;

const SCRIPT_NAME = /([^/]+?)(?:\.[a-z]+)?$/;

function scriptName(path: string): string {
  return SCRIPT_NAME.exec(path)?.[1] ?? path;
}

/** Runs each Claude Bash PreToolUse hook on `command`; the first that denies is named. */
function blockedBy(command: string, bashHooks: readonly string[]): string | null {
  const input = JSON.stringify({ tool_name: 'Bash', tool_input: { command } });
  for (const path of bashHooks) {
    const run = spawnSync('bash', [join(ROOT, path)], { input, encoding: 'utf8', cwd: ROOT });
    if (run.status === 2 || /"permissionDecision"\s*:\s*"deny"/.test(run.stdout)) return scriptName(path);
  }
  return null;
}

async function gatherFacts() {
  const report = await scanHarness(trackedPort());
  const records = report.analysis.records;
  /* A skill is its directory, as the app's Harness tab lists it. */
  const skillDirs = new Set<string>();
  const instructions: Array<{ path: string; kind: string }> = [];
  for (const record of records) {
    if (record.kind === 'instructions' || record.kind === 'rules' || record.kind === 'agent') {
      instructions.push({ path: record.path, kind: record.kind });
    } else if (record.kind === 'skill') {
      const dir = /^(?:\.claude|\.agents)\/skills\/[^/]+/.exec(record.path)?.[0] ?? record.path;
      if (!skillDirs.has(dir)) {
        skillDirs.add(dir);
        instructions.push({ path: dir, kind: 'skill' });
      }
    }
  }

  const hooks: Array<{ name: string; config: string; events: string; step: string }> = [];
  for (const group of report.hookGroups) {
    for (const hook of group.hooks) {
      const path = hook.ref.path ?? hook.ref.command;
      const steps = [...new Set(hook.events.split(' · ').map(hookEventStep))];
      hooks.push({ name: scriptName(path), config: group.configPath, events: hook.events, step: steps[0]! });
    }
  }

  const settings = JSON.parse(readFileSync(join(ROOT, '.claude/settings.json'), 'utf8')) as {
    hooks?: Record<string, Array<{ matcher?: string; hooks?: Array<{ command?: string }> }>>;
  };
  const bashHooks = (settings.hooks?.PreToolUse ?? [])
    .filter((entry) => entry.matcher?.split('|').includes('Bash'))
    .flatMap((entry) => entry.hooks ?? [])
    .map((hook) => /\.claude\/hooks\/[^"' ]+/.exec(hook.command ?? '')?.[0])
    .filter((path): path is string => Boolean(path));

  return {
    instructions,
    hooks,
    checks: {
      scripts: [...report.checkScripts],
      gitHooks: report.gitHookFiles.filter((name) => !name.includes('.')),
      workflows: report.workflowFiles.map((path) => path.split('/').pop() ?? path),
    },
    gate: bashHooks.map(scriptName),
    commands: COMMANDS.map((command) => ({ command, blockedBy: blockedBy(command, bashHooks) })),
  };
}

describe('harness-facts.json', () => {
  it('is what the scanner and the hooks say about this repository now', async () => {
    const now = await gatherFacts();
    await expect(`${JSON.stringify(now, null, 2)}\n`).toMatchFileSnapshot('./harness-facts.json');
    expect(facts).toEqual(now);
  }, 30_000);
});
