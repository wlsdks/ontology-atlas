// `oh-my-ontology maintenance [vault]` — graph maintenance work queue.
// MCP `query_ontology({operation: 'maintenance_plan'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertQueryOperation } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';

const LIMIT_CAP = 500;
const ALLOWED_FLAGS = [
  '--vault',
  '--json',
  '--limit',
  '--after-action-id',
  '--executable-only',
  '--phases',
  '--severities',
  '--kinds',
];

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

const SEVERITY_COLORS = {
  fail: COLORS.red,
  warn: COLORS.yellow,
  info: COLORS.dim,
};

export async function runMaintenance(args) {
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
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', parsed.toolArgs);
    assertQueryOperation(result, 'maintenance_plan');
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }

  if (parsed.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return 0;
  }

  renderMaintenance(result);
  return 0;
}

function renderMaintenance(result) {
  const summary = result?.summary ?? {};
  const cursor = result?.cursor ?? {};
  const filters = result?.filters ?? {};
  const actions = Array.isArray(result?.actions) ? result.actions : [];

  process.stdout.write(
    `${COLORS.bold}maintenance plan${COLORS.reset}` +
      ` ${COLORS.dim}— ${summary.remainingActions ?? 0} remaining / ${summary.filteredActions ?? 0} filtered / ${summary.totalActions ?? 0} total${COLORS.reset}\n`,
  );
  process.stdout.write(
    `${COLORS.dim}cursor:${COLORS.reset} found=${String(cursor.found)}` +
      ` after=${cursor.afterActionId ?? 'none'} next=${cursor.nextAfterActionId ?? 'none'} hasMore=${String(cursor.hasMore)}\n`,
  );
  const filterText = [
    filters.executableOnly ? 'executableOnly=true' : null,
    formatListFilter('phases', filters.phases),
    formatListFilter('severities', filters.severities),
    formatListFilter('kinds', filters.kinds),
  ].filter(Boolean).join(' · ');
  if (filterText) process.stdout.write(`${COLORS.dim}filters:${COLORS.reset} ${filterText}\n`);
  const summaryText = [
    `compileIssues:${summary.compileIssues ?? 0}`,
    `cycles:${summary.dependencyCycles ?? 0}`,
    `canonicalize:${summary.canonicalizationActions ?? 0}`,
    `dangling:${summary.danglingReferences ?? 0}`,
    `relations:${summary.relationRecommendations ?? 0}`,
    `external:${summary.externalElementRefs ?? 0}`,
    `ignoredExternal:${summary.externalElementRefsIgnored ?? 0}`,
  ].join(', ');
  process.stdout.write(`${COLORS.dim}summary:${COLORS.reset} ${summaryText}\n`);
  const bucketText = [
    formatBucket('phase', result?.byPhase),
    formatBucket('severity', result?.bySeverity),
    formatBucket('kind', result?.byKind),
  ].filter(Boolean).join(' · ');
  if (bucketText) process.stdout.write(`${COLORS.dim}buckets:${COLORS.reset} ${bucketText}\n`);
  process.stdout.write('\n');

  if (actions.length === 0) {
    const reason = cursor.reason ? ` ${COLORS.dim}(${cursor.reason})${COLORS.reset}` : '';
    process.stdout.write(`${COLORS.green}no maintenance actions on this page${COLORS.reset}${reason}\n`);
    return;
  }

  for (const action of actions) {
    const sev = SEVERITY_COLORS[action.severity] || COLORS.dim;
    const executable = action.executable ? `${COLORS.green}exec${COLORS.reset}` : `${COLORS.dim}review${COLORS.reset}`;
    process.stdout.write(
      `  ${sev}[${action.severity || 'info'}]${COLORS.reset}` +
        ` ${COLORS.bold}${action.id}${COLORS.reset}` +
        ` ${COLORS.dim}${action.phase}/${action.kind} · ${executable} · score ${action.score ?? '?'}${COLORS.reset}\n`,
    );
    if (action.reason) process.stdout.write(`       ${COLORS.dim}${action.reason}${COLORS.reset}\n`);
    if (action.proposedAction?.tool) {
      process.stdout.write(
        `       ${COLORS.cyan}${action.proposedAction.tool}${COLORS.reset}` +
          ` ${COLORS.dim}${JSON.stringify(action.proposedAction.args ?? {})}${COLORS.reset}\n`,
      );
    }
  }

  if (result?.nextExecutableAction || result?.nextReviewAction) {
    process.stdout.write('\n');
    if (result.nextExecutableAction) {
      process.stdout.write(`${COLORS.dim}next executable:${COLORS.reset} ${result.nextExecutableAction.id}\n`);
    }
    if (result.nextReviewAction) {
      process.stdout.write(`${COLORS.dim}next review:${COLORS.reset} ${result.nextReviewAction.id}\n`);
    }
  }
}

function formatListFilter(label, value) {
  return Array.isArray(value) && value.length > 0 ? `${label}=${value.join(',')}` : null;
}

function formatBucket(label, value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const entries = Object.entries(value)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort(([a], [b]) => a.localeCompare(b));
  return entries.length > 0 ? `${label} ${entries.map(([key, count]) => `${key}:${count}`).join(',')}` : null;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = {
    vault: null,
    json: false,
    limit: 20,
    afterActionId: null,
    executableOnly: false,
    phases: [],
    severities: [],
    kinds: [],
  };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--executable-only') flags.executableOnly = true;
    else if (a === '--limit') flags.limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: LIMIT_CAP });
    else if (a.startsWith('--limit='))
      flags.limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: LIMIT_CAP });
    else if (a === '--after-action-id') flags.afterActionId = parseRequiredFlagValue('--after-action-id', args[++i]);
    else if (a.startsWith('--after-action-id='))
      flags.afterActionId = parseRequiredFlagValue('--after-action-id', a.slice('--after-action-id='.length));
    else if (a === '--phases') flags.phases = parseCsvFlag('--phases', args[++i]);
    else if (a.startsWith('--phases=')) flags.phases = parseCsvFlag('--phases', a.slice('--phases='.length));
    else if (a === '--severities') flags.severities = parseCsvFlag('--severities', args[++i]);
    else if (a.startsWith('--severities='))
      flags.severities = parseCsvFlag('--severities', a.slice('--severities='.length));
    else if (a === '--kinds') flags.kinds = parseCsvFlag('--kinds', args[++i]);
    else if (a.startsWith('--kinds=')) flags.kinds = parseCsvFlag('--kinds', a.slice('--kinds='.length));
    else if (a.startsWith('--')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  const toolArgs = {
    operation: 'maintenance_plan',
    limit: flags.limit,
  };
  if (flags.afterActionId) toolArgs.afterActionId = flags.afterActionId;
  if (flags.executableOnly) toolArgs.executableOnly = true;
  if (flags.phases.length > 0) toolArgs.phases = flags.phases;
  if (flags.severities.length > 0) toolArgs.severities = flags.severities;
  if (flags.kinds.length > 0) toolArgs.kinds = flags.kinds;
  return { vault: vaultResult.vault, json: flags.json, toolArgs };
}

function parseCsvFlag(flag, value) {
  const parsed = parseRequiredFlagValue(flag, value);
  if (parsed instanceof Error) return parsed;
  const values = parsed.split(',').map((item) => item.trim()).filter(Boolean);
  return values.length > 0 ? values : new Error(`${flag} requires at least one value`);
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology maintenance [vault] [--vault path] [--json] [--limit N]\n` +
      `      [--after-action-id ID] [--executable-only]\n` +
      `      [--phases validate,repair,link,materialize,review]\n` +
      `      [--severities fail,warn,info]\n` +
      `      [--kinds inspect_compile_issue,canonicalize_graph_arrays,...]\n\n` +
      `Inspect the MCP maintenance_plan work queue without writing to the vault.\n` +
      `Non-JSON output includes cursor state, summary counts, bucket counts, and\n` +
      `current-page next executable/review pointers when actions are present.\n` +
      `--limit range 1-${LIMIT_CAP}.\n`,
  );
}
