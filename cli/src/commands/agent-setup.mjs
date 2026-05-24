// `oh-my-ontology agent-setup [vault]` — check or repair Claude/Codex MCP configs
// for an existing vault without scaffolding starter markdown.

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

const COLORS = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

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
      verify: `oh-my-ontology mcp-verify ${shellQuote(vaultRoot)} --timeout-ms 15000`,
      setupGate: `oh-my-ontology agent-brief ${shellQuote(vaultRoot)} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`,
      codexGlobal: [
        'codex',
        'mcp',
        'add',
        'oh-my-ontology',
        '--env',
        `OMOT_VAULT=${vaultRoot}`,
        '--',
        serverCommand.command,
        ...serverCommand.args,
      ].map(shellQuote).join(' '),
    },
    docs: {
      workflowGuide: WORKFLOW_GUIDE_PATH,
      workflowGuideDescription:
        'CLI-only use, MCP-connected use, graph DB differences, graph query pack, and verified setup checks.',
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
    const server = parsed?.mcpServers?.['oh-my-ontology'];
    if (!server || typeof server !== 'object') {
      return { ready: false, message: 'missing mcpServers.oh-my-ontology entry' };
    }
    if (server.env?.OMOT_VAULT !== expectedVault) {
      return {
        ready: false,
        message: `OMOT_VAULT is ${JSON.stringify(server.env?.OMOT_VAULT)}; expected ${JSON.stringify(expectedVault)}`,
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
  const serverSection = getTomlSection(text, 'mcp_servers.oh-my-ontology');
  if (!serverSection) {
    return { ready: false, message: 'missing [mcp_servers.oh-my-ontology] section' };
  }
  const envSection = getTomlSection(text, 'mcp_servers.oh-my-ontology.env');
  const vaultMatch = envSection?.match(/OMOT_VAULT\s*=\s*"((?:\\.|[^"\\])*)"/);
  if (!vaultMatch) {
    return { ready: false, message: 'missing OMOT_VAULT env entry' };
  }
  const actualVault = unescapeTomlString(vaultMatch[1]);
  if (actualVault !== expectedVault) {
    return {
      ready: false,
      message: `OMOT_VAULT is ${JSON.stringify(actualVault)}; expected ${JSON.stringify(expectedVault)}`,
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
        `        ${COLORS.dim}OMOT_VAULT=${file.omotVault} · ${file.message}${COLORS.reset}\n`,
    );
    if (file.examplePath) {
      process.stdout.write(`        ${COLORS.dim}merge template: ${file.examplePath}${COLORS.reset}\n`);
    }
  }

  process.stdout.write(`\n${COLORS.bold}Next checks:${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.cyan}${result.commands.verify}${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.cyan}${result.commands.setupGate}${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.dim}Global Codex fallback: ${result.commands.codexGlobal}${COLORS.reset}\n`);
  process.stdout.write(`  ${COLORS.dim}Feature guide: ${result.docs.workflowGuide} — ${result.docs.workflowGuideDescription}${COLORS.reset}\n`);
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
      'oh-my-ontology': {
        command: serverCommand.command,
        args: serverCommand.args,
        env: { OMOT_VAULT: omotVault },
      },
    },
  };
}

function codexConfigForVault(serverCommand, omotVault) {
  const args = serverCommand.args.map(tomlString).join(', ');
  return [
    '[mcp_servers.oh-my-ontology]',
    `command = ${tomlString(serverCommand.command)}`,
    `args = [${args}]`,
    '',
    '[mcp_servers.oh-my-ontology.env]',
    `OMOT_VAULT = ${tomlString(omotVault)}`,
    '',
  ].join('\n');
}

function resolveMcpServerCommand() {
  const envPath = process.env.OMOT_MCP_PATH;
  if (envPath) {
    if (!existsSync(envPath)) throw new Error(`OMOT_MCP_PATH does not exist: ${envPath}`);
    if (!statSync(envPath).isFile()) throw new Error(`OMOT_MCP_PATH is not a file: ${envPath}`);
    return { command: 'node', args: [envPath] };
  }

  try {
    return { command: 'node', args: [require_.resolve('oh-my-ontology-mcp/src/index.js')] };
  } catch {
    const monoDev = resolve(PKG_ROOT, '..', 'mcp', 'src', 'index.js');
    if (existsSync(monoDev)) return { command: 'node', args: [monoDev] };
  }
  return { command: 'npx', args: ['-y', 'oh-my-ontology-mcp'] };
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
      `  oh-my-ontology agent-setup [vault] [--root path] [--write] [--json]\n\n` +
      `Check or repair Claude Code / Cursor .mcp.json and Codex .codex/config.toml files for an existing vault.\n` +
      `The JSON and terminal output point to ${WORKFLOW_GUIDE_PATH} for CLI-only, MCP-connected, and graph DB comparison flows.\n` +
      `Default root is cwd. Default vault follows OMOT_VAULT, ./docs/ontology, then cwd.\n`,
  );
}
