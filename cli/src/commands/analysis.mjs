// `ontology-atlas analysis [rootPath]` — write a dated analysis record and
// compare it with the last one.
//
// The record answers the question a count cannot: *what is worse than last time,
// and what should I look at first.* It is committed Markdown with no `kind:`, so
// it is versioned and readable in a diff without becoming reviewed meaning.
//
// It derives nothing itself. It runs this CLI's own `health`, `validate`, and
// `architecture` and turns their output into findings, because a second
// implementation of "what counts as a problem" is exactly how the insights
// surface once told people to fix 83 things that could not be fixed
// (docs/DECISIONS.md, 2026-08-16 (16)).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  collectFindings,
  diffFindings,
  parseFindings,
  renderAnalysis,
} from '../lib/analysis-findings.mjs';
import { COLORS } from '../lib/colors.mjs';
import { loadMcpModule } from '../lib/mcp-module.mjs';

const CLI_ENTRY = resolve(dirname(fileURLToPath(import.meta.url)), '../index.mjs');

// Beside the vault, not inside it.
//
// Inside, `validate` warns `missing-kind` on every record — and it is right to:
// a `kind:`-less file in a vault folder is usually a mistake, and teaching it an
// exception is a change to the vault contract. That change may well be worth
// making, because the app reads the vault folder and a record it cannot see
// cannot be shown in a tab. It is not this slice's to make: a vault-schema
// change is a council decision, and the point of this slice is to prove that
// two runs can be compared at all. So the record sits next to the vault, where
// it is committed and diffable and nothing has to be redefined.
const ANALYSES_DIRNAME = 'analyses';

function runCli(args) {
  const result = spawnSync(process.execPath, [CLI_ENTRY, ...args], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  if (!result.stdout?.trim()) return { ok: false, reason: result.stderr?.trim() || `no output from: ${args.join(' ')}` };
  try {
    return { ok: true, value: JSON.parse(result.stdout) };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : String(error) };
  }
}

function currentCommit(rootPath) {
  const result = spawnSync('git', ['-C', rootPath, 'rev-parse', '--short', 'HEAD'], { encoding: 'utf8' });
  return result.status === 0 ? result.stdout.trim() : null;
}

/** The newest record already on disk, which is what this run is compared against. */
export function findPreviousRecord(analysesDir, excludeName) {
  if (!existsSync(analysesDir)) return null;
  const names = readdirSync(analysesDir)
    .filter((name) => name.endsWith('.md') && name !== excludeName)
    .sort();
  const latest = names.at(-1);
  return latest ? { name: latest, path: join(analysesDir, latest) } : null;
}

export function recordName({ measuredAt, commit }) {
  const stamp = measuredAt.replace(/[:T]/g, '-').replace(/\..*$/, '');
  return `${stamp}${commit ? `-${commit}` : ''}.md`;
}

function archiveArguments(args) {
  const values = new Map();
  const positional = [];
  let history = false;
  let json = false;
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--history') { if (history) throw new Error('Repeated --history.'); history = true; continue; }
    if (argument === '--json') { json = true; continue; }
    if (!argument.startsWith('--')) { positional.push(argument); continue; }
    const equals = argument.indexOf('=');
    const name = equals < 0 ? argument : argument.slice(0, equals);
    if (!['--vault', '--record', '--mode', '--limit', '--cursor'].includes(name)) throw new Error(`Unsupported archive-read option: ${name}.`);
    if (values.has(name)) throw new Error(`Repeated ${name}.`);
    const value = equals < 0 ? args[++index] : argument.slice(equals + 1);
    if (!value || value.startsWith('--')) throw new Error(`${name} requires a value.`);
    values.set(name, value);
  }
  if (positional.length > 1) throw new Error('Archive reads accept at most one repository root.');
  const recordId = values.get('--record');
  if (history === (recordId !== undefined)) throw new Error('Choose --history or --record=<id>.');
  if (recordId && ['--mode', '--limit', '--cursor'].some((name) => values.has(name))) throw new Error('History filters require --history.');
  const root = resolve(positional[0] ?? process.cwd());
  return { vaultRoot: resolve(values.get('--vault') ?? join(root, 'docs/ontology')), recordId, json,
    historyOptions: { limit: Number(values.get('--limit') ?? 30), cursor: values.get('--cursor') ?? null, mode: values.get('--mode') ?? null } };
}

export async function runAnalysis(args) {
  const flags = new Set(args.filter((arg) => arg.startsWith('-')));
  if (flags.has('--help') || flags.has('-h')) {
    printUsage(process.stdout);
    return 0;
  }
  const allowed = new Set(['--vault', '--profile', '--out', '--json', '--dry-run', '--history', '--record', '--mode', '--limit', '--cursor']);
  const unknown = args.find((argument) => argument.startsWith('--') && !allowed.has(argument.split('=')[0]));
  if (unknown) { process.stderr.write(`[analysis] Unknown option: ${unknown.split('=')[0]}.\n`); return 2; }
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const rootPath = resolve(positional[0] ?? process.cwd());
  const vaultFlag = args.find((arg) => arg.startsWith('--vault='))?.slice('--vault='.length);
  const vaultRoot = resolve(vaultFlag ?? join(rootPath, 'docs/ontology'));
  const profile = args.find((arg) => arg.startsWith('--profile='))?.slice('--profile='.length);
  const json = flags.has('--json');
  const dryRun = flags.has('--dry-run');

  const archiveIntent = args.some((argument) => /^--(?:history|record|mode|limit|cursor)(?:=|$)/u.test(argument));
  if (archiveIntent) {
    try {
      const read = archiveArguments(args);
      const { listAnalysisRecords, readAnalysisRecord } = await loadMcpModule('analysis-records.mjs');
      const value = read.recordId !== undefined ? await readAnalysisRecord(read.vaultRoot, read.recordId) : await listAnalysisRecords(read.vaultRoot, read.historyOptions);
      if (read.json) process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
      else if (read.recordId !== undefined) {
        process.stdout.write(`${value.record.recordType} ${value.record.id} · ${value.record.createdAt}\n\n${value.record.answer ?? value.record.rationale}\n`);
      } else {
        for (const record of value.records) process.stdout.write(`${record.createdAt}  ${record.id}  ${record.recordType}  ${record.question?.slice(0, 120) ?? record.disposition}\n`);
        for (const problem of value.problems) process.stdout.write(`unreadable ${problem.fileName}: ${problem.reason}\n`);
        if (value.pagination.hasMore) process.stdout.write(`Next: --cursor=${value.pagination.nextCursor}\n`);
      }
      return 0;
    } catch (error) {
      process.stderr.write(`[analysis] ${error.message}\n`);
      return 2;
    }
  }

  if (!existsSync(vaultRoot)) {
    process.stderr.write(`[analysis] no vault at ${vaultRoot}\n`);
    return 2;
  }

  const health = runCli(['health', vaultRoot, '--json']);
  const validation = runCli(['validate', vaultRoot, '--json']);
  const architecture = runCli([
    'architecture', rootPath, '--vault', vaultRoot, ...(profile ? ['--profile', profile] : []), '--json',
  ]);

  const unavailable = [
    !health.ok ? `health (${health.reason})` : null,
    !validation.ok ? `validate (${validation.reason})` : null,
    !architecture.ok ? `architecture (${architecture.reason})` : null,
  ].filter(Boolean);

  const findings = collectFindings({
    health: health.ok ? health.value : null,
    validation: validation.ok ? validation.value : null,
    architecture: architecture.ok ? architecture.value : null,
  });

  const measuredAt = new Date().toISOString();
  const commit = currentCommit(rootPath);
  const basis = {
    id: recordName({ measuredAt, commit }).replace(/\.md$/, ''),
    measuredAt,
    commit,
    graphHash: health.ok ? health.value.graphHash : null,
    filesScanned: architecture.ok ? architecture.value?.conformance?.source?.filesScanned ?? 0 : 0,
  };

  const outFlag = args.find((arg) => arg.startsWith('--out='))?.slice('--out='.length);
  const analysesDir = resolve(outFlag ?? join(dirname(vaultRoot), ANALYSES_DIRNAME));
  const name = recordName({ measuredAt, commit });
  const previous = findPreviousRecord(analysesDir, name);
  const previousFindings = previous ? parseFindings(readFileSync(previous.path, 'utf8')) : null;
  const diff = diffFindings(previousFindings, findings);
  const markdown = renderAnalysis({ findings, diff, basis, previousLabel: previous?.name ?? null });

  if (!dryRun) {
    mkdirSync(analysesDir, { recursive: true });
    writeFileSync(join(analysesDir, name), markdown, 'utf8');
  }

  if (json) {
    process.stdout.write(`${JSON.stringify({
      contract: 'analysisRecord:v1',
      basis,
      written: dryRun ? null : join(analysesDir, name),
      comparedWith: previous?.name ?? null,
      unavailable,
      counts: {
        open: findings.length,
        opened: diff.opened.length,
        resolved: diff.resolved.length,
        changed: diff.changed.length,
      },
      findings,
    }, null, 2)}\n`);
    return 0;
  }

  const dim = (text) => `${COLORS.dim}${text}${COLORS.reset}`;
  process.stdout.write(`${findings.length} open finding(s) at ${commit ?? 'unknown commit'}\n`);
  for (const item of findings) process.stdout.write(`  ${item.severity.padEnd(9)} ${item.title}\n    ${dim(item.id)}\n`);
  if (!diff.hadPrevious) process.stdout.write(dim('\nFirst run — nothing to compare against yet.\n'));
  else {
    process.stdout.write(`\nsince ${previous.name}: ${diff.opened.length} new · ${diff.resolved.length} resolved · ${diff.changed.length} moved\n`);
    for (const item of diff.opened) process.stdout.write(`  new       ${item.title}\n`);
    for (const item of diff.resolved) process.stdout.write(`  resolved  ${item.title}\n`);
    for (const item of diff.changed) process.stdout.write(`  moved     ${item.wasSeverity} → ${item.severity}: ${item.title}\n`);
  }
  for (const missing of unavailable) process.stdout.write(`\n${COLORS.dim}not measured: ${missing}${COLORS.reset}\n`);
  if (!dryRun) process.stdout.write(dim(`\nwrote ${join(analysesDir, name)}\n`));
  return 0;
}

function printUsage(stream) {
  stream.write([
    'Usage: ontology-atlas analysis [rootPath] [--vault=<dir>] [--out=<dir>] [--profile=<slug>] [--json] [--dry-run]',
    '       ontology-atlas analysis [rootPath] --vault=<dir> --history [--mode=meaning|architecture] [--limit=30] [--cursor=<name>] [--json]',
    '       ontology-atlas analysis [rootPath] --vault=<dir> --record=<UUID> [--json]',
    '',
    'Writes a dated analysis record beside the vault and compares it with the',
    'previous one. The record lives next to the vault rather than inside it, so',
    'the vault contract stays untouched; it is committed Markdown, so it is',
    'versioned and readable in a diff.',
    '--history and --record read the separate ACP Markdown archive inside',
    '.ontology-atlas/analyses. They never run analysis or change the vault.',
    '',
  ].join('\n'));
}
