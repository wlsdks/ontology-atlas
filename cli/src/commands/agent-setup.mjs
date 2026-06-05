// `ontology-atlas agent-setup [vault]` — check or repair Claude/Codex MCP configs
// for an existing vault without scaffolding starter markdown.

import { COLORS } from '../lib/colors.mjs';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { cwd } from 'node:process';
import { fileURLToPath } from 'node:url';

import {
  formatUnknownFlagError,
  parseRequiredFlagValue,
  parseVaultFlag,
  resolveTrailingVaultArg,
} from '../lib/cli-args.mjs';
import { resolveVaultRoot } from '../lib/resolve-vault.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PKG_ROOT = resolve(__dirname, '..', '..');
const require_ = createRequire(import.meta.url);

const ALLOWED_FLAGS = ['--root', '--vault', '--write', '--json'];
const WORKFLOW_GUIDE_PATH = 'docs/AGENT-GRAPH-WORKFLOW.md';
const POST_CHANGE_SYNC_RULES = Object.freeze([
  'After non-trivial code changes, sync docs/ontology before finishing so Claude Code and Codex see the same graph.',
  'Sync when a change introduces or renames a domain, capability, element, or relation.',
  'Skip ontology sync for typos, comments, style-only edits, lint config, and fixture-only changes.',
]);
const GRAPH_RUNBOOK_STEPS = Object.freeze([
  Object.freeze({ id: 'validate', args: ['validate'] }),
  Object.freeze({ id: 'mcp_verify', args: ['mcp-verify', '--timeout-ms', '15000'] }),
  Object.freeze({ id: 'setup_gate', args: ['agent-brief', '--verify-fallbacks'] }),
  Object.freeze({ id: 'workspace_brief', args: ['workspace-brief'] }),
  Object.freeze({ id: 'agent_prompt', args: ['agent-brief', '--prompt'] }),
  Object.freeze({ id: 'graph_db_pack', args: ['agent-brief', '--graph-db-pack'] }),
  Object.freeze({ id: 'hub_plan', args: ['hubs', '--plan', '--limit', '10', '--types', 'depends_on,relates'] }),
  Object.freeze({ id: 'hubs', args: ['hubs', '--limit', '10', '--types', 'depends_on,relates'] }),
]);
const SETUP_MODE_COMPARISON = Object.freeze([
  Object.freeze({
    id: 'cli_only',
    label: 'CLI-only',
    when: 'No MCP client is connected or the user wants terminal-only inspection.',
    gives: 'validate, workspace-brief, graph scans, graph DB pack, and fallback timing over the same local vault.',
  }),
  Object.freeze({
    id: 'mcp_connected',
    label: 'MCP-connected',
    when: 'Claude Code, Codex, Cursor, or another MCP client is registered and restarted.',
    gives: 'direct read/write tools, structured repair fields, result contracts, and write guardrails.',
  }),
  Object.freeze({
    id: 'graph_db_pack',
    label: 'Graph DB pack',
    when: 'The user wants database-style graph exploration without running a database server.',
    gives: 'bounded query plans, node/edge scans, domain matrix, path evidence, and proof follow-ups.',
  }),
  Object.freeze({
    id: 'setup_gate',
    label: 'Setup gate',
    when: 'Setup is unclear or the agent was opened from a separate codebase root.',
    gives: 'config repair commands, JSON readiness, performance timing, and restart guidance before edits.',
  }),
]);
const FIRST_CONTACT_PROOF_CONTRACT = Object.freeze([
  Object.freeze({
    id: 'config_state',
    label: 'Config state',
    proves: 'agent-setup --json reports root-specific Claude Code / Cursor and Codex config readiness before repair.',
  }),
  Object.freeze({
    id: 'mcp_verify',
    label: 'MCP verify',
    proves: 'mcp-verify can boot the local MCP server, list the 24 tools, and read the target vault.',
  }),
  Object.freeze({
    id: 'json_gate',
    label: 'JSON setup gate',
    proves: 'agent-brief --verify-fallbacks --json returns ok/performanceOk before the agent edits.',
  }),
  Object.freeze({
    id: 'graph_briefs',
    label: 'Graph briefs',
    proves: 'workspace-brief and agent-brief --graph-db-pack describe the same local vault before writes.',
  }),
]);


export async function runAgentSetup(args) {
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

  let result;
  try {
    result = buildAgentSetup(parsed);
  } catch (err) {
    process.stderr.write(`${COLORS.red}error${COLORS.reset}  ${err instanceof Error ? err.message : String(err)}\n`);
    return 2;
  }

  if (parsed.json) {
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    return result.summary.review > 0 || result.summary.missing > 0 ? 1 : 0;
  }

  render(result);
  return result.summary.review > 0 || result.summary.missing > 0 ? 1 : 0;
}

function buildAgentSetup(parsed) {
  const vaultRoot = resolveVaultRoot(parsed.vault);
  const codebaseRoot = resolveRoot(parsed.root);
  const serverCommand = resolveMcpServerCommand();
  const rootVaultArg = toOmotVaultArg(codebaseRoot, vaultRoot);
  const targets = [
    {
      owner: 'vault',
      root: vaultRoot,
      omotVault: '.',
      reason: 'open the vault folder itself in Claude Code, Cursor, or Codex',
    },
  ];
  if (resolve(codebaseRoot) !== resolve(vaultRoot)) {
    targets.push({
      owner: 'codebase',
      root: codebaseRoot,
      omotVault: rootVaultArg,
      reason: 'open the codebase root while the ontology lives in a subfolder',
    });
  }

  const files = [];
  for (const target of targets) {
    files.push(checkMcpJson(target, serverCommand, parsed.write));
    files.push(checkCodexConfig(target, serverCommand, parsed.write));
  }

  const summary = {
    total: files.length,
    ready: files.filter((file) => file.status === 'ready').length,
    missing: files.filter((file) => file.status === 'missing').length,
    review: files.filter((file) => file.status === 'review').length,
    written: files.filter((file) => file.action === 'written').length,
    examples: files.filter((file) => file.examplePath).length,
  };

  return {
    operation: 'agent_setup',
    sideEffect: parsed.write,
    vaultRoot,
    codebaseRoot,
    serverCommand,
    summary,
    files,
    commands: {
      setupState: `ontology-atlas agent-setup ${shellQuote(vaultRoot)} --root ${shellQuote(codebaseRoot)} --json`,
      setupRepair: `ontology-atlas agent-setup ${shellQuote(vaultRoot)} --root ${shellQuote(codebaseRoot)} --write`,
      restartGuidance: `Restart Claude Code, Cursor, or Codex from ${shellQuote(codebaseRoot)} after repair.`,
      verify: `ontology-atlas mcp-verify ${shellQuote(vaultRoot)} --timeout-ms 15000`,
      setupGate: `ontology-atlas agent-brief ${shellQuote(vaultRoot)} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
      graphRunbook: buildGraphRunbookCommands(vaultRoot),
      codexGlobal: [
        'codex',
        'mcp',
        'add',
        'ontology-atlas',
        '--env',
        `OATLAS_VAULT=${vaultRoot}`,
        '--',
        serverCommand.command,
        ...serverCommand.args,
      ].map(shellQuote).join(' '),
    },
    docs: {
      workflowGuide: WORKFLOW_GUIDE_PATH,
      workflowGuideDescription:
        'CLI-only use, MCP-connected use, graph DB differences, graph query pack, and verified setup checks.',
      modeComparison: SETUP_MODE_COMPARISON,
      firstContactProofContract: FIRST_CONTACT_PROOF_CONTRACT,
      postChangeSync: POST_CHANGE_SYNC_RULES,
    },
  };
}

function checkMcpJson(target, serverCommand, write) {
  const path = join(target.root, '.mcp.json');
  const expected = mcpConfigForVault(serverCommand, target.omotVault);
  const expectedText = JSON.stringify(expected, null, 2) + '\n';
  if (!existsSync(path)) {
    if (write) {
      writeFileSync(path, expectedText);
      return row(target, 'mcp-json', path, 'ready', 'written', 'created .mcp.json');
    }
    return row(target, 'mcp-json', path, 'missing', 'dry-run', 'run again with --write to create .mcp.json');
  }

  const current = readFileSync(path, 'utf-8');
  const status = inspectMcpJson(current, target.omotVault);
  if (status.ready) return row(target, 'mcp-json', path, 'ready', 'none', status.message);

  const examplePath = join(target.root, '.mcp.json.example');
  let action = 'preserved';
  if (write && !existsSync(examplePath)) {
    writeFileSync(examplePath, expectedText);
    action = 'example-written';
  }
  return row(target, 'mcp-json', path, 'review', action, status.message, examplePath);
}

function checkCodexConfig(target, serverCommand, write) {
  const codexDir = join(target.root, '.codex');
  const path = join(codexDir, 'config.toml');
  const expectedText = codexConfigForVault(serverCommand, target.omotVault);
  if (!existsSync(path)) {
    if (write) {
      mkdirSync(codexDir, { recursive: true });
      writeFileSync(path, expectedText);
      return row(target, 'codex-toml', path, 'ready', 'written', 'created .codex/config.toml');
    }
    return row(target, 'codex-toml', path, 'missing', 'dry-run', 'run again with --write to create .codex/config.toml');
  }

  const current = readFileSync(path, 'utf-8');
  const status = inspectCodexConfig(current, target.omotVault);
  if (status.ready) return row(target, 'codex-toml', path, 'ready', 'none', status.message);

  const examplePath = join(codexDir, 'config.toml.example');
  let action = 'preserved';
  if (write && !existsSync(examplePath)) {
    mkdirSync(codexDir, { recursive: true });
    writeFileSync(examplePath, expectedText);
    action = 'example-written';
  }
  return row(target, 'codex-toml', path, 'review', action, status.message, examplePath);
}

function row(target, kind, path, status, action, message, examplePath = null) {
  return {
    owner: target.owner,
    kind,
    path,
    omotVault: target.omotVault,
    status,
    action,
    message,
    reason: target.reason,
    ...(examplePath ? { examplePath } : {}),
  };
}

function inspectMcpJson(text, expectedVault) {
  try {
    const parsed = JSON.parse(text);
    const server = parsed?.mcpServers?.['ontology-atlas'];
    if (!server || typeof server !== 'object') {
      return { ready: false, message: 'missing mcpServers.ontology-atlas entry' };
    }
    if (server.env?.OATLAS_VAULT !== expectedVault) {
      return {
        ready: false,
        message: `OATLAS_VAULT is ${JSON.stringify(server.env?.OATLAS_VAULT)}; expected ${JSON.stringify(expectedVault)}`,
      };
    }
    if (typeof server.command !== 'string' || server.command.length === 0 || !Array.isArray(server.args)) {
      return { ready: false, message: 'server command/args shape is incomplete' };
    }
    return { ready: true, message: 'ready for Claude Code / Cursor' };
  } catch (err) {
    return { ready: false, message: `invalid JSON: ${err instanceof Error ? err.message : String(err)}` };
  }
}

function inspectCodexConfig(text, expectedVault) {
  const serverSection = getTomlSection(text, 'mcp_servers.ontology-atlas');
  if (!serverSection) {
    return { ready: false, message: 'missing [mcp_servers.ontology-atlas] section' };
  }
  const envSection = getTomlSection(text, 'mcp_servers.ontology-atlas.env');
  const vaultMatch = envSection?.match(/OATLAS_VAULT\s*=\s*"((?:\\.|[^"\\])*)"/);
  if (!vaultMatch) {
    return { ready: false, message: 'missing OATLAS_VAULT env entry' };
  }
  const actualVault = unescapeTomlString(vaultMatch[1]);
  if (actualVault !== expectedVault) {
    return {
      ready: false,
      message: `OATLAS_VAULT is ${JSON.stringify(actualVault)}; expected ${JSON.stringify(expectedVault)}`,
    };
  }
  if (!/command\s*=\s*"/.test(serverSection) || !/args\s*=\s*\[/.test(serverSection)) {
    return { ready: false, message: 'command/args shape is incomplete' };
  }
  return { ready: true, message: 'ready for Codex' };
}

function getTomlSection(text, sectionName) {
  const escaped = sectionName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^\\[${escaped}\\]\\s*$`, 'm'));
  if (!match || match.index === undefined) return null;
  const start = match.index + match[0].length;
  const rest = text.slice(start);
  const next = rest.search(/^\[[^\]]+\]\s*$/m);
  return next === -1 ? rest : rest.slice(0, next);
}

function render(result) {
  const summary = result.summary;
  const status = summary.missing === 0 && summary.review === 0 ? 'ready' : 'needs setup';
  const color = status === 'ready' ? COLORS.green : COLORS.yellow;
  process.stdout.write(
    `${color}${COLORS.bold}${status}${COLORS.reset} ${COLORS.dim}agent setup${COLORS.reset}` +
      ` — ${summary.ready}/${summary.total} ready` +
      ` · ${summary.missing} missing · ${summary.review} review` +
      (result.sideEffect ? ` · ${summary.written} written · ${summary.examples} example(s)` : '') +
      `\n`,
  );
  process.stdout.write(`${COLORS.dim}vault${COLORS.reset} ${result.vaultRoot}\n`);
  process.stdout.write(`${COLORS.dim}codebase${COLORS.reset} ${result.codebaseRoot}\n\n`);

  for (const file of result.files) {
    const icon = file.status === 'ready' ? COLORS.green : file.status === 'review' ? COLORS.yellow : COLORS.red;
    process.stdout.write(
      `${icon}${file.status.padEnd(7)}${COLORS.reset} ${file.owner.padEnd(8)} ${file.kind.padEnd(10)} ${file.path}\n` +
        `        ${COLORS.dim}OATLAS_VAULT=${file.omotVault} · ${file.message}${COLORS.reset}\n`,
    );
    if (file.examplePath) {
      process.stdout.write(`        ${COLORS.dim}merge template: ${file.examplePath}${COLORS.reset}\n`);
    }
  }

  process.stdout.write(`\n${COLORS.bold}Next checks:${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.cyan}${result.commands.setupState}${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.dim}Repair missing configs only if needed: ${result.commands.setupRepair}${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.dim}${result.commands.restartGuidance}${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.cyan}${result.commands.verify}${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.cyan}${result.commands.setupGate}${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.dim}Global Codex fallback: ${result.commands.codexGlobal}${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.dim}Feature guide: ${result.docs.workflowGuide} — ${result.docs.workflowGuideDescription}${COLORS.reset}\n`);
  process.stdout.write(`\n${COLORS.bold}Read-first graph runbook:${COLORS.reset}\n`);
  for (const command of result.commands.graphRunbook) {
    process.stdout.write(`  ${COLORS.cyan}${command}${COLORS.reset}\n`);
  }
  process.stdout.write(`\n${COLORS.bold}Mode guide:${COLORS.reset}\n`);
  for (const mode of result.docs.modeComparison) {
    process.stdout.write(`  ${COLORS.cyan}${mode.label}${COLORS.reset} — ${mode.gives}\n`);
  }
  process.stdout.write(`\n${COLORS.bold}First-contact proof contract:${COLORS.reset}\n`);
  for (const proof of result.docs.firstContactProofContract) {
    process.stdout.write(`  ${COLORS.cyan}${proof.label}${COLORS.reset} — ${proof.proves}\n`);
  }
  process.stdout.write(`\n${COLORS.bold}After code changes:${COLORS.reset}\n`);
  for (const rule of result.docs.postChangeSync) {
    process.stdout.write(`  ${COLORS.dim}- ${rule}${COLORS.reset}\n`);
  }
  if (!result.sideEffect && (summary.missing > 0 || summary.review > 0)) {
    process.stdout.write(`\n${COLORS.dim}Run with --write to create missing files and example templates without overwriting existing configs.${COLORS.reset}\n`);
  }
}

function parseArgs(args) {
  if (args.includes('--help') || args.includes('-h')) return { help: true };
  const flags = { root: cwd(), vault: null, write: false, json: false };
  const positional = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--root') flags.root = parseRequiredFlagValue('--root', args[++i]);
    else if (a.startsWith('--root=')) flags.root = parseRequiredFlagValue('--root', a.slice('--root='.length));
    else if (a === '--vault') flags.vault = parseVaultFlag(args[++i]);
    else if (a.startsWith('--vault=')) flags.vault = parseVaultFlag(a.slice('--vault='.length));
    else if (a === '--write') flags.write = true;
    else if (a === '--json') flags.json = true;
    else if (a.startsWith('-')) return { error: formatUnknownFlagError(a, ALLOWED_FLAGS) };
    else positional.push(a);
  }
  for (const value of Object.values(flags)) {
    if (value instanceof Error) return { error: value.message };
  }
  const vaultResult = resolveTrailingVaultArg({ vault: flags.vault, positional, vaultIndex: 0 });
  if (vaultResult.error) return vaultResult;
  return { ...flags, vault: vaultResult.vault };
}

function resolveRoot(root) {
  const resolved = resolve(cwd(), root || '.');
  if (!existsSync(resolved)) throw new Error(`--root path does not exist: ${resolved}`);
  if (!statSync(resolved).isDirectory()) throw new Error(`--root path is not a directory: ${resolved}`);
  return resolved;
}

function toOmotVaultArg(root, vaultRoot) {
  if (resolve(root) === resolve(vaultRoot)) return '.';
  let rel = relative(root, vaultRoot) || '.';
  if (!rel.startsWith('.')) rel = `./${rel}`;
  return rel;
}

function mcpConfigForVault(serverCommand, omotVault) {
  return {
    mcpServers: {
      'ontology-atlas': {
        command: serverCommand.command,
        args: serverCommand.args,
        env: { OATLAS_VAULT: omotVault },
      },
    },
  };
}

function codexConfigForVault(serverCommand, omotVault) {
  const args = serverCommand.args.map(tomlString).join(', ');
  return [
    '[mcp_servers.ontology-atlas]',
    `command = ${tomlString(serverCommand.command)}`,
    `args = [${args}]`,
    '',
    '[mcp_servers.ontology-atlas.env]',
    `OATLAS_VAULT = ${tomlString(omotVault)}`,
    '',
  ].join('\n');
}

function buildGraphRunbookCommands(vaultRoot) {
  return GRAPH_RUNBOOK_STEPS.map((step) =>
    ['ontology-atlas', step.args[0], shellQuote(vaultRoot), ...step.args.slice(1)]
      .join(' '),
  );
}

function resolveMcpServerCommand() {
  const envPath = process.env.OATLAS_MCP_PATH;
  if (envPath) {
    if (!existsSync(envPath)) throw new Error(`OATLAS_MCP_PATH does not exist: ${envPath}`);
    if (!statSync(envPath).isFile()) throw new Error(`OATLAS_MCP_PATH is not a file: ${envPath}`);
    return { command: 'node', args: [envPath] };
  }

  try {
    return { command: 'node', args: [require_.resolve('ontology-atlas-mcp/src/index.js')] };
  } catch {
    const monoDev = resolve(PKG_ROOT, '..', 'mcp', 'src', 'index.js');
    if (existsSync(monoDev)) return { command: 'node', args: [monoDev] };
  }
  return { command: 'npx', args: ['-y', 'ontology-atlas-mcp'] };
}

function tomlString(value) {
  return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function unescapeTomlString(value) {
  return String(value).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
}

function shellQuote(value) {
  const s = String(value);
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function printUsage(stream = process.stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas agent-setup [vault] [--root path] [--write] [--json]\n\n` +
      `Check or repair Claude Code / Cursor .mcp.json and Codex .codex/config.toml files for an existing vault.\n` +
      `The JSON and terminal output point to ${WORKFLOW_GUIDE_PATH} for CLI-only, MCP-connected, and graph DB comparison flows.\n` +
      `Default root is cwd. Default vault follows OATLAS_VAULT, ./docs/ontology, then cwd.\n`,
  );
}
