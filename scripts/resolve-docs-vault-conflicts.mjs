#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AUTHORED_LEDGER_PATHS = [
  'docs/CHANGELOG.md',
  'docs/DECISIONS.md',
];

const GENERATED_PREFIXES = [
  'public/docs-vault/',
  'src/entities/docs-vault/data/',
];
const GENERATED_EXACT_PATHS = [
  'src/views/download/model/dogfood-census.generated.ts',
];

const DATED_RECORD = /^## (\d{4}-\d{2}-\d{2})(?=\s|$).*$/gm;
const MAX_GIT_OUTPUT = 64 * 1024 * 1024;

export class LedgerConflictError extends Error {
  constructor(message) {
    super(message);
    this.name = 'LedgerConflictError';
  }
}

function normalizeLf(text) {
  return String(text).replace(/\r\n?/g, '\n');
}

function withFinalNewline(text) {
  return `${String(text).trimEnd()}\n`;
}

function digest(text) {
  return createHash('sha256').update(text).digest('hex');
}

function codeUnitCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function parseLedger(text, ledgerPath) {
  const normalized = normalizeLf(text);
  const matches = [...normalized.matchAll(DATED_RECORD)];
  if (matches.length === 0) {
    throw new LedgerConflictError(
      `${ledgerPath}: no dated records found; refusing to guess the ledger boundary`,
    );
  }

  const preamble = normalized.slice(0, matches[0].index).trimEnd();
  const entries = matches.map((match, index) => {
    const start = match.index;
    const end = matches[index + 1]?.index ?? normalized.length;
    const raw = normalized.slice(start, end).trimEnd();
    const heading = raw.split('\n', 1)[0];
    return {
      date: match[1],
      heading,
      raw,
      id: digest(raw),
    };
  });

  return { preamble, entries };
}

function mergePreamble({ path: ledgerPath, base, ours, theirs }) {
  if (ours === theirs) return ours;
  if (ours === base) return theirs;
  if (theirs === base) return ours;
  throw new LedgerConflictError(
    `${ledgerPath}: both sides changed the ledger preamble; resolve that authored prose explicitly`,
  );
}

function addedPrefix({ path: ledgerPath, base, side, sideName }) {
  if (side.length < base.length) {
    throw new LedgerConflictError(
      `${ledgerPath}: ${sideName} removed an existing record; the append-only resolver cannot continue`,
    );
  }

  const offset = side.length - base.length;
  for (let index = 0; index < base.length; index += 1) {
    if (side[offset + index]?.raw !== base[index]?.raw) {
      const heading = base[index]?.heading ?? `record ${index + 1}`;
      throw new LedgerConflictError(
        `${ledgerPath}: existing record changed (${heading}); only prepend-only additions can be merged automatically`,
      );
    }
  }
  return side.slice(0, offset);
}

function readyOrder(left, right) {
  if (left.date !== right.date) return left.date > right.date ? -1 : 1;
  const heading = codeUnitCompare(left.heading, right.heading);
  return heading === 0 ? codeUnitCompare(left.id, right.id) : heading;
}

/**
 * Merge two independently ordered addition lists without inventing a cross-branch
 * chronology. Each branch's own order remains a hard constraint. Records that
 * are simultaneously ready use date, heading, then content digest as a stable
 * tie-break, so swapping ours/theirs cannot change the output.
 */
function mergeAddedEntries(sequences, ledgerPath) {
  const nodes = new Map();
  const outgoing = new Map();
  const incoming = new Map();

  for (const sequence of sequences) {
    for (const entry of sequence) {
      nodes.set(entry.id, entry);
      if (!outgoing.has(entry.id)) outgoing.set(entry.id, new Set());
      if (!incoming.has(entry.id)) incoming.set(entry.id, 0);
    }
    for (let index = 0; index < sequence.length - 1; index += 1) {
      const before = sequence[index].id;
      const after = sequence[index + 1].id;
      if (before === after || outgoing.get(before).has(after)) continue;
      outgoing.get(before).add(after);
      incoming.set(after, (incoming.get(after) ?? 0) + 1);
    }
  }

  const ready = [...nodes.values()].filter((entry) => incoming.get(entry.id) === 0);
  const merged = [];
  while (ready.length > 0) {
    ready.sort(readyOrder);
    const next = ready.shift();
    merged.push(next);
    for (const after of outgoing.get(next.id) ?? []) {
      const count = (incoming.get(after) ?? 0) - 1;
      incoming.set(after, count);
      if (count === 0) ready.push(nodes.get(after));
    }
  }

  if (merged.length !== nodes.size) {
    throw new LedgerConflictError(
      `${ledgerPath}: the two sides impose incompatible record order; resolve chronology explicitly`,
    );
  }
  return merged;
}

/**
 * Semantic three-way merge for the repository's two append-only ledgers.
 *
 * It deliberately supports one shape only: each side may prepend complete dated
 * records while every base record remains byte-identical and in the same order.
 * Any historical rewrite, deletion, or two-sided preamble edit fails closed.
 */
export function mergeAppendOnlyLedger({ path: ledgerPath, base, ours, theirs }) {
  const parsedBase = parseLedger(base, ledgerPath);
  const parsedOurs = parseLedger(ours, ledgerPath);
  const parsedTheirs = parseLedger(theirs, ledgerPath);
  const preamble = mergePreamble({
    path: ledgerPath,
    base: parsedBase.preamble,
    ours: parsedOurs.preamble,
    theirs: parsedTheirs.preamble,
  });
  const oursAdded = addedPrefix({
    path: ledgerPath,
    base: parsedBase.entries,
    side: parsedOurs.entries,
    sideName: 'current side',
  });
  const theirsAdded = addedPrefix({
    path: ledgerPath,
    base: parsedBase.entries,
    side: parsedTheirs.entries,
    sideName: 'incoming side',
  });

  const newestBaseDate = parsedBase.entries[0].date;
  for (const entry of [...oursAdded, ...theirsAdded]) {
    if (entry.date < newestBaseDate) {
      throw new LedgerConflictError(
        `${ledgerPath}: ${entry.heading} is older than the newest existing record; only top additions are automatic`,
      );
    }
  }

  const additions = mergeAddedEntries([oursAdded, theirsAdded], ledgerPath);
  const chunks = [
    preamble,
    ...additions.map((entry) => entry.raw),
    ...parsedBase.entries.map((entry) => entry.raw),
  ];
  return withFinalNewline(chunks.join('\n\n'));
}

function isGeneratedPath(filePath) {
  return (
    GENERATED_EXACT_PATHS.includes(filePath) ||
    GENERATED_PREFIXES.some((prefix) => filePath.startsWith(prefix))
  );
}

export function classifyConflictPaths(paths) {
  const ledgers = [];
  const generated = [];
  const unsupported = [];
  for (const filePath of paths) {
    if (AUTHORED_LEDGER_PATHS.includes(filePath)) ledgers.push(filePath);
    else if (isGeneratedPath(filePath)) generated.push(filePath);
    else unsupported.push(filePath);
  }
  return { ledgers, generated, unsupported };
}

function splitNul(output) {
  return String(output).split('\0').filter(Boolean);
}

function gitOutput(root, args) {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: MAX_GIT_OUTPUT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function repositoryRoot(cwd) {
  return gitOutput(cwd, ['rev-parse', '--show-toplevel']).trim();
}

function readStage(root, stage, filePath) {
  try {
    return gitOutput(root, ['show', `:${stage}:${filePath}`]);
  } catch (error) {
    const detail = String(error?.stderr ?? error?.message ?? error).trim();
    throw new LedgerConflictError(
      `${filePath}: Git stage ${stage} is unavailable; this is not a three-way ledger conflict${detail ? ` (${detail})` : ''}`,
    );
  }
}

function runBuilder(root, args = []) {
  const script = path.join(root, 'scripts', 'build-docs-vault.mjs');
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new LedgerConflictError(
      `docs-vault generator failed with exit ${result.status ?? 'unknown'}`,
    );
  }
}

async function defaultRegenerate({ root }) {
  runBuilder(root);
}

async function defaultVerifyGenerated({ root }) {
  runBuilder(root, ['--check']);
}

function assertNoUntrackedOrUnstagedDocs(root, unmerged) {
  const conflictSet = new Set(unmerged);
  // Every builder input is guarded, not just docs/ — the regeneration also
  // reads samples/storefront/**.md into the staged generated output
  // (sample-storefront.*.json), so an unstaged storefront edit was silently
  // baked into the conflict resolution, violating the "regenerate only from
  // byte-identical committed inputs" contract (bug sweep 2026-09-01). Deleted
  // inputs count too (diff-filter D): a removed doc changes the output as
  // surely as an edited one.
  const inputPathspecs = ['docs', 'samples/storefront'];
  const untrackedDocs = splitNul(
    gitOutput(root, ['ls-files', '--others', '--exclude-standard', '-z', '--', ...inputPathspecs]),
  ).filter((filePath) => filePath.endsWith('.md'));
  const unstagedDocs = splitNul(
    gitOutput(root, ['diff', '--name-only', '--diff-filter=ACMRD', '-z', '--', ...inputPathspecs]),
  ).filter((filePath) => filePath.endsWith('.md') && !conflictSet.has(filePath));
  const unsafe = [...new Set([...untrackedDocs, ...unstagedDocs])];
  if (unsafe.length > 0) {
    throw new LedgerConflictError(
      `unstaged or untracked authored docs would leak into generated output: ${unsafe.join(', ')}`,
    );
  }
}

/**
 * Resolve the current Git operation only when every conflict is one of the two
 * append-only ledgers or a deterministic docs-vault artifact.
 */
export async function resolveRepositoryConflicts({
  cwd = process.cwd(),
  dryRun = false,
  regenerate = defaultRegenerate,
  verifyGenerated = defaultVerifyGenerated,
} = {}) {
  const root = repositoryRoot(cwd);
  const unmerged = splitNul(
    gitOutput(root, ['diff', '--name-only', '--diff-filter=U', '-z']),
  );
  if (unmerged.length === 0) {
    throw new LedgerConflictError('no unmerged paths found; there is nothing to resolve');
  }

  const classified = classifyConflictPaths(unmerged);
  if (classified.unsupported.length > 0) {
    throw new LedgerConflictError(
      `unsupported conflicts remain: ${classified.unsupported.join(', ')}; no files were changed`,
    );
  }
  assertNoUntrackedOrUnstagedDocs(root, unmerged);

  const plans = classified.ledgers.map((filePath) => ({
    path: filePath,
    merged: mergeAppendOnlyLedger({
      path: filePath,
      base: readStage(root, 1, filePath),
      ours: readStage(root, 2, filePath),
      theirs: readStage(root, 3, filePath),
    }),
  }));

  if (dryRun) {
    return {
      dryRun: true,
      root,
      unmerged,
      resolvedLedgers: plans.map((plan) => plan.path),
      regenerated: classified.generated,
    };
  }

  for (const plan of plans) {
    await writeFile(path.join(root, plan.path), plan.merged, 'utf8');
  }
  await regenerate({ root });

  const stagePaths = [
    ...plans.map((plan) => plan.path),
    'src/entities/docs-vault/data',
    ...GENERATED_EXACT_PATHS,
    'public/docs-vault',
  ].filter(
    (filePath) =>
      existsSync(path.join(root, filePath)) || classified.generated.includes(filePath),
  );
  gitOutput(root, ['add', '--', ...stagePaths]);

  const remaining = splitNul(
    gitOutput(root, ['diff', '--name-only', '--diff-filter=U', '-z']),
  );
  if (remaining.length > 0) {
    throw new LedgerConflictError(
      `unmerged paths remain after regeneration: ${remaining.join(', ')}`,
    );
  }
  await verifyGenerated({ root });

  return {
    dryRun: false,
    root,
    unmerged,
    resolvedLedgers: plans.map((plan) => plan.path),
    regenerated: classified.generated,
  };
}

export function usage() {
  return [
    'Usage: node scripts/resolve-docs-vault-conflicts.mjs [--dry-run]',
    '',
    'Resolves only append-only CHANGELOG/DECISIONS conflicts plus generated docs-vault outputs.',
    'It refuses unrelated conflicts and historical ledger edits, regenerates artifacts, and stages the result.',
  ].join('\n');
}

function parseArgs(argv) {
  const args = argv[0] === '--' ? argv.slice(1) : argv;
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const allowed = new Set(['--dry-run']);
  const unknown = args.find((arg) => !allowed.has(arg));
  if (unknown) return { error: `Unknown option: ${unknown}` };
  return { dryRun: args.includes('--dry-run') };
}

function nextGitCommand(root) {
  const gitPath = (name) => gitOutput(root, ['rev-parse', '--git-path', name]).trim();
  if (existsSync(gitPath('rebase-merge')) || existsSync(gitPath('rebase-apply'))) {
    return 'git rebase --continue';
  }
  if (existsSync(gitPath('MERGE_HEAD'))) return 'git merge --continue';
  if (existsSync(gitPath('CHERRY_PICK_HEAD'))) return 'git cherry-pick --continue';
  return null;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(usage());
    return 0;
  }
  if (args.error) {
    console.error(`[docs-vault-resolve] ${args.error}`);
    console.error(usage());
    return 2;
  }

  try {
    const result = await resolveRepositoryConflicts({ dryRun: args.dryRun });
    const next = nextGitCommand(result.root);
    if (result.dryRun) {
      console.log(
        `[docs-vault-resolve] dry-run ready · ${result.resolvedLedgers.length} ledger(s) · ${result.regenerated.length} generated conflict(s)`,
      );
    } else {
      console.log(
        `[docs-vault-resolve] resolved · ${result.resolvedLedgers.length} ledger(s) · regenerated docs-vault outputs`,
      );
      if (next) console.log(`[docs-vault-resolve] next: ${next}`);
    }
    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[docs-vault-resolve] refused: ${message}`);
    return 1;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
