#!/usr/bin/env node
// oh-my-ontology CLI — vault scaffold + setup helper.
//
// `npx oh-my-ontology init [folder]` → 폴더에 frontmatter 기반 ontology vault
// 시드 + MCP 등록 안내. 비어 있는 폴더면 그대로, 없으면 생성. 기존 파일은
// 안 건드리고 (충돌 시 skip + 알림).

import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  cpSync,
  statSync,
  readdirSync,
} from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { stdout, stderr, argv, cwd } from 'node:process';
import { CLI_COMMAND_COUNT, CLI_COMMAND_RUNNERS, CLI_COMMANDS } from './lib/cli-commands.mjs';
import { closestAllowedValue, formatUnknownFlagError } from './lib/cli-args.mjs';
import { readMcpPackageMetadata } from './lib/mcp-metadata.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, '..', 'templates', 'vault');
const PKG_ROOT = resolve(__dirname, '..');
const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));
const require_ = createRequire(import.meta.url);

const MCP_METADATA = readMcpPackageMetadata();
const MCP_TOOL_COUNT = MCP_METADATA.toolCount ?? 'current';
const MCP_TOOL_SPLIT = MCP_METADATA.splitText ?? 'read/write';
const INIT_ALLOWED_FLAGS = ['--help'];
const TOP_LEVEL_COMMAND_VALUES = ['--help', '-h', 'help', '--version', '-v', ...CLI_COMMANDS];

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

const ARGS = argv.slice(2);
const SUBCOMMAND = ARGS[0];

function printHelp(stream = stdout) {
  stream.write(`${COLORS.bold}oh-my-ontology${COLORS.reset} ${COLORS.dim}v${PKG.version}${COLORS.reset}

AI-native codebase ontology workbench — ${CLI_COMMAND_COUNT} commands + MCP setup.

${COLORS.bold}Usage:${COLORS.reset}
  npx oh-my-ontology init [folder]            Scaffold a new ontology vault (default: ./vault)
  npx oh-my-ontology list [vault]             List ontology nodes in a vault
                                              ${COLORS.dim}--kind <kind>     filter by kind${COLORS.reset}
                                              ${COLORS.dim}--json            JSON output${COLORS.reset}
  npx oh-my-ontology validate [vault]         Frontmatter integrity check (exit 1 on errors)
       --json --strict --fail-on=code,...     ${COLORS.dim}structured · warning 도 fail · 특정 code 만 fail${COLORS.reset}
       --list-codes                           ${COLORS.dim}사용 가능한 issue code 목록 (--fail-on 발견용)${COLORS.reset}
  npx oh-my-ontology mcp-verify [vault]       MCP boot + tools + health + graph-query smoke
       --timeout-ms N                         ${COLORS.dim}large / slow vault server wait override${COLORS.reset}
  npx oh-my-ontology add <kind> <slug>        Scaffold a new ontology node (.md)
       --title "..."                          ${COLORS.dim}required, non-empty${COLORS.reset}
       --domain X --body "..." --vault path   ${COLORS.dim}optional${COLORS.reset}
       --raw-slug                             ${COLORS.dim}opt out of default kind→folder prefix${COLORS.reset}
  npx oh-my-ontology find <query> [vault]     Search slug + title (case-insensitive)
       --kind X --json                        ${COLORS.dim}optional${COLORS.reset}
  npx oh-my-ontology import <path...>         Import external .md into the vault (R14)
       --vault path                           ${COLORS.dim}target vault root (default: cwd)${COLORS.reset}
       --kind K                               ${COLORS.dim}fallback kind when input has no kind:${COLORS.reset}
       --raw-slug --rename --dry-run          ${COLORS.dim}no folder prefix · slug rename · plan-only${COLORS.reset}

${COLORS.bold}Bootstrap${COLORS.reset} ${COLORS.dim}(R16/R17 — autonomous ingest base)${COLORS.reset}
  npx oh-my-ontology bootstrap [rootPath]     ${COLORS.green}1줄 full bootstrap${COLORS.reset} — analyze --apply + infer-imports --apply
       --threshold N --skip-imports --json    ${COLORS.dim}weak edge 차단 · 노드만 · machine output${COLORS.reset}
  npx oh-my-ontology analyze [rootPath]       Walk a repo, propose ontology node candidates (side effect 0)
       --apply --max-depth N --json           ${COLORS.dim}or land via batch · folder walk depth · machine output${COLORS.reset}
  npx oh-my-ontology infer-imports [rootPath] TS/JS import graph → depends_on edge candidates (side effect 0)
       --apply --threshold N --max-files N    ${COLORS.dim}or land · weak filter · default 5000 max${COLORS.reset}

${COLORS.bold}Graph-level commands${COLORS.reset} ${COLORS.dim}(R15 — wraps the MCP server, same authority as an AI agent)${COLORS.reset}
  ${COLORS.dim}Set OMOT_CLI_MCP_TIMEOUT_MS=N when a large / slow vault needs a longer one-shot MCP call window.${COLORS.reset}
  npx oh-my-ontology backlinks <slug>         Every node referencing the slug (--json)
  npx oh-my-ontology orphans [vault]          Isolated nodes (어떤 다른 노드도 reference 안 함)
       --kind X --exclude-kinds A,B --json    ${COLORS.dim}filter / skip / machine output${COLORS.reset}
  npx oh-my-ontology path <from> <to>         Shortest path (BFS) with relation type per hop
       --max-hops N --json                    ${COLORS.dim}default 5${COLORS.reset}
  npx oh-my-ontology explain <from> <to>      Direct edges + shortest path + common-neighbor evidence
       --direction undirected --types A,B --json
  npx oh-my-ontology all-paths <from> <to>    Bounded simple paths + completeness evidence
       --max-hops N --limit N --search-budget N --types A,B --json
  npx oh-my-ontology reachability <slug>      Transitive reachable nodes by layer from one start node
       --depth N --direction outgoing --types A,B --plan --json
  npx oh-my-ontology relation-check <from> <to> <type>
                                             ${COLORS.dim}schema-aware add_relation preflight${COLORS.reset}
  npx oh-my-ontology query "<filter>"         Typed filter DSL (kind=X AND has(elements))
       --limit N --json                       ${COLORS.dim}default limit 100${COLORS.reset}
  npx oh-my-ontology match-nodes [vault]      Graph DB-style node scan with kind/domain/degree filters
       --kind K --min-degree N --plan --json  ${COLORS.dim}filter-preserving query_plan support${COLORS.reset}
  npx oh-my-ontology match-edges [vault]      Graph DB-style edge scan with type/kind/external filters
       --type T --from-kind K --plan --json   ${COLORS.dim}edge pattern rows + totalMatches${COLORS.reset}
  npx oh-my-ontology domain-matrix [vault]    Domain coupling matrix — cross-domain edges + examples
       --project SLUG --limit N --json         ${COLORS.dim}scope to one project containment tree${COLORS.reset}
  npx oh-my-ontology schema [vault]           Relation schema patterns for traversal/write preflight
       --limit N --json
  npx oh-my-ontology compile [vault]         Deterministic graph compile + optional reorder
       --summary --fix --json                 ${COLORS.dim}hash/counts · canonicalize relation arrays${COLORS.reset}
  npx oh-my-ontology overview [vault]         Vault first-contact dashboard (counts + 분포 + 허브)
       --limit N --json                       ${COLORS.dim}허브 N 개 (default 10) · machine output${COLORS.reset}
  npx oh-my-ontology hubs [vault]             Centrality 4 rankings — PageRank / Bridges / Authorities / Hubs
       --limit N --json                       ${COLORS.dim}각 랭킹 N rows (default 10)${COLORS.reset}
  npx oh-my-ontology blast-radius <slug>      이 노드 변경 시 영향받는 노드/관계 (refactor safety)
       --depth N --direction incoming|outgoing|both --json
  npx oh-my-ontology cycles [vault]           depends_on dependency cycle 검출
       --max-hops N --json                    ${COLORS.dim}default maxDepth 8${COLORS.reset}
  npx oh-my-ontology components [vault]       Connected graph islands before trusting traversal maps
       --limit N --node-limit N --types A,B --json
  npx oh-my-ontology topological-order [vault] Prerequisite-first dependency ordering
       --limit N --types A,B --include-isolated --json
  npx oh-my-ontology health [vault]           Graph 무결성 dashboard (5 checks)
       --json --component-types A,B          ${COLORS.dim}focused diagnosis tuning 지원${COLORS.reset}
  npx oh-my-ontology agent-brief [vault]      Claude Code/Codex handoff — readiness + first MCP calls
       --prompt --graph-db-pack --verify-fallbacks
                                              ${COLORS.dim}pasteable handoff · shell Graph DB pack · fallback self-check${COLORS.reset}
  npx oh-my-ontology workspace-brief [vault]  Status + hotspots + project_scope 포함 노드 + next actions 한 화면
       --json --dependency-types A,B         ${COLORS.dim}health/workspace_brief tuning forwarding${COLORS.reset}
  npx oh-my-ontology growth [vault]           Growth candidates from MCP growth_plan
       --limit N --json                       ${COLORS.dim}relations · external refs · dangling refs · ignored refs${COLORS.reset}
  npx oh-my-ontology maintenance [vault]      Ordered graph cleanup/repair work queue
       --limit N --after-action-id ID --json  ${COLORS.dim}cursor page · filterable maintenance_plan${COLORS.reset}
  npx oh-my-ontology node <slug> [vault]      한 노드 deep dive — header · lineage · incoming/outgoing edges
       --limit N --types A,B --no-external --no-unresolved --json
                                             ${COLORS.dim}hotspot edge group + relation/ref filter${COLORS.reset}
  npx oh-my-ontology similar "<title>" [vault] vault 에서 비슷한 노드 찾기 (duplicate 회피, /ontology-extract 짝)
       --slug X --kind K --limit N --json    ${COLORS.dim}slug 기반 / kind 필터 / 결과 N / machine${COLORS.reset}
  npx oh-my-ontology rename <old> <new>       Atomic rename — moves .md, redirects every backlink
       --confirm --overwrite                  ${COLORS.dim}default dry-run; --overwrite replaces existing target${COLORS.reset}
  npx oh-my-ontology merge <from> <into>      Atomic merge — redirect backlinks then delete fromSlug
       --confirm                              ${COLORS.dim}default dry-run; --confirm to apply${COLORS.reset}
  npx oh-my-ontology delete <slug>            Permanent delete (refuses if backlinks remain)
       --confirm --force                      ${COLORS.dim}--confirm to apply; --force to ignore backlinks${COLORS.reset}

  npx oh-my-ontology --help                   Show this help
  npx oh-my-ontology --version                Print version

${COLORS.bold}What 'init' does:${COLORS.reset}
  - Creates project / domain / capability / element starter .md files
  - Each file has frontmatter (kind / slug / title / depends_on / capabilities / ...)
  - Writes wired .mcp.json files for Claude Code / Cursor in both cwd and the vault
  - Writes wired .codex/config.toml files for Codex in both cwd and the vault
  - Prints the exact Codex 'mcp add' command as a global-config fallback
  - Recommends 'bootstrap' to replace untouched starters with a first real graph

${COLORS.bold}Mission:${COLORS.reset}
  vault frontmatter = the graph. Humans + AI agents author the same vault.
  Workbench: https://github.com/wlsdks/oh-my-ontology

${COLORS.dim}https://github.com/wlsdks/oh-my-ontology${COLORS.reset}
`);
}

function ok(msg) {
  stdout.write(`${COLORS.green}ok${COLORS.reset}    ${msg}\n`);
}
function info(msg) {
  stdout.write(`${COLORS.cyan}info${COLORS.reset}  ${msg}\n`);
}
function warn(msg) {
  stdout.write(`${COLORS.yellow}warn${COLORS.reset}  ${msg}\n`);
}
function fail(msg) {
  stderr.write(`${COLORS.bold}error${COLORS.reset} ${msg}\n`);
}

function parseInitArgs(args) {
  if (args.includes('--help') || args.includes('-h')) {
    return { help: true };
  }
  const positional = [];
  for (const arg of args) {
    if (arg.startsWith('-')) return { error: formatUnknownFlagError(arg, INIT_ALLOWED_FLAGS) };
    positional.push(arg);
  }
  if (positional.length > 1) {
    return { error: `too many arguments: ${positional.slice(1).join(' ')}` };
  }
  return { target: positional[0] };
}

function printInitUsage(stream = stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  oh-my-ontology init [folder]\n\n` +
      `Scaffold a local ontology vault. Default folder: ./vault\n`,
  );
}

function resolveMcpServerCommand() {
  const envPath = process.env.OMOT_MCP_PATH;
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(`OMOT_MCP_PATH does not exist: ${envPath}`);
    }
    if (!isFile(envPath)) {
      throw new Error(`OMOT_MCP_PATH is not a file: ${envPath}`);
    }
    return { command: 'node', args: [envPath] };
  }

  try {
    return {
      command: 'node',
      args: [require_.resolve('oh-my-ontology-mcp/src/index.js')],
    };
  } catch {
    const monoDev = resolve(PKG_ROOT, '..', 'mcp', 'src', 'index.js');
    if (existsSync(monoDev)) {
      return { command: 'node', args: [monoDev] };
    }
  }

  return { command: 'npx', args: ['-y', 'oh-my-ontology-mcp'] };
}

function isFile(path) {
  try {
    return statSync(path).isFile();
  } catch {
    return false;
  }
}

function shellQuote(value) {
  const s = String(value);
  if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(s)) return s;
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function copyTree(srcRoot, destRoot) {
  let created = 0;
  let skipped = 0;

  function walk(rel) {
    const src = rel ? join(srcRoot, rel) : srcRoot;
    const dest = rel ? join(destRoot, rel) : destRoot;
    const stat = statSync(src);
    if (stat.isDirectory()) {
      mkdirSync(dest, { recursive: true });
      for (const entry of readdirSync(src)) {
        walk(rel ? join(rel, entry) : entry);
      }
    } else {
      if (existsSync(dest)) {
        skipped += 1;
      } else {
        mkdirSync(dirname(dest), { recursive: true });
        cpSync(src, dest);
        created += 1;
        ok(`  ${rel}`);
      }
    }
  }

  walk('');
  return { created, skipped };
}

function runInit(targetArg) {
  const target = resolve(cwd(), targetArg ?? 'vault');
  let serverCommand;
  try {
    serverCommand = resolveMcpServerCommand();
  } catch (err) {
    fail(err?.message ?? String(err));
    return 2;
  }
  info(`scaffolding ontology vault at ${COLORS.bold}${target}${COLORS.reset}`);

  if (!existsSync(TEMPLATE_ROOT)) {
    fail(`template root not found: ${TEMPLATE_ROOT}`);
    return 2;
  }

  const { created, skipped } = copyTree(TEMPLATE_ROOT, target);

  if (created === 0) {
    warn(`no new files written — target already has matching files`);
  }
  if (skipped > 0) {
    warn(`${skipped} existing file(s) preserved (not overwritten)`);
  }

  // .mcp.json — wired to *this* vault. Two locations covered:
  //   1. cwd (codebase root) — typical "open myproject in Claude Code" flow.
  //      OMOT_VAULT points to the vault sub-folder relative to cwd.
  //   2. vault target — for "open the vault folder itself in Claude Code"
  //      flow. OMOT_VAULT='.' (vault is cwd).
  // Existing .mcp.json in either location is preserved (user might have
  // other servers wired) — a `.mcp.json.example` is dropped instead so the
  // user can diff and merge by hand.
  function mcpConfigForVault(omotVault) {
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
  function writeMcpJson(dir, omotVault, label) {
    const mcpJson = join(dir, '.mcp.json');
    const mcpExample = join(dir, '.mcp.json.example');
    const mcpJsonText =
      JSON.stringify(mcpConfigForVault(omotVault), null, 2) + '\n';
    if (!existsSync(mcpJson)) {
      writeFileSync(mcpJson, mcpJsonText);
      ok(`  ${label}/.mcp.json (OMOT_VAULT=${omotVault})`);
    } else {
      warn(
        `  ${label}/.mcp.json already exists — preserved (manual merge if needed)`,
      );
      if (!existsSync(mcpExample)) {
        writeFileSync(mcpExample, mcpJsonText);
        ok(`  ${label}/.mcp.json.example`);
      }
    }
  }

  function tomlString(value) {
    return `"${String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }

  function codexConfigForVault(omotVault) {
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

  function writeCodexConfig(dir, omotVault, label) {
    const codexDir = join(dir, '.codex');
    const codexConfig = join(codexDir, 'config.toml');
    if (!existsSync(codexDir)) mkdirSync(codexDir, { recursive: true });
    if (!existsSync(codexConfig)) {
      writeFileSync(codexConfig, codexConfigForVault(omotVault));
      ok(`  ${label}/.codex/config.toml (OMOT_VAULT=${omotVault})`);
    } else {
      warn(
        `  ${label}/.codex/config.toml already exists — preserved (manual merge if needed)`,
      );
    }
  }

  // 1. Vault target itself — vault is cwd, OMOT_VAULT='.'
  writeMcpJson(target, '.', 'vault');
  writeCodexConfig(target, '.', 'vault');

  // 2. cwd (codebase root) — only if distinct from target. OMOT_VAULT is the
  //    relative path from cwd to target.
  const cwdPath = cwd();
  let cwdVaultArg = '.';
  if (resolve(cwdPath) !== resolve(target)) {
    let omotRel = relative(cwdPath, target) || '.';
    if (!omotRel.startsWith('.')) omotRel = `./${omotRel}`;
    cwdVaultArg = omotRel;
    writeMcpJson(cwdPath, omotRel, 'cwd');
    writeCodexConfig(cwdPath, omotRel, 'cwd');
  }

  const codexSetupCommand = [
    'codex',
    'mcp',
    'add',
    'oh-my-ontology',
    '--env',
    `OMOT_VAULT=${target}`,
    '--',
    serverCommand.command,
    ...serverCommand.args,
  ].map(shellQuote).join(' ');
  const analyzeCommand = ['oh-my-ontology', 'analyze', '.', '--vault', cwdVaultArg]
    .map(shellQuote)
    .join(' ');
  const bootstrapCommand = [
    'oh-my-ontology',
    'bootstrap',
    '.',
    '--vault',
    cwdVaultArg,
  ].map(shellQuote).join(' ');

  stdout.write(`
${COLORS.green}${COLORS.bold}done${COLORS.reset} — vault scaffolded.

${COLORS.bold}Next steps:${COLORS.reset}

  ${COLORS.dim}1.${COLORS.reset} ${COLORS.bold}Explore the vault from the terminal:${COLORS.reset}
       ${COLORS.cyan}cd ${target}${COLORS.reset}
       ${COLORS.cyan}oh-my-ontology list${COLORS.reset}                        ${COLORS.dim}# 5 starter nodes${COLORS.reset}
       ${COLORS.cyan}oh-my-ontology validate${COLORS.reset}                    ${COLORS.dim}# frontmatter integrity${COLORS.reset}
       ${COLORS.cyan}oh-my-ontology mcp-verify${COLORS.reset}                  ${COLORS.dim}# server + ${MCP_TOOL_COUNT}-tool MCP + graph smoke${COLORS.reset}

  ${COLORS.dim}2.${COLORS.reset} ${COLORS.bold}Bootstrap from your codebase${COLORS.reset} (recommended — agent-less, 1 line):
       ${COLORS.cyan}${analyzeCommand}${COLORS.reset}     ${COLORS.dim}# preview candidates only${COLORS.reset}
       ${COLORS.cyan}${bootstrapCommand}${COLORS.reset}   ${COLORS.dim}# apply nodes + edges${COLORS.reset}
       ${COLORS.dim}analyze (project + domains + capabilities + elements) + infer-imports${COLORS.reset}
       ${COLORS.dim}(depends_on edges) batch land in 3 round-trips. --threshold N filters${COLORS.reset}
       ${COLORS.dim}weak imports.${COLORS.reset}

  ${COLORS.dim}3.${COLORS.reset} ${COLORS.bold}Or add your first node by hand:${COLORS.reset}
       ${COLORS.cyan}oh-my-ontology add capability auth/token-issue --title="Token issue" --domain=auth${COLORS.reset}
       ${COLORS.cyan}oh-my-ontology find token${COLORS.reset}                  ${COLORS.dim}# verify it shows up${COLORS.reset}

  ${COLORS.dim}4.${COLORS.reset} ${COLORS.bold}Edit project.md${COLORS.reset} — set your project's real name + description.
       Then add domains / capabilities / elements as you discover them.

  ${COLORS.dim}5.${COLORS.reset} ${COLORS.bold}Open this folder in an AI agent${COLORS.reset}:
       ${COLORS.bold}Claude Code / Cursor${COLORS.reset}
       Both your codebase root (cwd) and the vault folder now have a wired
       ${COLORS.bold}.mcp.json${COLORS.reset}. Open either folder, restart the agent,
       and the ${COLORS.bold}oh-my-ontology${COLORS.reset} namespace appears with ${MCP_TOOL_COUNT} tools
       (${MCP_TOOL_SPLIT}).

       ${COLORS.bold}Codex${COLORS.reset}
       Both your codebase root (cwd) and the vault folder now have a wired
       ${COLORS.bold}.codex/config.toml${COLORS.reset}. Open either folder in Codex and restart it.
       For a global Codex config instead, run:
       ${COLORS.cyan}${codexSetupCommand}${COLORS.reset}
       ${COLORS.dim}Codex can store MCP servers globally too, so the command is optional when the repo-local config is enough.${COLORS.reset}

  ${COLORS.dim}6.${COLORS.reset} ${COLORS.bold}See the graph${COLORS.reset} (optional, web UI):
       ${COLORS.cyan}git clone https://github.com/wlsdks/oh-my-ontology${COLORS.reset}
       Point its ${COLORS.bold}/docs${COLORS.reset} picker at this vault.

${COLORS.dim}AI agents and humans now share the same vault. Have fun.${COLORS.reset}
`);
  return 0;
}

async function runCommandHelp(command) {
  if (command === 'init') {
    printInitUsage(stdout);
    return 0;
  }
  const runner = CLI_COMMAND_RUNNERS[command];
  if (!runner) return null;
  const mod = await import(runner.modulePath);
  const run = mod[runner.exportName];
  if (typeof run !== 'function') {
    fail(`command ${command} is misconfigured: missing ${runner.exportName}`);
    return 1;
  }
  return run(['--help']);
}

async function main() {
  if (!SUBCOMMAND || SUBCOMMAND === '--help' || SUBCOMMAND === '-h') {
    printHelp();
    return 0;
  }

  if (SUBCOMMAND === 'help') {
    const helpArgs = ARGS.slice(1);
    if (helpArgs.length === 0) {
      printHelp();
      return 0;
    }
    if (helpArgs.length > 1) {
      fail(`too many arguments: ${helpArgs.slice(1).join(' ')}`);
      printHelp(stderr);
      return 1;
    }
    if (helpArgs[0] === '--help' || helpArgs[0] === '-h') {
      printHelp();
      return 0;
    }
    const helpCommand = helpArgs[0];
    const helpExitCode = await runCommandHelp(helpCommand);
    if (helpExitCode !== null) {
      return helpExitCode;
    }
    const helpSuggestion = closestAllowedValue(helpCommand, CLI_COMMANDS);
    fail(
      `unknown help topic: ${helpCommand}.` +
        (helpSuggestion ? ` Did you mean ${helpSuggestion}?` : ''),
    );
    printHelp(stderr);
    return 1;
  }

  if (SUBCOMMAND === '--version' || SUBCOMMAND === '-v') {
    stdout.write(`${PKG.version}\n`);
    return 0;
  }

  if (SUBCOMMAND === 'init') {
    const parsed = parseInitArgs(ARGS.slice(1));
    if (parsed.help) {
      printInitUsage(stdout);
      return 0;
    }
    if (parsed.error) {
      fail(parsed.error);
      printInitUsage();
      return 1;
    }
    return runInit(parsed.target);
  }

  const runner = CLI_COMMAND_RUNNERS[SUBCOMMAND];
  if (runner) {
    const mod = await import(runner.modulePath);
    const run = mod[runner.exportName];
    if (typeof run !== 'function') {
      fail(`command ${SUBCOMMAND} is misconfigured: missing ${runner.exportName}`);
      return 1;
    }
    try {
      return await run(ARGS.slice(1));
    } catch (err) {
      if (err?.name === 'VaultRootError') {
        fail(err.message);
        return 2;
      }
      throw err;
    }
  }

  const commandSuggestion = closestAllowedValue(SUBCOMMAND, TOP_LEVEL_COMMAND_VALUES);
  fail(
    `unknown command: ${SUBCOMMAND}.` +
      (commandSuggestion ? ` Did you mean ${commandSuggestion}?` : ''),
  );
  printHelp(stderr);
  return 1;
}

process.exitCode = await main();
