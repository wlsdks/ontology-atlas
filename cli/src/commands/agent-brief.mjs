// `oh-my-ontology agent-brief [vault]` — Claude Code/Codex handoff snapshot.
// MCP `query_ontology({operation: 'agent_brief'})` thin wrapper.

import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { callMcpTool } from '../lib/mcp-call.mjs';
import { assertAgentBriefShape, agentBriefExitCode } from '../lib/query-result-contract.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';
import { formatUnknownFlagError, parseVaultFlag, resolveExclusiveVaultArg } from '../lib/cli-args.mjs';
import { DIAGNOSIS_OPTION_FLAGS, parseDiagnosisOption } from '../lib/diagnosis-options.mjs';
import { diagnosisStatusColor } from '../lib/diagnosis-colors.mjs';

const CLI_ENTRYPOINT = fileURLToPath(new URL('../index.mjs', import.meta.url));
const ALLOWED_FLAGS = ['--vault', '--json', '--prompt', '--verify-fallbacks', ...DIAGNOSIS_OPTION_FLAGS];

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
const READINESS_COLORS = {
  ready: COLORS.green,
  needs_attention: COLORS.yellow,
  needs_shape: COLORS.red,
};

export async function runAgentBrief(args) {
  const { vault, json, prompt, verifyFallbacks, options, error, help } = parseArgs(args);
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
    result = await callMcpTool(vaultRoot, 'query_ontology', { operation: 'agent_brief', ...options });
    assertAgentBriefShape(result);
  } catch (err) {
    process.stderr.write(
      `${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`,
    );
    return 2;
  }
  if (json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return agentBriefExitCode(result);
  }
  if (prompt) {
    process.stdout.write(result.handoffPrompt.trimEnd() + '\n');
    return agentBriefExitCode(result);
  }
  if (verifyFallbacks) {
    const verifyCode = verifyCliFallbacks(result, vaultRoot);
    return Math.max(agentBriefExitCode(result), verifyCode);
  }
  render(result);
  return agentBriefExitCode(result);
}

function verifyCliFallbacks(result, vaultRoot) {
  const commands = Array.isArray(result.cliFallbackCommands) ? result.cliFallbackCommands : [];
  let failed = 0;
  process.stdout.write(`${COLORS.bold}agent fallback check${COLORS.reset} ${COLORS.dim}${commands.length} command(s)${COLORS.reset}\n`);
  for (const raw of commands) {
    const command = raw.replace('[vault]', vaultRoot);
    const parsed = parseFallbackCommand(command);
    if (parsed.error) {
      failed += 1;
      process.stdout.write(`  ${COLORS.red}FAIL${COLORS.reset} ${command}\n`);
      process.stdout.write(`       ${COLORS.red}${parsed.error}${COLORS.reset}\n`);
      continue;
    }
    const child = spawnSync(process.execPath, [CLI_ENTRYPOINT, ...parsed.args], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024 * 8,
    });
    if (child.status === 0) {
      process.stdout.write(`  ${COLORS.green}PASS${COLORS.reset} ${raw}\n`);
      continue;
    }
    failed += 1;
    process.stdout.write(`  ${COLORS.red}FAIL${COLORS.reset} ${raw}\n`);
    const sample = String(child.stderr || child.stdout || '').split('\n').filter(Boolean).slice(0, 6).join('\n       ');
    if (sample) process.stdout.write(`       ${sample}\n`);
    if (child.error) process.stdout.write(`       ${COLORS.red}${child.error.message}${COLORS.reset}\n`);
  }
  const passed = commands.length - failed;
  const color = failed > 0 ? COLORS.red : COLORS.green;
  process.stdout.write(`${color}${failed > 0 ? 'failed' : 'ok'}${COLORS.reset} ${passed}/${commands.length} fallback command(s) passed\n`);
  return failed > 0 ? 1 : 0;
}

function parseFallbackCommand(command) {
  const tokens = splitShellWords(command);
  if (tokens.length === 0) return { error: 'empty fallback command' };
  if (tokens[0] !== 'oh-my-ontology') return { error: `expected oh-my-ontology command, got ${tokens[0]}` };
  return { args: tokens.slice(1) };
}

function splitShellWords(input) {
  const tokens = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (quote) {
      if (ch === quote) quote = null;
      else if (quote === "'" && input.slice(i, i + 4) === "'\\''") {
        current += "'";
        i += 3;
      } else current += ch;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }
    if (/\s/.test(ch)) {
      if (current) {
        tokens.push(current);
        current = '';
      }
      continue;
    }
    current += ch;
  }
  if (quote) return [];
  if (current) tokens.push(current);
  return tokens;
}

function render(result) {
  const status = result.status;
  const readiness = result.readiness;
  const graph = result.graph ?? {};
  const sc = diagnosisStatusColor(status, COLORS);
  const rc = READINESS_COLORS[readiness.status] ?? COLORS.dim;
  process.stdout.write(
    `${COLORS.bold}agent brief${COLORS.reset} ${sc}${status}${COLORS.reset}` +
      ` ${COLORS.dim}— readiness ${rc}${readiness.status}${COLORS.reset}` +
      ` ${COLORS.dim}${readiness.score}/100 · ${graph.nodes ?? 0} 노드 · ${graph.edges ?? 0} 관계` +
      ` · ${readiness.healthChecks} health checks${COLORS.reset}\n\n`,
  );

  if (typeof result.handoffPrompt === 'string' && result.handoffPrompt.trim()) {
    process.stdout.write(
      `${COLORS.dim}HANDOFF PROMPT${COLORS.reset} ${COLORS.dim}available in --json as .handoffPrompt for Claude Code/Codex paste-in setup${COLORS.reset}\n\n`,
    );
  }

  const entrypoints = Array.isArray(result.entrypoints) ? result.entrypoints : [];
  if (entrypoints.length > 0) {
    process.stdout.write(`${COLORS.dim}ENTRYPOINTS${COLORS.reset} ${COLORS.dim}(agent가 먼저 볼 고연결 노드)${COLORS.reset}\n`);
    for (let i = 0; i < Math.min(entrypoints.length, 5); i += 1) {
      const node = entrypoints[i];
      const kc = KIND_COLORS[node.kind] || COLORS.dim;
      const titleText = node.title && node.title !== node.slug ? ` ${COLORS.dim}— ${node.title}${COLORS.reset}` : '';
      process.stdout.write(
        `  ${String(i + 1).padStart(2)} ${kc}${node.slug.padEnd(48)}${COLORS.reset}` +
          `${titleText} ${COLORS.dim}deg ${node.degree}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  process.stdout.write(`${COLORS.dim}FIRST MCP CALLS${COLORS.reset}\n`);
  for (const call of result.firstCalls) {
    process.stdout.write(`  ${COLORS.cyan}${formatToolCall(call)}${COLORS.reset}\n`);
  }
  process.stdout.write('\n');

  const cliFallbackCommands = Array.isArray(result.cliFallbackCommands) ? result.cliFallbackCommands : [];
  if (cliFallbackCommands.length > 0) {
    process.stdout.write(`${COLORS.dim}CLI FALLBACKS${COLORS.reset} ${COLORS.dim}(MCP connector unavailable)${COLORS.reset}\n`);
    for (const command of cliFallbackCommands) {
      process.stdout.write(`  ${COLORS.cyan}${command}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  const graphDbQueryPack = Array.isArray(result.graphDbQueryPack) ? result.graphDbQueryPack : [];
  if (graphDbQueryPack.length > 0) {
    process.stdout.write(`${COLORS.dim}GRAPH DB QUERY PACK${COLORS.reset} ${COLORS.dim}(MCP + CLI fallback)${COLORS.reset}\n`);
    for (const item of graphDbQueryPack) {
      const calls = item.calls.map((call) => formatToolCall(call)).join(' → ');
      process.stdout.write(`  ${COLORS.bold}${item.id}${COLORS.reset} ${COLORS.dim}${item.intent}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.dim}${item.goal}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.cyan}${calls}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  process.stdout.write(`${COLORS.dim}PLAYBOOKS${COLORS.reset}\n`);
  for (const playbook of result.playbooks) {
    const calls = playbook.calls.map((call) => call.arguments.operation).join(' → ');
    process.stdout.write(`  ${COLORS.bold}${playbook.id}${COLORS.reset} ${COLORS.dim}${calls}${COLORS.reset}\n`);
    process.stdout.write(`     ${COLORS.dim}${playbook.goal}${COLORS.reset}\n`);
    renderChecklist('evidence', playbook.evidence, COLORS.green);
    renderChecklist('stop if', playbook.stopWhen, COLORS.yellow);
  }
  process.stdout.write('\n');

  if (Array.isArray(result.traversalStrategy) && result.traversalStrategy.length > 0) {
    process.stdout.write(`${COLORS.dim}TRAVERSAL STRATEGY${COLORS.reset}\n`);
    for (const strategy of result.traversalStrategy) {
      const calls = strategy.calls.map((call) => formatToolCall(call)).join(' → ');
      process.stdout.write(
        `  ${COLORS.bold}${String(strategy.id).padEnd(24)}${COLORS.reset}` +
          ` ${COLORS.dim}${strategy.priority} · ${strategy.goal}${COLORS.reset}\n`,
      );
      process.stdout.write(`     ${COLORS.dim}when: ${strategy.useWhen}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.cyan}${calls}${COLORS.reset}\n`);
      renderChecklist('evidence', strategy.evidence, COLORS.green);
      renderChecklist('stop if', strategy.stopWhen, COLORS.yellow);
    }
    process.stdout.write('\n');
  }

  if (Array.isArray(result.writeGuardrails) && result.writeGuardrails.length > 0) {
    process.stdout.write(`${COLORS.dim}WRITE GUARDRAILS${COLORS.reset}\n`);
    for (const guardrail of result.writeGuardrails) {
      const calls = guardrail.calls.map((call) => formatToolCall(call)).join(' → ');
      process.stdout.write(`  ${COLORS.bold}${guardrail.id}${COLORS.reset} ${COLORS.dim}${calls}${COLORS.reset}\n`);
      process.stdout.write(`     ${COLORS.dim}${guardrail.goal}${COLORS.reset}\n`);
    }
    process.stdout.write('\n');
  }

  if (Array.isArray(result.relationDecisionGuide) && result.relationDecisionGuide.length > 0) {
    process.stdout.write(`${COLORS.dim}RELATION DECISION GUIDE${COLORS.reset}\n`);
    for (const row of result.relationDecisionGuide) {
      const color = row.severity === 'warn' ? COLORS.yellow : COLORS.dim;
      process.stdout.write(
        `  ${color}${row.decision.padEnd(18)}${COLORS.reset} ${COLORS.dim}${row.meaning}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  if (Array.isArray(result.resultContracts) && result.resultContracts.length > 0) {
    process.stdout.write(`${COLORS.dim}RESULT CONTRACTS${COLORS.reset}\n`);
    for (const contract of result.resultContracts) {
      const fields = Array.isArray(contract.mustReport) ? contract.mustReport.join(', ') : '';
      process.stdout.write(
        `  ${COLORS.cyan}${String(contract.operation).padEnd(14)}${COLORS.reset}` +
          ` ${COLORS.dim}report ${fields}; ${contract.policy}${COLORS.reset}\n`,
      );
    }
    process.stdout.write('\n');
  }

  const checks = Array.isArray(result.health?.checks) ? result.health.checks : [];
  if (checks.length > 0) {
    const summary = checks.map((check) => `${check.id}:${check.status}:${check.count}`).join(', ');
    process.stdout.write(`${COLORS.dim}HEALTH CHECKS${COLORS.reset} ${COLORS.dim}${summary}${COLORS.reset}\n`);
  }

  const next = Array.isArray(result.nextActions) ? result.nextActions : [];
  if (next.length > 0) {
    process.stdout.write(`${COLORS.dim}NEXT ACTIONS${COLORS.reset} ${COLORS.dim}${next.map((action) => `${action.id}:${action.severity}`).join(', ')}${COLORS.reset}\n`);
  }

  process.stdout.write(`${COLORS.dim}WRITE POLICY${COLORS.reset}\n`);
  for (const policy of result.writePolicy) {
    process.stdout.write(`  ${COLORS.dim}- ${policy}${COLORS.reset}\n`);
  }
}

function renderChecklist(label, items, color) {
  if (!Array.isArray(items) || items.length === 0) return;
  process.stdout.write(`     ${color}${label}:${COLORS.reset} ${COLORS.dim}${items[0]}${COLORS.reset}\n`);
  for (const item of items.slice(1)) {
    process.stdout.write(`       ${COLORS.dim}- ${item}${COLORS.reset}\n`);
  }
}

function formatToolCall(call) {
  return `${call.tool}(${JSON.stringify(call.arguments)})`;
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { vault: null, json: false, prompt: false, verifyFallbacks: false };
  const options = {};
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const [maybeFlag, maybeValue] = a.includes('=') ? a.split(/=(.*)/s, 2) : [a, null];
    if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--json') flags.json = true;
    else if (a === '--prompt') flags.prompt = true;
    else if (a === '--verify-fallbacks') flags.verifyFallbacks = true;
    else if (DIAGNOSIS_OPTION_FLAGS.includes(a)) {
      const error = parseDiagnosisOption(options, a, args[++i]);
      if (error) return { error: error.message };
    } else if (DIAGNOSIS_OPTION_FLAGS.includes(maybeFlag)) {
      const error = parseDiagnosisOption(options, maybeFlag, maybeValue);
      if (error) return { error: error.message };
    } else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  if (flags.json && flags.prompt) {
    return { error: '--json and --prompt cannot be used together' };
  }
  if (flags.verifyFallbacks && (flags.json || flags.prompt)) {
    return { error: '--verify-fallbacks cannot be used with --json or --prompt' };
  }
  const vaultResult = resolveExclusiveVaultArg({ vault: flags.vault, positional });
  if (vaultResult.error) return vaultResult;
  return { vault: vaultResult.vault, json: flags.json, prompt: flags.prompt, verifyFallbacks: flags.verifyFallbacks, options };
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology agent-brief [vault] [--json|--prompt|--verify-fallbacks]\n` +
      `       [--dependency-types A,B] [--component-types A,B]\n` +
      `       [--component-limit N] [--cycle-limit N] [--recommendation-limit N]\n` +
      `       [--order-limit N] [--node-limit N]\n\n` +
      `Claude Code/Codex handoff: readiness score, copyable handoffPrompt, graph entrypoints,\n` +
      `first MCP calls, investigation playbooks, traversal strategy, health coverage, and read-first write policy.\n` +
      `Use --json for repeatable agent handoff snapshots; use --prompt to print only .handoffPrompt.\n` +
      `Use --verify-fallbacks to execute the generated CLI fallback commands against this vault.\n` +
      `Exits non-zero when readiness is not ready, status is not healthy, a health check fails,\n` +
      `or a fail-severity nextAction is present.\n` +
      `Tuning flags forward to query_ontology agent_brief for focused diagnostics.\n`,
  );
}
