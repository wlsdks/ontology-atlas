// `ontology-atlas preflight [vault] [--staged] [--depth N] [--json]`
//
// Commit preflight — reverse-matches the git staged file list onto vault
// capability and element nodes, then summarises each node's blast radius (reusing
// query_ontology) to show which ontology nodes a commit touches *before* it lands.
// Designed to be called from a pre-commit hook: `agent-setup --install-pre-commit-hook`.
//
// Informational and non-blocking: if any stage comes up empty (not a git
// repository, no vault, no staged file touching a vault node) it exits 0 quietly —
// avoiding disable fatigue is a pre-commit hook's first requirement. A failed
// individual blast-radius call marks that row as an error and carries on. A
// `kind: decision` node inside the blast radius is only flagged with ⚠; it never
// blocks the commit, for the same reason — a commit hook is a guide, not a gate.

import { readFileSync } from 'node:fs';
import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { parseFrontmatter } from '../lib/parse-frontmatter.mjs';
import { resolveVaultRoot, VaultRootError } from '../lib/resolve-vault.mjs';
import { walkMd, pathToSlug } from '../lib/walk-vault.mjs';
import { getStagedFiles } from '../lib/git-staged.mjs';
import { matchChangedFilesToVaultNodes } from '../lib/preflight-match.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertBlastRadiusShape } from '../lib/query-result-contract.mjs';
import {
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const DEPTH_CAP = 20;
const DEFAULT_DEPTH = 1;
// blast-radius spawns a separate MCP process per node, so this caps the extreme
// case of one commit touching hundreds of nodes to keep the hook within seconds.
const NODE_CAP = 25;
const ALLOWED_FLAGS = ['--vault', '--staged', '--depth', '--json'];
const RISK_COLORS = { low: COLORS.green, medium: COLORS.yellow, high: COLORS.red };

export async function runPreflight(args) {
  const parsed = parseArgs(args);
  if (parsed.help) {
    printUsage(process.stdout);
    return 0;
  }
  if (parsed.error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${parsed.error}\n`);
    printUsage();
    return 1;
  }

  let vaultRoot;
  try {
    vaultRoot = resolveVaultRoot(parsed.vault);
  } catch (err) {
    if (err instanceof VaultRootError) {
      return emitSkip(parsed.json, 'vault-not-found', { message: err.message });
    }
    throw err;
  }

  const stagedFiles = getStagedFiles({ cwd: process.cwd() });
  if (!stagedFiles || stagedFiles.length === 0) {
    return emitSkip(parsed.json, stagedFiles === null ? 'not-a-git-repo' : 'no-staged-files');
  }

  const docs = loadVaultDocs(vaultRoot);
  const matches = matchChangedFilesToVaultNodes(docs, stagedFiles);
  if (matches.length === 0) {
    return emitSkip(parsed.json, 'no-node-matches', { stagedFiles: stagedFiles.length });
  }

  const depth = parsed.depth ?? DEFAULT_DEPTH;
  const candidates = matches.slice(0, NODE_CAP);
  const truncated = matches.length - candidates.length;

  const rows = [];
  for (const match of candidates) {
    rows.push(await buildRow(vaultRoot, match, depth));
  }

  const decisionWarnings = rows.filter((row) => row.decisionCount > 0).length;

  if (parsed.json) {
    process.stdout.write(
      JSON.stringify(
        {
          skipped: false,
          vaultRoot,
          stagedFiles: stagedFiles.length,
          matchedNodes: matches.length,
          truncated,
          depth,
          decisionWarnings,
          rows,
        },
        null,
        2,
      ) + '\n',
    );
    return 0;
  }

  render(rows, { vaultRoot, stagedFiles, truncated, depth, decisionWarnings });
  return 0;
}

async function buildRow(vaultRoot, match, depth) {
  try {
    const blast = await callMcpTool(vaultRoot, 'query_ontology', {
      operation: 'blast_radius',
      slug: match.slug,
      depth,
      direction: 'incoming',
    });
    assertBlastRadiusShape(blast);
    const byKind = blast.byKind ?? {};
    return {
      slug: match.slug,
      kind: match.kind,
      title: match.title,
      matchedFiles: match.matchedFiles,
      risk: blast.risk,
      affectedNodes: blast.summary?.affectedNodes ?? 0,
      decisionCount: Number(byKind.decision) || 0,
      error: null,
    };
  } catch (err) {
    return {
      slug: match.slug,
      kind: match.kind,
      title: match.title,
      matchedFiles: match.matchedFiles,
      risk: null,
      affectedNodes: 0,
      decisionCount: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

// No vault, zero staged files, zero matched nodes — all mean "this hook has
// nothing to do". With --json only the machine-readable skip reason remains, and
// the human output is left completely empty: no noise is the only thing that
// prevents disable fatigue.
function emitSkip(json, reason, extra = {}) {
  if (json) {
    process.stdout.write(JSON.stringify({ skipped: true, reason, ...extra }, null, 2) + '\n');
  }
  return 0;
}

function loadVaultDocs(vaultRoot) {
  const docs = [];
  for (const file of walkMd(vaultRoot)) {
    let raw;
    try {
      raw = readFileSync(file, 'utf-8');
    } catch {
      continue;
    }
    const { frontmatter } = parseFrontmatter(raw);
    docs.push({ slug: pathToSlug(vaultRoot, file), frontmatter });
  }
  return docs;
}

function render(rows, { vaultRoot, stagedFiles, truncated, depth, decisionWarnings }) {
  process.stdout.write(
    `${COLORS.bold}preflight${COLORS.reset} ${COLORS.dim}vault=${vaultRoot}${COLORS.reset}\n` +
      `  ${stagedFiles.length} staged file(s) touch ${COLORS.bold}${rows.length}${COLORS.reset} vault node(s)` +
      ` ${COLORS.dim}(depth ${depth})${COLORS.reset}` +
      (decisionWarnings > 0
        ? ` · ${COLORS.yellow}⚠ ${decisionWarnings} node(s) reach a kind:decision node${COLORS.reset}`
        : '') +
      '\n\n',
  );

  for (const row of rows) {
    const kindColor = KIND_COLORS[row.kind] || COLORS.dim;
    const kindCol = `${kindColor}${row.kind.padEnd(11)}${COLORS.reset}`;
    const slugCol = row.slug.padEnd(42);
    if (row.error) {
      process.stdout.write(
        `  ${kindCol} ${slugCol} ${COLORS.red}blast-radius error${COLORS.reset} ${COLORS.dim}· ${row.error}${COLORS.reset}\n`,
      );
      continue;
    }
    const riskColor = RISK_COLORS[row.risk] || COLORS.dim;
    const warn = row.decisionCount > 0 ? ` ${COLORS.yellow}⚠ ${row.decisionCount} decision node(s)${COLORS.reset}` : '';
    process.stdout.write(
      `  ${kindCol} ${slugCol} ${riskColor}${String(row.risk).padEnd(6)}${COLORS.reset} ` +
        `${COLORS.dim}${row.affectedNodes} affected · ${row.matchedFiles.length} file(s)${COLORS.reset}${warn}\n`,
    );
  }

  if (truncated > 0) {
    process.stdout.write(`\n  ${COLORS.dim}… ${truncated} more matched node(s) not shown (cap ${NODE_CAP})${COLORS.reset}\n`);
  }

  process.stdout.write(
    `\n${COLORS.dim}next: ontology-atlas node <slug> [vault] --limit 20${COLORS.reset}\n` +
      `${COLORS.dim}      ontology-atlas blast-radius <slug> [vault] --depth ${depth}${COLORS.reset}\n`,
  );
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, staged: false, json: false, depth: undefined };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--staged') flags.staged = true;
    else if (a === '--json') flags.json = true;
    else if (a === '--depth') flags.depth = parseBoundedNonNegativeIntegerFlag('--depth', args[++i], { max: DEPTH_CAP });
    else if (a.startsWith('--depth='))
      flags.depth = parseBoundedNonNegativeIntegerFlag('--depth', a.slice('--depth='.length), { max: DEPTH_CAP });
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json, depth: flags.depth };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas preflight [vault] [--staged] [--depth N] [--json]\n\n` +
      `${COLORS.bold}What it does:${COLORS.reset}\n` +
      `  Matches \`git diff --cached\` staged files against vault capability/element\n` +
      `  \`path:\`/\`elements:\` frontmatter, then runs blast-radius (query_ontology)\n` +
      `  on each matched node so you see what this commit reaches before it lands.\n` +
      `  A ${COLORS.yellow}⚠${COLORS.reset} marks nodes whose blast radius includes a kind:decision node.\n\n` +
      `  Purely informational: never blocks the commit. Silent exit 0 when there is\n` +
      `  no vault, no staged files, or no matching node (no disable-fatigue noise).\n` +
      `  ${COLORS.bold}--staged${COLORS.reset} is the only supported mode today (explicit form for hook scripts).\n` +
      `  ${COLORS.bold}--depth N${COLORS.reset} default ${DEFAULT_DEPTH}, range 0-${DEPTH_CAP} (forwarded to blast-radius).\n\n` +
      `${COLORS.bold}Install as a pre-commit hook:${COLORS.reset}\n` +
      `  ontology-atlas agent-setup --install-pre-commit-hook\n`,
  );
}
