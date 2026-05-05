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
import { join, dirname, resolve } from 'node:path';
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

  // .mcp.json template — alongside the vault for easy copy.
  const mcpJson = join(target, '.mcp.json.example');
  if (!existsSync(mcpJson)) {
    const mcpConfig = {
      mcpServers: {
        'oh-my-ontology': {
          command: 'npx',
          args: ['-y', 'oh-my-ontology-mcp'],
          env: {
            OMOT_VAULT: target,
          },
        },
      },
    };
    writeFileSync(mcpJson, JSON.stringify(mcpConfig, null, 2) + '\n');
    ok(`  .mcp.json.example`);
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

  ${COLORS.dim}4.${COLORS.reset} ${COLORS.bold}Wire it up to an AI agent${COLORS.reset} (Claude Code, Cursor, …):
       Copy ${COLORS.bold}.mcp.json.example${COLORS.reset} to your agent's MCP config
       (e.g. \`~/.config/claude-code/mcp.json\`). Restart the agent — you'll
       see the ${COLORS.bold}oh-my-ontology${COLORS.reset} namespace with 14 tools (8 read + 6 write).

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

fail(`unknown command: ${SUBCOMMAND}`);
printHelp();
exit(1);
