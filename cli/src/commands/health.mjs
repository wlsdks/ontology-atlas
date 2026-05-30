// `oh-my-ontology health [vault]` — graph 무결성 dashboard.
// MCP `query_ontology({operation: 'health'})` thin wrapper.

import { COLORS } from '../lib/colors.mjs';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertHealthShape, healthResultExitCode } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import {
  formatUnknownFlagError,
  parseBoundedPositiveIntegerFlag,
  parseVaultFlag,
  resolveExclusiveVaultArg,
} from '../lib/cli-args.mjs';
import { DIAGNOSIS_OPTION_FLAGS, parseDiagnosisOption } from '../lib/diagnosis-options.mjs';
import { diagnosisStatusColor, healthCheckStatusColor } from '../lib/diagnosis-colors.mjs';

const ALLOWED_FLAGS = ['--vault', '--json', '--limit', ...DIAGNOSIS_OPTION_FLAGS];

const STATUS_ICONS = {
  pass: '✓',
  fail: '✗',
  warn: '⚠',
  info: 'ℹ',
};

export async function runHealth(args) {
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
    result = await callMcpTool(vaultRoot, 'query_ontology', { operation: 'health', ...options });
    assertHealthShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return healthResultExitCode(result);
  }
  const status = result?.status ?? 'unknown';
  const sc = diagnosisStatusColor(status, COLORS);
  const sum = result?.summary ?? {};
  process.stdout.write(
    `${COLORS.bold}vault health${COLORS.reset} ${sc}${status}${COLORS.reset}` +
      ` ${COLORS.dim}— ${sum.nodes ?? 0} 노드 · ${sum.edges ?? 0} 관계${COLORS.reset}\n\n`,
  );
  const checks = Array.isArray(result?.checks) ? result.checks : [];
  for (const c of checks) {
    const cc = healthCheckStatusColor(c.status, COLORS);
    const icon = STATUS_ICONS[c.status] || '·';
    process.stdout.write(
      `  ${cc}${icon}${COLORS.reset} ${cc}${(c.id || '').padEnd(28)}${COLORS.reset}` +
        ` ${COLORS.dim}${c.status}:${c.count}${COLORS.reset}` +
        ` ${COLORS.dim}${c.message ?? ''}${COLORS.reset}\n`,
    );
  }
  // dependency cycle / 분리된 그래프(islands) 강조 — 각 실패 검사에 드릴다운 명령 안내.
  if (sum.dependencyCycles) {
    process.stdout.write(`\n${COLORS.red}cycles ${sum.dependencyCycles}${COLORS.reset} — \`cycles\` 명령으로 자세히\n`);
  }
  // actionableComponents > 1 = 의미있는 노드가 분리된 섬으로 나뉨(연결 안 됨).
  // vault-readme 등 ignored 는 제외한 수라 1 초과면 실제 단절. `components` 로 목록.
  if (sum.actionableComponents > 1) {
    process.stdout.write(`${COLORS.yellow}components ${sum.actionableComponents}${COLORS.reset} — 그래프가 분리됨, \`components\` 명령으로 자세히\n`);
  }
  return healthResultExitCode(result);
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
    else if (a === '--limit') {
      const limit = parseBoundedPositiveIntegerFlag('--limit', args[++i], { max: 500 });
      if (limit instanceof Error) return { error: limit.message };
      options.nodeLimit = limit;
    } else if (a.startsWith('--limit=')) {
      const limit = parseBoundedPositiveIntegerFlag('--limit', a.slice('--limit='.length), { max: 500 });
      if (limit instanceof Error) return { error: limit.message };
      options.nodeLimit = limit;
    }
    else if (DIAGNOSIS_OPTION_FLAGS.includes(a)) {
      const error = parseDiagnosisOption(options, a, args[++i]);
      if (error) return { error: error.message };
    } else if (DIAGNOSIS_OPTION_FLAGS.includes(maybeFlag)) {
      const error = parseDiagnosisOption(options, maybeFlag, maybeValue);
      if (error) return { error: error.message };
    } else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json, options };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology health [vault] [--json]\n` +
      `       [--dependency-types A,B] [--component-types A,B]\n` +
      `       [--component-limit N] [--cycle-limit N] [--recommendation-limit N]\n` +
      `       [--order-limit N] [--node-limit N] [--limit N]\n\n` +
      `pass=healthy / warn=info-only / fail=blocking. exit 0 만 healthy.\n` +
      `--limit is a first-contact alias for --node-limit so agent_brief CLI fallbacks run directly.\n` +
      `Use --json for repeatable automation gates such as pnpm dogfood:health.\n` +
      `Failing health checks exit non-zero; use workspace-brief when you also need hotspots and next actions.\n` +
      `Use pnpm dogfood:status for the cheap human-readable health + workspace-brief + agent-brief + maintenance queue.\n` +
      `Tuning flags forward to query_ontology health for focused diagnostics.\n`,
  );
}
