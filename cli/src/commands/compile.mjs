// `oh-my-ontology compile [vault]` — deterministic graph compile surface.
// 기본은 side-effect 없는 compiler summary. `--fix` 는 compiler 가 산출한
// canonicalizationActions 만 patch_concept 로 적용해 relation 배열을 재정렬한다.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { compileResultExitCode } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  parseNonNegativeIntegerFlag,
  parsePositiveIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

export async function runCompile(args) {
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

  const vaultRoot = resolveVaultRoot(parsed.vault);
  let artifact;
  try {
    artifact = await callMcpTool(vaultRoot, 'compile_ontology', {
      includeIndexes: parsed.includeIndexes,
      summary: parsed.summary && !parsed.fix,
      nodesLimit: parsed.nodesLimit,
      nodesOffset: parsed.nodesOffset,
      edgesLimit: parsed.edgesLimit,
      edgesOffset: parsed.edgesOffset,
    });
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  let fixResult = null;
  if (parsed.fix) {
    const actions = Array.isArray(artifact.canonicalizationActions)
      ? artifact.canonicalizationActions
      : [];
    fixResult = await applyCanonicalizationActions(vaultRoot, actions);
    if (fixResult.failed > 0) {
      if (parsed.json) {
        process.stdout.write(JSON.stringify({ artifact, fix: fixResult }, null, 2) + '\n');
      } else {
        renderArtifact(artifact);
        renderFixResult(fixResult);
      }
      return 1;
    }

    // Recompile after fixes so the user sees the settled graphHash / action count.
    try {
      artifact = await callMcpTool(vaultRoot, 'compile_ontology', {
        includeIndexes: parsed.includeIndexes,
        summary: parsed.summary,
        nodesLimit: parsed.nodesLimit,
        nodesOffset: parsed.nodesOffset,
        edgesLimit: parsed.edgesLimit,
        edgesOffset: parsed.edgesOffset,
      });
    } catch (err) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  recompile: ${err instanceof Error ? err.message : String(err)}\n`,
      );
      return 2;
    }
  }

  if (parsed.json) {
    process.stdout.write(
      JSON.stringify(fixResult ? { artifact, fix: fixResult } : artifact, null, 2) + '\n',
    );
    return compileResultExitCode(artifact);
  }

  renderArtifact(artifact);
  if (fixResult) renderFixResult(fixResult);
  return compileResultExitCode(artifact);
}

async function applyCanonicalizationActions(vaultRoot, actions) {
  const rows = [];
  for (const action of actions) {
    try {
      await callMcpTool(vaultRoot, 'patch_concept', {
        slug: action.slug,
        frontmatter: action.frontmatter,
        expected_mtime: action.expected_mtime,
      });
      rows.push({ ok: true, slug: action.slug, keys: action.keys ?? [] });
    } catch (err) {
      rows.push({
        ok: false,
        slug: action.slug,
        keys: action.keys ?? [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return {
    requested: actions.length,
    applied: rows.filter((row) => row.ok).length,
    failed: rows.filter((row) => !row.ok).length,
    rows,
  };
}

function renderArtifact(artifact) {
  const summary = artifact.summary ?? artifact;
  const nodes = summary.nodes ?? summary.nodeCount ?? artifact.nodeCount ?? 0;
  const edges = summary.edges ?? summary.edgeCount ?? artifact.edgeCount ?? 0;
  const issues = summary.issues ?? summary.issueCount ?? artifact.issueCount ?? 0;
  const unresolved =
    summary.unresolvedEdges ?? summary.unresolvedEdgeCount ?? artifact.unresolvedEdgeCount ?? 0;
  const actions =
    artifact.canonicalizationActionCount ??
    (Array.isArray(artifact.canonicalizationActions)
      ? artifact.canonicalizationActions.length
      : 0);

  process.stdout.write(
    `${COLORS.bold}compiled ontology${COLORS.reset}` +
      ` ${COLORS.dim}${nodes} nodes · ${edges} edges · hash ${shortHash(summary.graphHash ?? artifact.graphHash)}${COLORS.reset}\n`,
  );
  process.stdout.write(
    `  ${COLORS.dim}resolved${COLORS.reset} ${summary.resolvedEdges ?? artifact.resolvedEdgeCount ?? 0}` +
      `  ${COLORS.dim}external${COLORS.reset} ${summary.externalEdges ?? artifact.externalEdgeCount ?? 0}` +
      `  ${unresolved > 0 ? COLORS.yellow : COLORS.dim}unresolved${COLORS.reset} ${unresolved}` +
      `  ${issues > 0 ? COLORS.yellow : COLORS.dim}issues${COLORS.reset} ${issues}` +
      `  ${actions > 0 ? COLORS.yellow : COLORS.dim}reorder${COLORS.reset} ${actions}\n`,
  );

  if (artifact.nodesPagination) {
    renderPagination('nodes', artifact.nodesPagination);
  }
  if (artifact.edgesPagination) {
    renderPagination('edges', artifact.edgesPagination);
  }
  if (actions > 0) {
    process.stdout.write(
      `\n${COLORS.yellow}reorder available${COLORS.reset} — run with ${COLORS.bold}--fix${COLORS.reset} to canonicalize relation arrays.\n`,
    );
  }
}

function renderPagination(label, meta) {
  process.stdout.write(
    `  ${COLORS.dim}${label} page${COLORS.reset} offset ${meta.offset} · returned ${meta.returned}/${meta.total}` +
      (meta.hasMore ? ` · next ${meta.nextOffset}` : '') +
      '\n',
  );
}

function renderFixResult(result) {
  const color = result.failed > 0 ? COLORS.red : COLORS.green;
  process.stdout.write(
    `\n${COLORS.bold}reorder${COLORS.reset} ${color}${result.applied}/${result.requested} applied${COLORS.reset}`,
  );
  if (result.failed > 0) process.stdout.write(` ${COLORS.red}${result.failed} failed${COLORS.reset}`);
  process.stdout.write('\n');
  for (const row of result.rows) {
    const color = row.ok ? COLORS.green : COLORS.red;
    const label = row.ok ? 'ok' : 'fail';
    process.stdout.write(
      `  ${color}${label.padEnd(4)}${COLORS.reset} ${row.slug} ${COLORS.dim}${(row.keys ?? []).join(', ')}${COLORS.reset}\n`,
    );
    if (!row.ok && row.error) {
      process.stdout.write(`       ${COLORS.dim}${row.error}${COLORS.reset}\n`);
    }
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    return { help: true };
  }
  const flags = {
    vault: null,
    json: false,
    summary: false,
    includeIndexes: false,
    fix: false,
    nodesLimit: undefined,
    nodesOffset: undefined,
    edgesLimit: undefined,
    edgesOffset: undefined,
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--summary') flags.summary = true;
    else if (a === '--indexes') flags.includeIndexes = true;
    else if (a === '--fix') flags.fix = true;
    else if (a === '--nodes-limit') flags.nodesLimit = parsePositiveIntegerFlag(a, args[++i]);
    else if (a.startsWith('--nodes-limit=')) flags.nodesLimit = parsePositiveIntegerFlag('--nodes-limit', a.slice('--nodes-limit='.length));
    else if (a === '--nodes-offset') flags.nodesOffset = parseNonNegativeIntegerFlag(a, args[++i]);
    else if (a.startsWith('--nodes-offset=')) flags.nodesOffset = parseNonNegativeIntegerFlag('--nodes-offset', a.slice('--nodes-offset='.length));
    else if (a === '--edges-limit') flags.edgesLimit = parsePositiveIntegerFlag(a, args[++i]);
    else if (a.startsWith('--edges-limit=')) flags.edgesLimit = parsePositiveIntegerFlag('--edges-limit', a.slice('--edges-limit='.length));
    else if (a === '--edges-offset') flags.edgesOffset = parseNonNegativeIntegerFlag(a, args[++i]);
    else if (a.startsWith('--edges-offset=')) flags.edgesOffset = parseNonNegativeIntegerFlag('--edges-offset', a.slice('--edges-offset='.length));
    else if (a.startsWith('--')) return { error: `unknown flag: ${a}` };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { ...flags, vault: vaultResult.vault };
}

function shortHash(hash) {
  return typeof hash === 'string' && hash.length > 8 ? hash.slice(0, 8) : hash || 'none';
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology compile [vault] [--summary] [--json]\n` +
      `  oh-my-ontology compile [vault] --fix\n\n` +
      `Options:\n` +
      `  --fix                 apply compiler canonicalizationActions via patch_concept\n` +
      `  --summary             counts + graphHash only\n` +
      `  --indexes             include adjacency indexes in JSON/full payload\n` +
      `  --nodes-limit N       paginate sorted nodes\n` +
      `  --nodes-offset N      node page offset\n` +
      `  --edges-limit N       paginate sorted edges\n` +
      `  --edges-offset N      edge page offset\n` +
      `  --json                machine-readable output\n`,
  );
}
