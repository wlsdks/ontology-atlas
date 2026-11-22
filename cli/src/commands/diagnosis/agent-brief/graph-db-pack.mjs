import { cliInvocation } from '../../../lib/self-invocation.mjs';
import { graphDbShellQuote } from './shell-words.mjs';

const WORKFLOW_GUIDE_PATH = 'docs/AGENT-GRAPH-WORKFLOW.md';

export function formatGraphDbCliPack(result, vaultRoot) {
  const graphDbQueryPack = Array.isArray(result?.graphDbQueryPack) ? result.graphDbQueryPack : [];
  const commands = [];
  const seen = new Set();
  const selfCheckCommand = graphDbWithFlags(`${cliInvocation()} agent-brief ${graphDbShellQuote(vaultRoot)}`, [
    '--verify-fallbacks',
    '--json',
    '--exit-zero',
    '--fallback-timeout-ms 15000',
    '--fallback-slow-ms 5000',
    '--fallback-concurrency 4',
  ]);
  for (const item of Array.isArray(graphDbQueryPack) ? graphDbQueryPack : []) {
    for (const command of graphDbPackItemCliCommands(item)) {
      const runnableCommand = command.replaceAll('[vault]', graphDbShellQuote(vaultRoot));
      if (!runnableCommand || seen.has(runnableCommand)) continue;
      seen.add(runnableCommand);
      commands.push({ id: item.id, intent: item.intent, goal: item.goal, command: runnableCommand });
    }
  }
  return [
    '# ontology-atlas Graph DB CLI pack',
    '# Run these commands when the MCP connector is unavailable.',
    `# Feature guide: ${WORKFLOW_GUIDE_PATH} explains CLI-only use, MCP-connected use, graph DB differences, and verification checks.`,
    ...formatModeGuideComments(result),
    '# Self-check first: Claude Code/Codex automation can parse ok, performanceOk, failed, timeoutMs, slowThresholdMs, concurrency, wallMs, slow, commands[].timedOut, commands[].slow, and slowest.elapsedMs.',
    selfCheckCommand,
    '',
    '# The selected vault path is already inserted; plan scans first, keep traversal bounded, and use follow-up evidence before writing.',
    '# Evidence rule: scan rows are candidates, not proof; cite follow-up detail before writing or refactoring.',
    '# Proof checklist: report totalMatches/limited/row count, run node_profile or blast_radius for node rows, run explain/path/relation-check for edge rows, and report evidence.pathsComplete for paths.',
    '',
    ...commands.flatMap(({ id, intent, goal, command }) => [
      `# ${id}`,
      ...graphDbCommentLine('intent', intent),
      ...graphDbCommentLine('goal', goal),
      command,
    ]),
  ].join('\n');
}

function formatModeGuideComments(result) {
  const rows = modeComparisonRows(result);
  if (rows.length === 0) return [];
  return [
    '# Mode guide:',
    ...rows.map((row) => `# - ${row.label}: ${row.gives}`),
  ];
}

export function modeComparisonRows(result) {
  return Array.isArray(result?.docs?.modeComparison)
    ? result.docs.modeComparison.filter((row) => row && typeof row.label === 'string' && typeof row.gives === 'string')
    : [];
}

function graphDbCommentLine(label, value) {
  if (typeof value !== 'string' || value.trim() === '') return [];
  return [`# ${label}: ${value.replace(/\s+/g, ' ').trim()}`];
}

function graphDbPackItemCliCommands(item) {
  if (!item || !Array.isArray(item.calls)) return [];
  return item.calls.map(graphDbToolCallCliCommand).filter(Boolean);
}

function graphDbToolCallCliCommand(call) {
  if (!call || call.tool !== 'query_ontology' || !call.arguments) return null;
  const args = call.arguments;
  if (args.operation === 'query_plan') {
    if (args.targetOperation === 'match_nodes') return graphDbMatchNodesCliCommand(args, { plan: true });
    if (args.targetOperation === 'match_edges') return graphDbMatchEdgesCliCommand(args, { plan: true });
    if (args.targetOperation === 'centrality') {
      return graphDbWithFlags(`${cliInvocation()} hubs [vault]`, [
        '--plan',
        graphDbPositiveFlag('--limit', args.limit),
        graphDbCsvFlag('--types', args.types),
      ]);
    }
    if (args.targetOperation === 'all_paths') {
      return graphDbAllPathsCliCommand(args, { plan: true });
    }
    return null;
  }
  if (args.operation === 'facets') {
    return graphDbWithFlags(`${cliInvocation()} facets [vault]`, [graphDbPositiveFlag('--limit', args.limit)]);
  }
  if (args.operation === 'schema') {
    return graphDbWithFlags(`${cliInvocation()} schema [vault]`, [graphDbPositiveFlag('--limit', args.limit)]);
  }
  if (args.operation === 'match_nodes') return graphDbMatchNodesCliCommand(args);
  if (args.operation === 'match_edges') return graphDbMatchEdgesCliCommand(args);
  if (args.operation === 'domain_matrix') {
    return graphDbWithFlags(`${cliInvocation()} domain-matrix [vault]`, [
      graphDbStringFlag('--project', args.project),
      graphDbPositiveFlag('--limit', args.limit),
      graphDbCsvFlag('--types', args.types),
    ]);
  }
  if (args.operation === 'centrality') {
    return graphDbWithFlags(`${cliInvocation()} hubs [vault]`, [
      graphDbPositiveFlag('--limit', args.limit),
      graphDbCsvFlag('--types', args.types),
    ]);
  }
  if (args.operation === 'all_paths') return graphDbAllPathsCliCommand(args, { plan: true });
  if (args.operation === 'explain_relation') {
    const from = graphDbStringArg(args.from, '<from-slug>');
    const to = graphDbStringArg(args.to, '<to-slug>');
    return graphDbWithFlags(`${cliInvocation()} explain ${graphDbShellQuote(from)} ${graphDbShellQuote(to)} [vault]`, [
      graphDbStringFlag('--direction', args.direction),
      graphDbNonNegativeFlag('--max-hops', args.maxHops),
      graphDbCsvFlag('--types', args.types),
      graphDbPositiveFlag('--limit', args.limit),
    ]);
  }
  return null;
}

function graphDbAllPathsCliCommand(args, options = {}) {
  const from = graphDbStringArg(args.from, '<from-slug>');
  const to = graphDbStringArg(args.to, '<to-slug>');
  return graphDbWithFlags(`${cliInvocation()} all-paths ${graphDbShellQuote(from)} ${graphDbShellQuote(to)} [vault]`, [
    options.plan ? '--plan' : null,
    options.plan ? '--force' : null,
    graphDbNonNegativeFlag('--max-hops', args.maxHops),
    graphDbCsvFlag('--types', args.types),
    graphDbPositiveFlag('--search-budget', args.searchBudget),
    graphDbPositiveFlag('--limit', args.limit),
  ]);
}

function graphDbMatchNodesCliCommand(args, options = {}) {
  return graphDbWithFlags(`${cliInvocation()} match-nodes [vault]`, [
    options.plan ? '--plan' : null,
    graphDbStringFlag('--kind', args.kind),
    graphDbStringFlag('--domain', args.domain),
    graphDbStringFlag('--slug-contains', args.slugContains),
    graphDbNonNegativeFlag('--min-degree', args.minDegree),
    graphDbNonNegativeFlag('--max-degree', args.maxDegree),
    graphDbNonNegativeFlag('--min-in-degree', args.minInDegree),
    graphDbNonNegativeFlag('--min-out-degree', args.minOutDegree),
    graphDbBooleanFlag('--has-incoming', args.hasIncoming),
    graphDbBooleanFlag('--has-outgoing', args.hasOutgoing),
    graphDbStringFlag('--sort', args.sort),
    graphDbPositiveFlag('--limit', args.limit),
  ]);
}

function graphDbMatchEdgesCliCommand(args, options = {}) {
  return graphDbWithFlags(`${cliInvocation()} match-edges [vault]`, [
    options.plan ? '--plan' : null,
    graphDbStringFlag('--from', args.from),
    graphDbStringFlag('--to', args.to),
    graphDbStringFlag('--from-kind', args.fromKind),
    graphDbStringFlag('--to-kind', args.toKind),
    graphDbStringFlag('--type', args.type),
    graphDbCsvFlag('--types', args.types),
    graphDbBooleanFlag('--include-external', args.includeExternal),
    graphDbBooleanFlag('--include-unresolved', args.includeUnresolved),
    graphDbPositiveFlag('--limit', args.limit),
  ]);
}

function graphDbWithFlags(command, flags) {
  return [command, ...flags.filter(Boolean)].join(' ');
}

function graphDbStringArg(value, fallback) {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function graphDbStringFlag(name, value) {
  return typeof value === 'string' && value.trim() ? `${name} ${graphDbShellQuote(value)}` : null;
}

function graphDbPositiveFlag(name, value) {
  return Number.isInteger(value) && value > 0 ? `${name} ${value}` : null;
}

function graphDbNonNegativeFlag(name, value) {
  return Number.isInteger(value) && value >= 0 ? `${name} ${value}` : null;
}

function graphDbBooleanFlag(name, value) {
  return value === true ? name : null;
}

function graphDbCsvFlag(name, value) {
  if (!Array.isArray(value) || value.length === 0) return null;
  const values = value.filter((item) => typeof item === 'string' && item.trim().length > 0);
  return values.length > 0 ? `${name} ${values.map(graphDbShellQuote).join(',')}` : null;
}
