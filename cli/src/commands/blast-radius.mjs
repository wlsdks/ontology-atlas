// `oh-my-ontology blast-radius <slug> [vault] [--depth N] [--direction]`
// 이 노드를 바꾸면 무엇이 깨지나 — refactor safety 도구.
// MCP `query_ontology({operation: 'blast_radius'})` thin wrapper.

import { COLORS, KIND_COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import {
  assertBlastRadiusShape,
  assertQueryPlanShape,
} from '../lib/query-result-contract.mjs';
import {
  printQueryPlan,
  shouldBlockPlannedExecution,
} from '../lib/query-plan-output.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { formatAllowedValueError } from '../lib/suggestions.mjs';
import {
  formatUnknownFlagError,
  parseBoundedNonNegativeIntegerFlag,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';

const DEPTH_CAP = 20;
const ALLOWED_FLAGS = ['--vault', '--json', '--depth', '--direction', '--plan', '--force'];
const DIRECTION_VALUES = Object.freeze(['incoming', 'outgoing', 'both']);

const RISK_COLORS = {
  low: COLORS.green,
  medium: COLORS.yellow,
  high: COLORS.red,
};

export async function runBlastRadius(args) {
  const { slug, vault, json, depth, direction, plan: shouldPlan, force, error, help } = parseArgs(args);
  if (help) {
    printUsage(process.stdout);
    return 0;
  }
  if (error) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${error}\n`);
    printUsage();
    return 1;
  }
  const vaultRoot = resolveVaultRoot(vault);
  let plan = null;
  let result;
  try {
    const query = {
      operation: 'blast_radius',
      slug,
      depth,
      direction,
    };
    if (shouldPlan) {
      plan = await callMcpTool(vaultRoot, 'query_ontology', {
        ...query,
        operation: 'query_plan',
        targetOperation: 'blast_radius',
      });
      assertQueryPlanShape(plan, 'blast_radius');
      if (shouldBlockPlannedExecution(plan) && !force) {
        if (json) {
          process.stdout.write(JSON.stringify({ plan, skipped: true }, null, 2) + '\n');
        } else {
          printQueryPlan(plan, COLORS, {
            fallbackHint: 'narrow depth/direction or inspect node_profile first',
          });
          process.stdout.write(
            `\n${COLORS.yellow}skipped${COLORS.reset} blast_radius blocked by query_plan. Re-run with --force to execute anyway.\n`,
          );
        }
        return 1;
      }
    }
    result = await callMcpTool(vaultRoot, 'query_ontology', query);
    assertBlastRadiusShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  if (json) {
    process.stdout.write(JSON.stringify(plan ? { plan, result } : result, null, 2) + '\n');
    return 0;
  }
  if (plan) {
    printQueryPlan(plan, COLORS, {
      fallbackHint: 'narrow depth/direction or inspect node_profile first',
    });
  }
  render(result, slug);
  return 0;
}

function render(result, requestedSlug) {
  const sum = result?.summary ?? {};
  const risk = result?.risk ?? 'unknown';
  const rc = RISK_COLORS[risk] || COLORS.dim;
  process.stdout.write(
    `${COLORS.bold}${requestedSlug}${COLORS.reset} ${COLORS.dim}— blast radius${COLORS.reset}` +
      ` ${COLORS.dim}(depth ${result?.depth ?? 2}, ${result?.direction ?? 'incoming'})${COLORS.reset}\n` +
      `  risk ${rc}${risk}${COLORS.reset}` +
      ` · ${sum.affectedNodes ?? 0} 노드 · ${sum.affectedEdges ?? 0} 관계` +
      ` · ${sum.crossDomainEdges ?? 0} cross-domain\n\n`,
  );
  const byKind = result?.byKind ?? {};
  if (Object.keys(byKind).length > 0) {
    process.stdout.write(`${COLORS.dim}affected by kind${COLORS.reset}\n`);
    for (const [kind, count] of Object.entries(byKind).sort(([, a], [, b]) => b - a)) {
      const kc = KIND_COLORS[kind] || COLORS.dim;
      process.stdout.write(`  ${kc}${kind.padEnd(14)}${COLORS.reset} ${count}\n`);
    }
    process.stdout.write('\n');
  }
  const byDomain = result?.byDomain ?? {};
  if (Object.keys(byDomain).length > 0) {
    process.stdout.write(`${COLORS.dim}affected by domain${COLORS.reset}\n`);
    for (const [dom, count] of Object.entries(byDomain).sort(([, a], [, b]) => b - a)) {
      process.stdout.write(`  ${COLORS.blue}${dom.padEnd(40)}${COLORS.reset} ${count}\n`);
    }
    process.stdout.write('\n');
  }
  const rows = result?.nodes?.rows ?? [];
  if (rows.length > 0) {
    process.stdout.write(`${COLORS.dim}affected nodes (distance 별)${COLORS.reset}\n`);
    for (const r of rows) {
      const kind = r.node?.kind ?? '?';
      const kc = KIND_COLORS[kind] || COLORS.dim;
      const dist = `${COLORS.dim}d${r.distance}${COLORS.reset}`;
      const titleText = r.node?.title && r.node.title !== r.slug ? ` ${COLORS.dim}— ${r.node.title}${COLORS.reset}` : '';
      process.stdout.write(`  ${dist} ${kc}${r.slug}${COLORS.reset}${titleText}\n`);
    }
    printNextImpact(rows, requestedSlug, result?.depth ?? 2);
  }
}

function printNextImpact(rows, requestedSlug, depth) {
  const focus = rows.find((row) => typeof row?.slug === 'string' && row.slug.length > 0);
  if (!focus) return;
  const planDepth = Math.max(0, Math.min(DEPTH_CAP, Number.isInteger(depth) ? depth : 2));
  process.stdout.write(
    `\n${COLORS.bold}next impact${COLORS.reset} ${COLORS.cyan}${focus.slug}${COLORS.reset}` +
      ` ${COLORS.dim}— impact rows are candidates, not proof; inspect backlinks and node detail before refactor decisions${COLORS.reset}\n` +
      `  oh-my-ontology node ${focus.slug} [vault] --limit 20\n` +
      `  oh-my-ontology backlinks ${requestedSlug} [vault]\n` +
      `  oh-my-ontology reachability ${requestedSlug} [vault] --plan --depth ${planDepth} --direction both --limit 20\n`,
  );
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    plan: false,
    force: false,
    depth: undefined,
    direction: 'incoming',
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--plan') flags.plan = true;
    else if (a === '--force') flags.force = true;
    else if (a === '--depth') flags.depth = parseBoundedNonNegativeIntegerFlag('--depth', args[++i], { max: DEPTH_CAP });
    else if (a.startsWith('--depth=')) flags.depth = parseBoundedNonNegativeIntegerFlag('--depth', a.slice('--depth='.length), { max: DEPTH_CAP });
    else if (a === '--direction') flags.direction = parseRequiredFlagValue('--direction', args[++i]);
    else if (a.startsWith('--direction='))
      flags.direction = parseRequiredFlagValue('--direction', a.slice('--direction='.length));
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (positional.length === 0) {
    return { error: 'slug is required (e.g. `blast-radius capabilities/foo`)' };
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  if (!DIRECTION_VALUES.includes(flags.direction)) {
    return { error: formatAllowedValueError('--direction', flags.direction, DIRECTION_VALUES) };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 1 });
  if (vaultResult.error) return vaultResult;
  return {
    slug: positional[0],
    vault: vaultResult.vault,
    json: flags.json,
    plan: flags.plan,
    force: flags.force,
    depth: flags.depth,
    direction: flags.direction,
  };
}

function printUsage(stream = process.stderr) {
  stream.write(
      `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology blast-radius <slug> [vault] [--depth N] [--direction incoming|outgoing|both] [--plan] [--force] [--json]\n\n` +
      `default depth 2, --depth range 0-${DEPTH_CAP}, direction incoming (이 노드를 의존하는 무엇).\n` +
      `Use --plan to run query_plan(blast_radius) first; expensive or warning plans skip execution unless --force is passed.\n`,
  );
}
