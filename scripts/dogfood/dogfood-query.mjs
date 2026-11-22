#!/usr/bin/env node
// One read of this repository's own vault through the MCP server, for the `dogfood:*` scripts.
// `node scripts/dogfood/dogfood-query.mjs <check> [--json]`: the JSON answer with `--json`, one
// summary line without it. Health and the two briefs exit 1 when the vault is not in shape, so a
// script that chains them stops there.

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { callMcpTool } from '../../mcp/scripts/call-tool.mjs';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const VAULT = resolve(ROOT, 'docs/ontology');

export const DOGFOOD_QUERIES = Object.freeze({
  compile: { tool: 'compile_ontology', args: { summary: true } },
  health: { tool: 'query_ontology', args: { operation: 'health' } },
  'workspace-brief': { tool: 'query_ontology', args: { operation: 'workspace_brief' } },
  'agent-brief': { tool: 'query_ontology', args: { operation: 'agent_brief' } },
  growth: { tool: 'query_ontology', args: { operation: 'growth_plan' } },
  maintenance: { tool: 'query_ontology', args: { operation: 'maintenance_plan' } },
});

const failedChecks = (checks) => (Array.isArray(checks) ? checks.filter((check) => check?.status === 'fail') : []);

/** 0 when the answer says the vault is in shape for that check, otherwise 1. */
export function dogfoodQueryExitCode(check, result) {
  if (check === 'health') {
    const checks = result?.checks;
    if (!Array.isArray(checks) || checks.length === 0) return 1;
    return result.status === 'healthy' && failedChecks(checks).length === 0 ? 0 : 1;
  }
  if (check === 'workspace-brief') {
    const checks = result?.health?.checks;
    if (!Array.isArray(checks) || checks.length === 0 || !Array.isArray(result?.nextActions)) return 1;
    if (result.nextActions.some((action) => action?.severity === 'fail')) return 1;
    return failedChecks(checks).length === 0 ? 0 : 1;
  }
  if (check === 'agent-brief') {
    return result?.status === 'healthy' && result?.readiness?.status === 'ready' ? 0 : 1;
  }
  return 0;
}

/** One line a person reads at a glance. */
export function dogfoodQuerySummary(check, result) {
  const parts = [];
  if (typeof result?.status === 'string') parts.push(`status=${result.status}`);
  if (typeof result?.readiness?.status === 'string') parts.push(`readiness=${result.readiness.status}`);
  const checks = Array.isArray(result?.checks) ? result.checks : result?.health?.checks;
  if (Array.isArray(checks)) parts.push(`failed checks=${failedChecks(checks).length}/${checks.length}`);
  const nodes = result?.summary?.nodes ?? result?.nodeCount ?? result?.compiledSummary?.nodes;
  if (Number.isInteger(nodes)) parts.push(`nodes=${nodes}`);
  const items = result?.summary?.items ?? result?.summary?.total;
  if (Number.isInteger(items)) parts.push(`items=${items}`);
  return `[dogfood:${check}] ${parts.length > 0 ? parts.join(' · ') : 'answered'}`;
}

export async function runDogfoodQuery(argv = process.argv.slice(2), {
  call = callMcpTool,
  stdout = process.stdout,
  stderr = process.stderr,
} = {}) {
  const json = argv.includes('--json');
  const rest = argv.filter((arg) => arg !== '--json' && arg !== '--');
  const check = rest[0];
  if (rest.length !== 1 || !Object.hasOwn(DOGFOOD_QUERIES, check)) {
    stderr.write(`usage: node scripts/dogfood/dogfood-query.mjs <${Object.keys(DOGFOOD_QUERIES).join('|')}> [--json]\n`);
    return 2;
  }
  const { tool, args } = DOGFOOD_QUERIES[check];
  let result;
  try {
    result = await call(VAULT, tool, args);
  } catch (error) {
    stderr.write(`[dogfood:${check}] ${error instanceof Error ? error.message : String(error)}\n`);
    return 2;
  }
  stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${dogfoodQuerySummary(check, result)}\n`);
  return dogfoodQueryExitCode(check, result);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await runDogfoodQuery();
}
