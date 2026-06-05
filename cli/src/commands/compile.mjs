// `ontology-atlas compile [vault]` — deterministic graph compile surface.
// 기본은 side-effect 없는 compiler summary. `--fix` 는 compiler 가 산출한
// canonicalizationActions 만 patch_concept 로 적용해 relation 배열을 재정렬한다.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { compileResultExitCode } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseNonNegativeIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const PAGE_LIMIT_CAP = 500;
const CANONICALIZATION_GRAPH_ARRAY_KEYS = Object.freeze([
  'domains',
  'capabilities',
  'elements',
  'dependencies',
  'relates',
  'contains',
  'describes',
  'depends_on',
]);
const CANONICALIZATION_GRAPH_ARRAY_KEY_SET = new Set(CANONICALIZATION_GRAPH_ARRAY_KEYS);
const ALLOWED_FLAGS = [
  '--vault',
  '--json',
  '--summary',
  '--indexes',
  '--fix',
  '--nodes-limit',
  '--nodes-offset',
  '--edges-limit',
  '--edges-offset',
];


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
    if (!Array.isArray(artifact.canonicalizationActions)) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  compile_ontology response missing canonicalizationActions array; cannot apply --fix safely\n`,
      );
      return 2;
    }
    const actions = artifact.canonicalizationActions;
    const actionsError = canonicalizationActionsShapeError(actions);
    if (actionsError) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  compile_ontology ${actionsError}; cannot apply --fix safely\n`,
      );
      return 2;
    }
    if (
      artifact.canonicalizationActionCount !== undefined &&
      (!Number.isSafeInteger(artifact.canonicalizationActionCount) ||
        artifact.canonicalizationActionCount < 0)
    ) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  compile_ontology canonicalizationActionCount must be a non-negative integer; cannot apply --fix safely\n`,
      );
      return 2;
    }
    if (artifact.canonicalizationActionCount !== undefined && artifact.canonicalizationActionCount !== actions.length) {
      process.stderr.write(
        `${COLORS.red}error${COLORS.reset}  compile_ontology canonicalizationActionCount mismatch: count=${artifact.canonicalizationActionCount}, actions=${actions.length}; cannot apply --fix safely\n`,
      );
      return 2;
    }
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

function canonicalizationActionsShapeError(actions) {
  for (let index = 0; index < actions.length; index += 1) {
    const action = actions[index];
    const label = `canonicalizationActions[${index}]`;
    if (!action || typeof action !== 'object' || Array.isArray(action)) {
      return `${label} must be an object`;
    }
    if (typeof action.slug !== 'string' || action.slug.trim() === '') {
      return `${label}.slug must be a non-empty string`;
    }
    if (!action.frontmatter || typeof action.frontmatter !== 'object' || Array.isArray(action.frontmatter)) {
      return `${label}.frontmatter must be an object`;
    }
    if (!Number.isFinite(action.expected_mtime) || action.expected_mtime < 0) {
      return `${label}.expected_mtime must be a non-negative finite number`;
    }
    if (
      action.keys !== undefined &&
      (!Array.isArray(action.keys) || action.keys.some((key) => typeof key !== 'string' || key.trim() === ''))
    ) {
      return `${label}.keys must be an array of non-empty strings`;
    }
    const frontmatterKeys = Object.keys(action.frontmatter);
    for (const key of frontmatterKeys) {
      if (!CANONICALIZATION_GRAPH_ARRAY_KEY_SET.has(key)) {
        return `${label}.frontmatter.${key} is not a compiler relation-array key`;
      }
      const value = action.frontmatter[key];
      if (!Array.isArray(value) || value.some((ref) => typeof ref !== 'string' || ref.trim() === '')) {
        return `${label}.frontmatter.${key} must be an array of non-empty strings`;
      }
    }
    if (Array.isArray(action.keys)) {
      const declaredKeys = new Set(action.keys);
      for (const key of action.keys) {
        if (!CANONICALIZATION_GRAPH_ARRAY_KEY_SET.has(key)) {
          return `${label}.keys contains unsupported relation-array key "${key}"`;
        }
        if (!Object.prototype.hasOwnProperty.call(action.frontmatter, key)) {
          return `${label}.keys declares "${key}" but frontmatter does not include it`;
        }
      }
      for (const key of frontmatterKeys) {
        if (!declaredKeys.has(key)) {
          return `${label}.frontmatter.${key} is missing from keys`;
        }
      }
    }
  }
  return null;
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
    else if (a === '--nodes-limit') flags.nodesLimit = parseBoundedPositiveIntegerFlag(a, args[++i], { max: PAGE_LIMIT_CAP });
    else if (a.startsWith('--nodes-limit=')) flags.nodesLimit = parseBoundedPositiveIntegerFlag('--nodes-limit', a.slice('--nodes-limit='.length), { max: PAGE_LIMIT_CAP });
    else if (a === '--nodes-offset') flags.nodesOffset = parseNonNegativeIntegerFlag(a, args[++i]);
    else if (a.startsWith('--nodes-offset=')) flags.nodesOffset = parseNonNegativeIntegerFlag('--nodes-offset', a.slice('--nodes-offset='.length));
    else if (a === '--edges-limit') flags.edgesLimit = parseBoundedPositiveIntegerFlag(a, args[++i], { max: PAGE_LIMIT_CAP });
    else if (a.startsWith('--edges-limit=')) flags.edgesLimit = parseBoundedPositiveIntegerFlag('--edges-limit', a.slice('--edges-limit='.length), { max: PAGE_LIMIT_CAP });
    else if (a === '--edges-offset') flags.edgesOffset = parseNonNegativeIntegerFlag(a, args[++i]);
    else if (a.startsWith('--edges-offset=')) flags.edgesOffset = parseNonNegativeIntegerFlag('--edges-offset', a.slice('--edges-offset='.length));
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
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
      `  ontology-atlas compile [vault] [--summary] [--json]\n` +
      `  ontology-atlas compile [vault] --fix\n\n` +
      `Options:\n` +
      `  --fix                 apply compiler canonicalizationActions via patch_concept\n` +
      `  --summary             counts + graphHash only\n` +
      `  --indexes             include adjacency indexes in JSON/full payload\n` +
      `  --nodes-limit N       paginate sorted nodes (max ${PAGE_LIMIT_CAP})\n` +
      `  --nodes-offset N      node page offset\n` +
      `  --edges-limit N       paginate sorted edges (max ${PAGE_LIMIT_CAP})\n` +
      `  --edges-offset N      edge page offset\n` +
      `  --json                machine-readable output\n`,
  );
}
