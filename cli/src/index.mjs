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
import { stdout, stderr, argv, exit, cwd } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, '..', 'templates', 'vault');
const PKG_ROOT = resolve(__dirname, '..');
const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));
const require_ = createRequire(import.meta.url);

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

function printHelp() {
  stdout.write(`${COLORS.bold}oh-my-ontology${COLORS.reset} ${COLORS.dim}v${PKG.version}${COLORS.reset}

AI-native codebase ontology workbench — vault scaffold + MCP setup.

${COLORS.bold}Usage:${COLORS.reset}
  npx oh-my-ontology init [folder]            Scaffold a new ontology vault (default: ./vault)
  npx oh-my-ontology list [vault]             List ontology nodes in a vault
                                              ${COLORS.dim}--kind <kind>     filter by kind${COLORS.reset}
                                              ${COLORS.dim}--json            JSON output${COLORS.reset}
  npx oh-my-ontology validate [vault]         Frontmatter integrity check (exit 1 on errors)
       --json --strict --fail-on=code,...     ${COLORS.dim}structured · warning 도 fail · 특정 code 만 fail${COLORS.reset}
       --list-codes                           ${COLORS.dim}사용 가능한 issue code 목록 (--fail-on 발견용)${COLORS.reset}
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
  npx oh-my-ontology backlinks <slug>         Every node referencing the slug (--json)
  npx oh-my-ontology orphans [vault]          Isolated nodes (어떤 다른 노드도 reference 안 함)
       --kind X --exclude-kinds A,B --json    ${COLORS.dim}filter / skip / machine output${COLORS.reset}
  npx oh-my-ontology path <from> <to>         Shortest path (BFS) with relation type per hop
       --max-hops N --json                    ${COLORS.dim}default 5${COLORS.reset}
  npx oh-my-ontology query "<filter>"         Typed filter DSL (kind=X AND has(elements))
       --limit N --json                       ${COLORS.dim}default limit 100${COLORS.reset}
  npx oh-my-ontology overview [vault]         Vault first-contact dashboard (counts + 분포 + 허브)
       --limit N --json                       ${COLORS.dim}허브 N 개 (default 10) · machine output${COLORS.reset}
  npx oh-my-ontology hubs [vault]             Centrality 4 rankings — PageRank / Bridges / Authorities / Hubs
       --limit N --json                       ${COLORS.dim}각 랭킹 N rows (default 10)${COLORS.reset}
  npx oh-my-ontology blast-radius <slug>      이 노드 변경 시 영향받는 노드/관계 (refactor safety)
       --depth N --direction incoming|outgoing|both --json
  npx oh-my-ontology cycles [vault]           depends_on dependency cycle 검출
       --max-hops N --json                    ${COLORS.dim}default maxDepth 8${COLORS.reset}
  npx oh-my-ontology health [vault]           Graph 무결성 dashboard (5 checks)
       --json                                 ${COLORS.dim}exit 0 만 healthy${COLORS.reset}
  npx oh-my-ontology workspace-brief [vault]  Status + hotspots + project 요약 + next actions 한 화면
       --json
  npx oh-my-ontology node <slug> [vault]      한 노드 deep dive — header · lineage · incoming/outgoing edges
       --json                                 ${COLORS.dim}relation 별 그룹 + 노드 title 동봉${COLORS.reset}
  npx oh-my-ontology similar "<title>" [vault] vault 에서 비슷한 노드 찾기 (duplicate 회피, /ontology-extract 짝)
       --slug X --kind K --limit N --json    ${COLORS.dim}slug 기반 / kind 필터 / 결과 N / machine${COLORS.reset}
  npx oh-my-ontology rename <old> <new>       Atomic rename — moves .md, redirects every backlink
       --confirm                              ${COLORS.dim}default dry-run (preview); --confirm to apply${COLORS.reset}
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
  - Prints the exact Codex 'mcp add' command, because Codex uses its own config
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

function resolveMcpServerCommand() {
  const envPath = process.env.OMOT_MCP_PATH;
  if (envPath && existsSync(envPath)) {
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
  const serverCommand = resolveMcpServerCommand();
  info(`scaffolding ontology vault at ${COLORS.bold}${target}${COLORS.reset}`);

  if (!existsSync(TEMPLATE_ROOT)) {
    fail(`template root not found: ${TEMPLATE_ROOT}`);
    exit(2);
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

  // 1. Vault target itself — vault is cwd, OMOT_VAULT='.'
  writeMcpJson(target, '.', 'vault');

  // 2. cwd (codebase root) — only if distinct from target. OMOT_VAULT is the
  //    relative path from cwd to target.
  const cwdPath = cwd();
  let cwdVaultArg = '.';
  if (resolve(cwdPath) !== resolve(target)) {
    let omotRel = relative(cwdPath, target) || '.';
    if (!omotRel.startsWith('.')) omotRel = `./${omotRel}`;
    cwdVaultArg = omotRel;
    writeMcpJson(cwdPath, omotRel, 'cwd');
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
       and the ${COLORS.bold}oh-my-ontology${COLORS.reset} namespace appears with 20 tools
       (12 read + 8 write).

       ${COLORS.bold}Codex${COLORS.reset}
       ${COLORS.cyan}${codexSetupCommand}${COLORS.reset}
       ${COLORS.dim}Codex stores MCP servers in its own config, so run this once from a clean setup.${COLORS.reset}

  ${COLORS.dim}6.${COLORS.reset} ${COLORS.bold}See the graph${COLORS.reset} (optional, web UI):
       ${COLORS.cyan}git clone https://github.com/wlsdks/oh-my-ontology${COLORS.reset}
       Point its ${COLORS.bold}/docs${COLORS.reset} picker at this vault.

${COLORS.dim}AI agents and humans now share the same vault. Have fun.${COLORS.reset}
`);
}

if (!SUBCOMMAND || SUBCOMMAND === '--help' || SUBCOMMAND === '-h' || SUBCOMMAND === 'help') {
  printHelp();
  exit(0);
}

if (SUBCOMMAND === '--version' || SUBCOMMAND === '-v') {
  stdout.write(`${PKG.version}\n`);
  exit(0);
}

if (SUBCOMMAND === 'init') {
  runInit(ARGS[1]);
  exit(0);
}

if (SUBCOMMAND === 'list') {
  const { runList } = await import('./commands/list.mjs');
  exit(runList(ARGS.slice(1)));
}

if (SUBCOMMAND === 'validate') {
  const { runValidate } = await import('./commands/validate.mjs');
  exit(runValidate(ARGS.slice(1)));
}

if (SUBCOMMAND === 'add') {
  const { runAdd } = await import('./commands/add.mjs');
  exit(runAdd(ARGS.slice(1)));
}

if (SUBCOMMAND === 'find') {
  const { runFind } = await import('./commands/find.mjs');
  exit(runFind(ARGS.slice(1)));
}

if (SUBCOMMAND === 'import') {
  const { runImport } = await import('./commands/import.mjs');
  exit(runImport(ARGS.slice(1)));
}

// R15 graph-level commands — async (spawn MCP). Each returns a Promise<exitCode>.
if (SUBCOMMAND === 'backlinks') {
  const { runBacklinks } = await import('./commands/backlinks.mjs');
  exit(await runBacklinks(ARGS.slice(1)));
}

if (SUBCOMMAND === 'orphans') {
  const { runOrphans } = await import('./commands/orphans.mjs');
  exit(await runOrphans(ARGS.slice(1)));
}

if (SUBCOMMAND === 'path') {
  const { runPath } = await import('./commands/path.mjs');
  exit(await runPath(ARGS.slice(1)));
}

if (SUBCOMMAND === 'overview') {
  const { runOverview } = await import('./commands/overview.mjs');
  exit(await runOverview(ARGS.slice(1)));
}

if (SUBCOMMAND === 'hubs') {
  const { runHubs } = await import('./commands/hubs.mjs');
  exit(await runHubs(ARGS.slice(1)));
}

if (SUBCOMMAND === 'blast-radius') {
  const { runBlastRadius } = await import('./commands/blast-radius.mjs');
  exit(await runBlastRadius(ARGS.slice(1)));
}

if (SUBCOMMAND === 'cycles') {
  const { runCycles } = await import('./commands/cycles.mjs');
  exit(await runCycles(ARGS.slice(1)));
}

if (SUBCOMMAND === 'health') {
  const { runHealth } = await import('./commands/health.mjs');
  exit(await runHealth(ARGS.slice(1)));
}

if (SUBCOMMAND === 'workspace-brief') {
  const { runWorkspaceBrief } = await import('./commands/workspace-brief.mjs');
  exit(await runWorkspaceBrief(ARGS.slice(1)));
}

if (SUBCOMMAND === 'node') {
  const { runNodeProfile } = await import('./commands/node-profile.mjs');
  exit(await runNodeProfile(ARGS.slice(1)));
}

if (SUBCOMMAND === 'similar') {
  const { runSimilar } = await import('./commands/similar.mjs');
  exit(await runSimilar(ARGS.slice(1)));
}

if (SUBCOMMAND === 'query') {
  const { runQuery } = await import('./commands/query.mjs');
  exit(await runQuery(ARGS.slice(1)));
}

if (SUBCOMMAND === 'rename') {
  const { runRename } = await import('./commands/rename.mjs');
  exit(await runRename(ARGS.slice(1)));
}

if (SUBCOMMAND === 'merge') {
  const { runMerge } = await import('./commands/merge.mjs');
  exit(await runMerge(ARGS.slice(1)));
}

if (SUBCOMMAND === 'delete') {
  const { runDelete } = await import('./commands/delete.mjs');
  exit(await runDelete(ARGS.slice(1)));
}

if (SUBCOMMAND === 'analyze') {
  const { runAnalyze } = await import('./commands/analyze.mjs');
  exit(await runAnalyze(ARGS.slice(1)));
}

if (SUBCOMMAND === 'infer-imports') {
  const { runInferImports } = await import('./commands/infer-imports.mjs');
  exit(await runInferImports(ARGS.slice(1)));
}

if (SUBCOMMAND === 'bootstrap') {
  const { runBootstrap } = await import('./commands/bootstrap.mjs');
  exit(await runBootstrap(ARGS.slice(1)));
}

fail(`unknown command: ${SUBCOMMAND}`);
printHelp();
exit(1);
