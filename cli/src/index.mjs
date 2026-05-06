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
import { stdout, stderr, argv, exit, cwd } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, '..', 'templates', 'vault');
const PKG_ROOT = resolve(__dirname, '..');
const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));

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
  npx oh-my-ontology add <kind> <slug>        Scaffold a new ontology node (.md)
       --title "..."                          ${COLORS.dim}required, non-empty${COLORS.reset}
       --domain X --body "..." --vault path   ${COLORS.dim}optional${COLORS.reset}
       --auto-prefix                          ${COLORS.dim}kind→folder (capability→capabilities/) opt-in${COLORS.reset}
  npx oh-my-ontology find <query> [vault]     Search slug + title (case-insensitive)
       --kind X --json                        ${COLORS.dim}optional${COLORS.reset}
  npx oh-my-ontology import <path...>         Import external .md into the vault (R14)
       --vault path                           ${COLORS.dim}target vault root (default: cwd)${COLORS.reset}
       --kind K                               ${COLORS.dim}fallback kind when input has no kind:${COLORS.reset}
       --auto-prefix --rename --dry-run       ${COLORS.dim}folder prefix · slug rename · plan-only${COLORS.reset}

${COLORS.bold}Bootstrap${COLORS.reset} ${COLORS.dim}(R16/R17 — autonomous ingest base)${COLORS.reset}
  npx oh-my-ontology analyze [rootPath]       Walk a repo, propose ontology node candidates (side effect 0)
       --max-depth N --json                   ${COLORS.dim}folder walk depth · machine output${COLORS.reset}
  npx oh-my-ontology infer-imports [rootPath] TS/JS import graph → depends_on edge candidates (side effect 0)
       --max-files N --json                   ${COLORS.dim}default 5000 max · machine output${COLORS.reset}

${COLORS.bold}Graph-level commands${COLORS.reset} ${COLORS.dim}(R15 — wraps the MCP server, same authority as an AI agent)${COLORS.reset}
  npx oh-my-ontology backlinks <slug>         Every node referencing the slug (--json)
  npx oh-my-ontology query "<filter>"         Typed filter DSL (kind=X AND has(elements))
       --limit N --json                       ${COLORS.dim}default limit 100${COLORS.reset}
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
  - Adds a .mcp.json template so AI agents (Claude Code, Cursor, etc.) can read/write the vault
  - Prints next steps to start exploring

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
          command: 'npx',
          args: ['-y', 'oh-my-ontology-mcp'],
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
  if (resolve(cwdPath) !== resolve(target)) {
    let omotRel = relative(cwdPath, target) || '.';
    if (!omotRel.startsWith('.')) omotRel = `./${omotRel}`;
    writeMcpJson(cwdPath, omotRel, 'cwd');
  }

  stdout.write(`
${COLORS.green}${COLORS.bold}done${COLORS.reset} — vault scaffolded.

${COLORS.bold}Next steps:${COLORS.reset}

  ${COLORS.dim}1.${COLORS.reset} ${COLORS.bold}Explore the vault from the terminal:${COLORS.reset}
       ${COLORS.cyan}cd ${target}${COLORS.reset}
       ${COLORS.cyan}oh-my-ontology list${COLORS.reset}                        ${COLORS.dim}# 5 starter nodes${COLORS.reset}
       ${COLORS.cyan}oh-my-ontology validate${COLORS.reset}                    ${COLORS.dim}# frontmatter integrity${COLORS.reset}

  ${COLORS.dim}2.${COLORS.reset} ${COLORS.bold}Add your first node:${COLORS.reset}
       ${COLORS.cyan}oh-my-ontology add capability auth/token-issue --title="Token issue" --domain=auth${COLORS.reset}
       ${COLORS.cyan}oh-my-ontology find token${COLORS.reset}                  ${COLORS.dim}# verify it shows up${COLORS.reset}

  ${COLORS.dim}3.${COLORS.reset} ${COLORS.bold}Edit project.md${COLORS.reset} — set your project's real name + description.
       Then add domains / capabilities / elements as you discover them.

  ${COLORS.dim}4.${COLORS.reset} ${COLORS.bold}Open this folder in an AI agent${COLORS.reset} (Claude Code, Cursor, …):
       Both your codebase root (cwd) and the vault folder now have a wired
       ${COLORS.bold}.mcp.json${COLORS.reset}. Open either folder, restart the agent,
       and the ${COLORS.bold}oh-my-ontology${COLORS.reset} namespace appears with 14 tools
       (8 read + 6 write).

  ${COLORS.dim}5.${COLORS.reset} ${COLORS.bold}See the graph${COLORS.reset} (optional, web UI):
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

fail(`unknown command: ${SUBCOMMAND}`);
printHelp();
exit(1);
