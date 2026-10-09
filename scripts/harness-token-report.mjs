#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

const DEFAULT_DAYS = 14;
const COMPACTION_SLACK = 1.1;

export async function summarizeTurns(lines) {
  const responses = new Map();
  for await (const line of lines) {
    if (!line.includes('"usage"')) continue;
    let entry;
    try { entry = JSON.parse(line); } catch { continue; }
    if (entry.type !== 'assistant' || !entry.message?.usage) continue;
    const { id, usage } = entry.message;
    const previous = responses.get(id);
    if (!previous || (usage.output_tokens ?? 0) >= (previous.output_tokens ?? 0)) responses.set(id, usage);
  }
  const summary = { turns: 0, context: 0, cacheRead: 0, cacheWrite: 0, output: 0, maxContext: 0, startContext: 0 };
  for (const usage of responses.values()) {
    const context = (usage.input_tokens ?? 0) + (usage.cache_read_input_tokens ?? 0) + (usage.cache_creation_input_tokens ?? 0);
    if (summary.turns === 0) summary.startContext = context;
    summary.turns += 1;
    summary.context += context;
    summary.cacheRead += usage.cache_read_input_tokens ?? 0;
    summary.cacheWrite += usage.cache_creation_input_tokens ?? 0;
    summary.output += usage.output_tokens ?? 0;
    summary.maxContext = Math.max(summary.maxContext, context);
  }
  return summary;
}

export function readBudget(root) {
  const settings = JSON.parse(readFileSync(join(root, '.claude/settings.json'), 'utf8'));
  const caps = {};
  const agentsDir = join(root, '.claude/agents');
  for (const name of readdirSync(agentsDir).filter((file) => file.endsWith('.md'))) {
    const turns = /^maxTurns:\s*(\d+)\s*$/m.exec(readFileSync(join(agentsDir, name), 'utf8'))?.[1];
    if (turns) caps[name.slice(0, -3)] = Number(turns);
  }
  return { window: settings.autoCompactWindow ?? null, caps };
}

function transcriptFiles(projectsDir, match, sinceMs) {
  const files = [];
  const recent = (path) => statSync(path).mtimeMs >= sinceMs;
  for (const project of readdirSync(projectsDir).filter((name) => name.includes(match))) {
    const projectDir = join(projectsDir, project);
    for (const entry of readdirSync(projectDir, { withFileTypes: true })) {
      const path = join(projectDir, entry.name);
      if (entry.isFile() && entry.name.endsWith('.jsonl') && recent(path)) files.push({ path, type: 'lead', description: '' });
      const subagents = join(path, 'subagents');
      if (!entry.isDirectory() || !existsSync(subagents)) continue;
      for (const name of readdirSync(subagents).filter((file) => file.endsWith('.jsonl'))) {
        const file = join(subagents, name);
        if (!recent(file)) continue;
        const metaPath = file.replace(/\.jsonl$/, '.meta.json');
        const meta = existsSync(metaPath) ? JSON.parse(readFileSync(metaPath, 'utf8')) : {};
        files.push({ path: file, type: meta.agentType ?? 'subagent', description: meta.description ?? '' });
      }
    }
  }
  return files;
}

export async function collectRuns({ projectsDir, match, sinceMs }) {
  const runs = [];
  for (const file of transcriptFiles(projectsDir, match, sinceMs)) {
    const lines = createInterface({ input: createReadStream(file.path), crlfDelay: Infinity });
    const summary = await summarizeTurns(lines);
    if (summary.turns) runs.push({ ...file, ...summary });
  }
  return runs;
}

const compact = (n) => (n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}K` : `${n}`);
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)] ?? 0;

export function formatReport(runs, budget) {
  if (!runs.length) return ['[harness:tokens] no transcripts in range'];
  const total = runs.reduce((sum, run) => sum + run.context, 0);
  const byType = Map.groupBy(runs, (run) => run.type);
  const rows = [...byType].map(([type, group]) => {
    const turns = group.reduce((sum, run) => sum + run.turns, 0);
    const context = group.reduce((sum, run) => sum + run.context, 0);
    return {
      type, runs: group.length, turns, context,
      p50: median(group.map((run) => run.turns)), max: Math.max(...group.map((run) => run.turns)),
      perTurn: Math.round(context / turns), start: median(group.map((run) => run.startContext)),
      output: group.reduce((sum, run) => sum + run.output, 0),
    };
  }).sort((a, b) => b.context - a.context);
  const lines = [
    `[harness:tokens] ${runs.length} runs, ${compact(total)} context tokens processed, ${compact(runs.reduce((sum, run) => sum + run.output, 0))} output`,
    'type              runs  turns p50/max   ctx/turn   start   processed  share  output',
    ...rows.map((row) => [
      row.type.padEnd(16), String(row.runs).padStart(5), `${row.p50}/${row.max}`.padStart(13),
      compact(row.perTurn).padStart(10), compact(row.start).padStart(7), compact(row.context).padStart(11),
      `${((100 * row.context) / total).toFixed(1)}%`.padStart(6), compact(row.output).padStart(7),
    ].join(' ')),
  ];
  const overWindow = budget.window ? runs.filter((run) => run.maxContext > budget.window * COMPACTION_SLACK) : [];
  const overCap = runs.filter((run) => budget.caps[run.type] && run.turns > budget.caps[run.type]);
  lines.push(`window ${budget.window ? compact(budget.window) : 'unset'}: ${overWindow.length} runs grew past it` + (overWindow.length ? ` (largest ${compact(Math.max(...overWindow.map((run) => run.maxContext)))})` : ''));
  lines.push(`turn caps: ${overCap.length} runs over their type's maxTurns`);
  lines.push('costliest runs:');
  for (const run of [...runs].sort((a, b) => b.context - a.context).slice(0, 5)) {
    lines.push(`  ${compact(run.context).padStart(7)}  ${run.type} ${run.turns} turns, peak ${compact(run.maxContext)}${run.description ? ` — ${run.description}` : ''}`);
  }
  return lines;
}

function repositoryName(root) {
  const common = execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: root, encoding: 'utf8' }).trim();
  return basename(dirname(common));
}

async function main(argv) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const option = (name) => argv.find((arg) => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
  const since = option('since') ? Date.parse(option('since')) : Date.now() - DEFAULT_DAYS * 86_400_000;
  if (Number.isNaN(since)) throw new Error('--since takes a date such as 2026-10-01');
  const runs = await collectRuns({
    projectsDir: option('projects') ?? join(homedir(), '.claude/projects'),
    match: option('match') ?? repositoryName(root),
    sinceMs: since,
  });
  if (argv.includes('--json')) console.log(JSON.stringify(runs.map(({ path: _path, ...run }) => run), null, 2));
  else console.log(formatReport(runs, readBudget(root)).join('\n'));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(`[harness:tokens] ${error.message}`);
    process.exitCode = 1;
  });
}
