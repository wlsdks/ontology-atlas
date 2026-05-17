// `oh-my-ontology workspace-brief [vault]` — first-contact + next actions.
// MCP `query_ontology({operation: 'workspace_brief'})` thin wrapper.

import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertQueryOperation, workspaceBriefExitCode } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { formatUnknownFlagError, parseVaultFlag, resolveExclusiveVaultArg } from '../lib/cli-args.mjs';
import { DIAGNOSIS_OPTION_FLAGS, parseDiagnosisOption } from '../lib/diagnosis-options.mjs';
import { diagnosisStatusColor } from '../lib/diagnosis-colors.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', ...DIAGNOSIS_OPTION_FLAGS];

const COLORS = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};
const KIND_COLORS = {
  project: COLORS.magenta,
  domain: COLORS.blue,
  capability: COLORS.cyan,
  element: COLORS.green,
  document: COLORS.dim,
  'vault-readme': COLORS.dim,
};
const SEVERITY_COLORS = {
  fail: COLORS.red,
  warn: COLORS.yellow,
  info: COLORS.dim,
};
export async function runWorkspaceBrief(args) {
  const { vault, json, options, error, help } = parseArgs(args);
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
  let result;
  try {
    result = await callMcpTool(vaultRoot, 'query_ontology', { operation: 'workspace_brief', ...options });
    assertQueryOperation(result, 'workspace_brief');
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return workspaceBriefExitCode(result);
  }
  render(result);
  return workspaceBriefExitCode(result);
}

function render(result) {
  const status = result?.status ?? 'unknown';
  const sum = result?.summary ?? {};
  const sc = diagnosisStatusColor(status, COLORS);
  process.stdout.write(
    `${COLORS.bold}workspace brief${COLORS.reset} ${sc}${status}${COLORS.reset}` +
      ` ${COLORS.dim}— ${sum.nodes ?? 0} 노드 · ${sum.edges ?? 0} 관계` +
      ` · ${sum.projects ?? 0} 프로젝트 · ${sum.domains ?? 0} 도메인${COLORS.reset}\n\n`,
  );

  // Hotspots (degree 상위)
  const hotspots = Array.isArray(result?.hotspots) ? result.hotspots : [];
  if (hotspots.length > 0) {
    process.stdout.write(`${COLORS.dim}HOTSPOTS${COLORS.reset} ${COLORS.dim}(degree 상위)${COLORS.reset}\n`);
    for (let i = 0; i < Math.min(hotspots.length, 5); i += 1) {
      const h = hotspots[i];
      const kc = KIND_COLORS[h.kind] || COLORS.dim;
      const rank = String(i + 1).padStart(2);
      process.stdout.write(
        `  ${COLORS.bold}${rank}${COLORS.reset} ${kc}${h.slug.padEnd(50)}${COLORS.reset}` +
          ` ${COLORS.dim}deg ${h.degree}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  // Projects 요약
  const projects = result?.projects?.maps ?? [];
  if (projects.length > 0) {
    process.stdout.write(`${COLORS.dim}PROJECT 별 노드 수${COLORS.reset}\n`);
    for (const p of projects) {
      const pn = p.node?.title || p.project;
      const ps = p.summary ?? {};
      process.stdout.write(
        `  ${COLORS.magenta}${pn.padEnd(30)}${COLORS.reset}` +
          ` ${COLORS.dim}${ps.nodes ?? 0} 노드 · ${ps.domains ?? 0} 도메인 · ${ps.capabilities ?? 0} 역량 · ${ps.elements ?? 0} 요소${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  const checks = Array.isArray(result?.health?.checks) ? result.health.checks : [];
  if (checks.length > 0) {
    const summary = checks.map((check) => `${check.id}:${check.status}:${check.count}`).join(', ');
    process.stdout.write(`${COLORS.dim}HEALTH CHECKS${COLORS.reset} ${COLORS.dim}${summary}${COLORS.reset}\n\n`);
  }

  const growth = result?.growth;
  if (growth && typeof growth === 'object' && !Array.isArray(growth)) {
    const parts = [
      `actions:${growth.totalActions ?? 0}`,
      `relations:${growth.relationRecommendations ?? 0}`,
      `dangling:${growth.danglingReferences ?? 0}`,
      `external:${growth.externalElementRefs ?? 0}`,
      `ignoredExternal:${growth.externalElementRefsIgnored ?? 0}`,
    ];
    process.stdout.write(`${COLORS.dim}GROWTH${COLORS.reset} ${COLORS.dim}${parts.join(', ')}${COLORS.reset}\n\n`);
  }

  // Next actions
  const next = Array.isArray(result?.nextActions) ? result.nextActions : [];
  if (next.length > 0) {
    process.stdout.write(`${COLORS.dim}NEXT ACTIONS${COLORS.reset}\n`);
    for (const a of next) {
      const sev = SEVERITY_COLORS[a.severity] || COLORS.dim;
      process.stdout.write(
        `  ${sev}[${(a.severity || 'info').padEnd(4)}]${COLORS.reset}` +
          ` ${COLORS.bold}${a.kind}${COLORS.reset}` +
          ` ${COLORS.dim}× ${a.count ?? '?'}${COLORS.reset}\n`,
      );
      if (a.message) process.stdout.write(`         ${COLORS.dim}${a.message}${COLORS.reset}\n`);
    }
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false };
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const [maybeFlag, maybeValue] = a.includes('=') ? a.split(/=(.*)/s, 2) : [a, null];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (DIAGNOSIS_OPTION_FLAGS.includes(a)) {
      const error = parseDiagnosisOption(options, a, args[++i]);
      if (error) return { error: error.message };
    } else if (DIAGNOSIS_OPTION_FLAGS.includes(maybeFlag)) {
      const error = parseDiagnosisOption(options, maybeFlag, maybeValue);
      if (error) return { error: error.message };
    } else if (a.startsWith('--')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json, options };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology workspace-brief [vault] [--json]\n` +
      `       [--dependency-types A,B] [--component-types A,B]\n` +
      `       [--component-limit N] [--cycle-limit N] [--recommendation-limit N]\n` +
      `       [--order-limit N] [--node-limit N]\n\n` +
      `first-contact dashboard: status + hotspots + project 요약 + next actions.\n` +
      `Non-JSON output includes HEALTH CHECKS id:status:count coverage and\n` +
      `GROWTH actions/relations/dangling/external/ignoredExternal counts.\n` +
      `Tuning flags forward to query_ontology workspace_brief for focused diagnostics.\n`,
  );
}
