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

export async function runAnalysis(args) {
  const flags = new Set(args.filter((arg) => arg.startsWith('--')));
  if (flags.has('--help') || flags.has('-h')) {
    printUsage(process.stdout);
    return 0;
  }
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const rootPath = resolve(positional[0] ?? process.cwd());
  const vaultFlag = args.find((arg) => arg.startsWith('--vault='))?.slice('--vault='.length);
  const vaultRoot = resolve(vaultFlag ?? join(rootPath, 'docs/ontology'));
  const profile = args.find((arg) => arg.startsWith('--profile='))?.slice('--profile='.length);
  const json = flags.has('--json');
  const dryRun = flags.has('--dry-run');

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
    '',
    'Writes a dated analysis record beside the vault and compares it with the',
    'previous one. The record lives next to the vault rather than inside it, so',
    'the vault contract stays untouched; it is committed Markdown, so it is',
    'versioned and readable in a diff.',
    '',
  ].join('\n'));
}
