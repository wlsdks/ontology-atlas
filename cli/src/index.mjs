#!/usr/bin/env node
// ontology-atlas CLI — vault scaffold + setup helper.
//
// `ontology-atlas init [folder]` → 폴더에 frontmatter 기반 ontology vault
// 시드 + MCP 등록 안내. 비어 있는 폴더면 그대로, 없으면 생성. 기존 파일은
// 안 건드리고 (충돌 시 skip + 알림).
//
// 이 CLI 는 npm 으로 배포하지 않는다 (docs/DECISIONS.md 2026-07-27) — 소스
// 체크아웃에서 `node cli/src/index.mjs <명령>` 으로 부른다. 아래 도움말이
// 명령을 `ontology-atlas <명령>` 으로 적는 것은 표 폭을 지키기 위한 축약이고,
// 실행 형태는 도움말 첫 단락이 말한다.

import { COLORS } from './lib/colors.mjs';
import { cliInvocation } from './lib/self-invocation.mjs';
import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  cpSync,
  statSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { stdout, stderr, argv, cwd } from 'node:process';
import { CLI_COMMAND_COUNT, CLI_COMMAND_RUNNERS, CLI_COMMANDS } from './lib/cli-commands.mjs';
import { closestAllowedValue, formatUnknownFlagError } from './lib/cli-args.mjs';
import { readMcpPackageMetadata } from './lib/mcp-metadata.mjs';
import { runBootstrap } from './commands/bootstrap.mjs';
import { stampInitCompleted } from './lib/telemetry.mjs';

// 화면에 찍는 **실행용** 명령의 접두사. 이 파일이 안내하는 명령은 붙여 넣으면
// 실제로 돌아야 한다 — 자세한 규율은 `lib/self-invocation.mjs`.
const CLI = cliInvocation();

const __dirname = dirname(fileURLToPath(import.meta.url));
const TEMPLATE_ROOT = resolve(__dirname, '..', 'templates', 'vault');

/**
 * 스타터 본문 로케일 (#73). 파일 세트와 frontmatter(slug/kind/title/display_*)는
 * 로케일 간 **동일**하고 산문 본문만 다르다 — 그래서 어떤 로케일로 만들었든
 * 같은 그래프가 나오고, 검색의 단일 진실원인 canonical `title` 도 그대로다.
 *
 * 웹 워크벤치는 UI 언어를 알지만 CLI 는 모르므로 명시 플래그로 받는다.
 * 기본값은 종전과 같은 영어 — 기존 사용자의 `init` 결과가 바뀌지 않는다.
 */
const TEMPLATE_ROOTS = {
  en: TEMPLATE_ROOT,
  ko: resolve(__dirname, '..', 'templates', 'vault-ko'),
};

function resolveTemplateRoot(locale) {
  return TEMPLATE_ROOTS[locale] ?? TEMPLATE_ROOT;
}
const PKG_ROOT = resolve(__dirname, '..');
const PKG = JSON.parse(readFileSync(join(PKG_ROOT, 'package.json'), 'utf-8'));
const require_ = createRequire(import.meta.url);

const MCP_METADATA = readMcpPackageMetadata();
const MCP_TOOL_COUNT = MCP_METADATA.toolCount ?? 'current';
const MCP_TOOL_SPLIT = MCP_METADATA.splitText ?? 'read/write';
const INIT_ALLOWED_FLAGS = ['--help', '--quick-start', '--locale'];
const TOP_LEVEL_COMMAND_VALUES = ['--help', '-h', 'help', '--version', '-v', ...CLI_COMMANDS];


const ARGS = argv.slice(2);
const SUBCOMMAND = ARGS[0];

function printHelp(stream = stdout) {
  stream.write(`${COLORS.bold}ontology-atlas${COLORS.reset} ${COLORS.dim}v${PKG.version}${COLORS.reset}

AI-native codebase ontology workbench — ${CLI_COMMAND_COUNT} commands + MCP setup.

${COLORS.dim}Run it from an ontology-atlas source checkout: ${COLORS.reset}${COLORS.bold}node cli/src/index.mjs <command>${COLORS.reset}
${COLORS.dim}(The rows below shorten that to \`ontology-atlas <command>\`. There is no npm package —${COLORS.reset}
${COLORS.dim} the macOS app carries the MCP server in its own bundle instead.)${COLORS.reset}

${COLORS.bold}Usage:${COLORS.reset}
  ontology-atlas init [folder]                Scaffold a new ontology vault (default: ./vault)
       --quick-start                          ${COLORS.dim}Slice 0 one-liner: + bootstrap + absorb suggestion + compact next steps${COLORS.reset}
  ontology-atlas list [vault]                 List ontology nodes in a vault
                                              ${COLORS.dim}--kind <kind>     filter by kind${COLORS.reset}
                                              ${COLORS.dim}--json            JSON output${COLORS.reset}
  ontology-atlas validate [vault]             Frontmatter + graph-reference check (코드 경로는 안 봄 → health)
       --json --strict --fail-on=code,...     ${COLORS.dim}structured · warning 도 fail · 특정 code 만 fail${COLORS.reset}
       --list-codes                           ${COLORS.dim}사용 가능한 issue code 목록 (--fail-on 발견용)${COLORS.reset}
  ontology-atlas mcp-verify [vault]           MCP boot + tools + health + graph-query smoke
       --timeout-ms N                         ${COLORS.dim}large / slow vault server wait override${COLORS.reset}
  ontology-atlas agent-setup [vault]          Check/repair Claude Code, Cursor, and Codex configs
       --root path --write --json             ${COLORS.dim}existing vault setup, no starter files touched${COLORS.reset}
  ontology-atlas agent-files                  Read-only agent-file map + drift checks (repo root)
       --root path --json                     ${COLORS.dim}which tool reads which file · bridge/skill-copy/@ref/32KiB drift${COLORS.reset}
  ontology-atlas agent-activity [vault]       Write/show/clear the live Claude Code/Codex heartbeat
       --agent codex --state editing --json   ${COLORS.dim}.ontology-atlas/agent-activity.json${COLORS.reset}
  ontology-atlas add <kind> <slug>            Scaffold a new ontology node (.md)
       --title "..."                          ${COLORS.dim}required, non-empty${COLORS.reset}
       --domain X --path repo/path            ${COLORS.dim}optional parent + canonical code entrypoint${COLORS.reset}
       --body "..." --vault path              ${COLORS.dim}optional body + vault root${COLORS.reset}
       --raw-slug                             ${COLORS.dim}opt out of default kind→folder prefix${COLORS.reset}
  ontology-atlas find <query> [vault]         Search slug + title (case-insensitive)
       --kind X --json                        ${COLORS.dim}optional${COLORS.reset}
  ontology-atlas import <path...>             Import external .md into the vault (R14)
       --vault path                           ${COLORS.dim}target vault root (default: cwd)${COLORS.reset}
       --kind K                               ${COLORS.dim}fallback kind when input has no kind:${COLORS.reset}
       --raw-slug --rename --dry-run          ${COLORS.dim}no folder prefix · slug rename · plan-only${COLORS.reset}
  ontology-atlas absorb <file...>             ${COLORS.green}Absorb CLAUDE.md/AGENTS.md into typed vault nodes${COLORS.reset} (Slice 0)
       --vault path --write                   ${COLORS.dim}default dry-run plan · --write lands + rewrites source as slim pointer${COLORS.reset}
  ontology-atlas moment [vault]                ${COLORS.green}Slice 0 magic-moment readout${COLORS.reset} — init/absorb → first agent-brief elapsed
       --mark --json                           ${COLORS.dim}manual stamp fallback · machine output${COLORS.reset}

${COLORS.bold}Bootstrap${COLORS.reset} ${COLORS.dim}(R16/R17 — autonomous ingest base)${COLORS.reset}
  ontology-atlas index [rootPath]             ${COLORS.green}project ontology index${COLORS.reset} — analyze + imports + validate plan
       --apply --threshold N --json           ${COLORS.dim}explicit land · weak edge 차단 · machine output${COLORS.reset}
  ontology-atlas bootstrap [rootPath]         ${COLORS.green}1줄 full bootstrap${COLORS.reset} — analyze --apply + infer-imports --apply
       --threshold N --skip-imports --json    ${COLORS.dim}weak edge 차단 · 노드만 · machine output${COLORS.reset}
  ontology-atlas analyze [rootPath]           Walk a repo, propose ontology node candidates (side effect 0)
       --apply --max-depth N --json           ${COLORS.dim}or land via batch · folder walk depth · machine output${COLORS.reset}
  ontology-atlas infer-imports [rootPath] TS/JS import graph → depends_on edge candidates (side effect 0)
       --apply --threshold N --max-files N    ${COLORS.dim}or land · weak filter · default 5000 max${COLORS.reset}
  ontology-atlas preflight [vault]            ${COLORS.green}Commit preflight${COLORS.reset} — staged files → vault nodes → blast-radius summary
       --staged --depth N --json              ${COLORS.dim}non-blocking, silent when nothing matches${COLORS.reset}
  ontology-atlas snapshot [vault]             ${COLORS.green}Snapshot the vault${COLORS.reset} — vault-scoped git commit with a semantic summary
       --dry-run --push --message "..." --json ${COLORS.dim}local commit by default · --push sends to your existing upstream${COLORS.reset}
       --history [N] --diff --pull             ${COLORS.dim}vault commit log · uncommitted preview · graceful pull (opt-in)${COLORS.reset}

${COLORS.bold}Graph-level commands${COLORS.reset} ${COLORS.dim}(R15 — wraps the MCP server, same authority as an AI agent)${COLORS.reset}
  ${COLORS.dim}Set OATLAS_CLI_MCP_TIMEOUT_MS=N when a large / slow vault needs a longer one-shot MCP call window.${COLORS.reset}
  ontology-atlas backlinks <slug>             Every node referencing the slug (--json)
  ontology-atlas orphans [vault]              Isolated nodes (어떤 다른 노드도 reference 안 함)
       --kind X --exclude-kinds A,B --json    ${COLORS.dim}filter / skip / machine output${COLORS.reset}
  ontology-atlas path <from> <to>             Shortest path (BFS) with relation type per hop
       --max-hops N --json                    ${COLORS.dim}default 5${COLORS.reset}
  ontology-atlas explain <from> <to>          Direct edges + shortest path + common-neighbor evidence
       --direction undirected --types A,B --json
  ontology-atlas all-paths <from> <to>        Bounded simple paths + completeness evidence
       --max-hops N --limit N --search-budget N --types A,B --json
  ontology-atlas reachability <slug>          Transitive reachable nodes by layer from one start node
       --depth N --direction outgoing --types A,B --plan --json
  ontology-atlas relation-check <from> <to> <type>
                                             ${COLORS.dim}schema-aware add_relation preflight${COLORS.reset}
  ontology-atlas relate <from> <to> <type>
                                             ${COLORS.green}Write a relation${COLORS.reset} — same preflight as relation-check, then lands it
       --dry-run --json                     ${COLORS.dim}preview only · machine output${COLORS.reset}
  ontology-atlas query "<filter>"             Typed filter DSL (kind=X AND has(elements))
       --limit N --json                       ${COLORS.dim}default limit 100${COLORS.reset}
  ontology-atlas match-nodes [vault]          Graph DB-style node scan with kind/domain/degree filters
       --kind K --min-degree N --plan --json  ${COLORS.dim}filter-preserving query_plan support${COLORS.reset}
  ontology-atlas match-edges [vault]          Graph DB-style edge scan with type/kind/external filters
       --type T --from-kind K --plan --json   ${COLORS.dim}edge pattern rows + totalMatches${COLORS.reset}
  ontology-atlas domain-matrix [vault]        Domain coupling matrix — cross-domain edges + examples
       --project SLUG --limit N --json         ${COLORS.dim}scope to one project containment tree${COLORS.reset}
  ontology-atlas facets [vault]              Graph dashboard facets — buckets + top nodes/patterns
       --limit N --json
  ontology-atlas schema [vault]               Relation schema patterns for traversal/write preflight
       --limit N --json
  ontology-atlas pattern-walk <slug>          Explicit relation-sequence traversal evidence
       --pattern domains,capabilities --limit N --json
  ontology-atlas project-map <project>        Domain-by-domain project containment map
       --limit N --item-limit N --json
  ontology-atlas compile [vault]             Deterministic graph compile + optional reorder
       --summary --fix --json                 ${COLORS.dim}hash/counts · canonicalize relation arrays${COLORS.reset}
  ontology-atlas export [vault]              ${COLORS.green}Interop export${COLORS.reset} — compile → standard exchange format (stdout)
       --format jsonld|graphml|json           ${COLORS.dim}RDF JSON-LD · Gephi GraphML · raw artifact${COLORS.reset}
  ontology-atlas overview [vault]             Vault first-contact dashboard (counts + 분포 + 허브)
       --limit N --json                       ${COLORS.dim}허브 N 개 (default 10) · machine output${COLORS.reset}
  ontology-atlas hubs [vault]                 Centrality 4 rankings — PageRank / Bridges / Authorities / Hubs
       --limit N --json                       ${COLORS.dim}각 랭킹 N rows (default 10)${COLORS.reset}
  ontology-atlas blast-radius <slug>          이 노드 변경 시 영향받는 노드/관계 (refactor safety)
       --depth N --direction incoming|outgoing|both --json
  ontology-atlas cycles [vault]               depends_on dependency cycle 검출
       --max-hops N --json                    ${COLORS.dim}default maxDepth 8${COLORS.reset}
  ontology-atlas components [vault]           Connected graph islands before trusting traversal maps
       --limit N --node-limit N --types A,B --json
  ontology-atlas topological-order [vault] Prerequisite-first dependency ordering
       --limit N --types A,B --include-isolated --json
  ontology-atlas health [vault]               Graph 무결성 dashboard (6 checks, 코드 경로 대조 포함)
       --json --component-types A,B          ${COLORS.dim}focused diagnosis tuning 지원${COLORS.reset}
  ontology-atlas agent-brief [vault]          Claude Code/Codex handoff — readiness + first MCP calls
       --prompt --graph-db-pack --verify-fallbacks
                                              ${COLORS.dim}pasteable handoff · shell Graph DB pack · fallback self-check${COLORS.reset}
  ontology-atlas workspace-brief [vault]      Status + hotspots + project_scope 포함 노드 + next actions 한 화면
       --json --dependency-types A,B         ${COLORS.dim}health/workspace_brief tuning forwarding${COLORS.reset}
  ontology-atlas growth [vault]               Growth candidates from MCP growth_plan
       --limit N --json                       ${COLORS.dim}relations · external refs · dangling refs · ignored refs${COLORS.reset}
  ontology-atlas maintenance [vault]          Ordered graph cleanup/repair work queue
       --limit N --after-action-id ID --json  ${COLORS.dim}cursor page · filterable maintenance_plan${COLORS.reset}
  ontology-atlas node <slug> [vault]          한 노드 deep dive — header · lineage · incoming/outgoing edges
       --limit N --types A,B --no-external --no-unresolved --json
                                             ${COLORS.dim}hotspot edge group + relation/ref filter${COLORS.reset}
  ontology-atlas similar "<title>" [vault] vault 에서 비슷한 노드 찾기 (duplicate 회피, /ontology-extract 짝)
       --slug X --kind K --limit N --json    ${COLORS.dim}slug 기반 / kind 필터 / 결과 N / machine${COLORS.reset}
  ontology-atlas rename <old> <new>           Atomic rename — moves .md, redirects every backlink
       --confirm --overwrite                  ${COLORS.dim}default dry-run; --overwrite replaces existing target${COLORS.reset}
  ontology-atlas merge <from> <into>          Atomic merge — redirect backlinks then delete fromSlug
       --confirm                              ${COLORS.dim}default dry-run; --confirm to apply${COLORS.reset}
  ontology-atlas delete <slug>                Permanent delete (refuses if backlinks remain)
       --confirm --force                      ${COLORS.dim}--confirm to apply; --force to ignore backlinks${COLORS.reset}

  ontology-atlas --help                       Show this help
  ontology-atlas --version                    Print version

${COLORS.bold}What 'init' does:${COLORS.reset}
  - Creates project / domain / capability / element starter .md files
  - Each file has frontmatter (kind / slug / title / depends_on / capabilities / ...)
  - Writes wired .mcp.json files for Claude Code / Cursor in both cwd and the vault
  - Writes wired .codex/config.toml files for Codex in both cwd and the vault
  - Prints the exact Codex 'mcp add' command as a global-config fallback
  - Recommends 'bootstrap' to replace untouched starters with a first real graph
  - For an existing vault, run 'agent-setup --write' to repair only agent configs

${COLORS.bold}Mission:${COLORS.reset}
  vault frontmatter = the graph. Humans + AI agents author the same vault.
  Workbench: https://github.com/wlsdks/ontology-atlas

${COLORS.dim}https://github.com/wlsdks/ontology-atlas${COLORS.reset}
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
  let quickStart = false;
  // #73 — 스타터 본문 언어. 파일 세트와 frontmatter 는 동일하고 산문만 다르다.
  let locale = 'en';
  for (const arg of args) {
    if (arg === '--quick-start') {
      quickStart = true;
      continue;
    }
    if (arg.startsWith('--locale=')) {
      locale = arg.slice('--locale='.length);
      continue;
    }
    if (arg.startsWith('-')) return { error: formatUnknownFlagError(arg, INIT_ALLOWED_FLAGS) };
    positional.push(arg);
  }
  if (positional.length > 1) {
    return { error: `too many arguments: ${positional.slice(1).join(' ')}` };
  }
  return { target: positional[0], quickStart, locale };
}

function printInitUsage(stream = stderr) {
  stream.write(
    `\n${COLORS.bold}Usage:${COLORS.reset}\n` +
      `  ontology-atlas init [folder]\n` +
      `  ontology-atlas init [folder] --quick-start\n` +
      `  ontology-atlas init [folder] --locale=ko\n\n` +
      `Scaffold a local ontology vault. Default folder: ./vault\n\n` +
      `${COLORS.bold}--quick-start${COLORS.reset}  no-prompt one-liner (Slice 0): scaffold + bootstrap from\n` +
      `  this repo + .mcp.json (already unconditional) + an absorb suggestion when\n` +
      `  CLAUDE.md/AGENTS.md exists (never auto-absorbed) + a compact next-steps block.\n`,
  );
}

function resolveMcpServerCommand() {
  const envPath = process.env.OATLAS_MCP_PATH;
  if (envPath) {
    if (!existsSync(envPath)) {
      throw new Error(`OATLAS_MCP_PATH does not exist: ${envPath}`);
    }
    if (!isFile(envPath)) {
      throw new Error(`OATLAS_MCP_PATH is not a file: ${envPath}`);
    }
    return { command: 'node', args: [envPath] };
  }

  try {
    return {
      command: 'node',
      args: [require_.resolve('ontology-atlas-mcp/src/index.js')],
    };
  } catch {
    const monoDev = resolve(PKG_ROOT, '..', 'mcp', 'src', 'index.js');
    if (existsSync(monoDev)) {
      return { command: 'node', args: [monoDev] };
    }
  }

  // npm 발행 계획은 폐기됐다 (docs/DECISIONS.md 2026-07-27) — `npx` 폴백은
  // 100% 실패하는 명령을 설정 파일에 심는 일이었다. 대신 설치된 앱이
  // 번들로 싣고 다니는 바이너리를 찾는다.
  if (isFile(BUNDLED_MCP_BINARY)) {
    return { command: BUNDLED_MCP_BINARY, args: [] };
  }

  throw new Error(
    'Could not find the ontology-atlas MCP server.\n' +
      `  Install the macOS app (it bundles the server at ${BUNDLED_MCP_BINARY}),\n` +
      '  or run this from an ontology-atlas source checkout,\n' +
      '  or point OATLAS_MCP_PATH at mcp/src/index.js yourself.',
  );
}

/**
 * 앱 번들이 싣고 다니는 MCP 서버. macOS 앱을 설치했다면 이게 있고, 사용자는
 * node 도 소스 체크아웃도 없이 붙을 수 있다.
 */
const BUNDLED_MCP_BINARY =
  '/Applications/Ontology Atlas.app/Contents/MacOS/ontology-atlas-mcp';

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
        const template = readFileSync(src, 'utf-8');
        if (/^kind:\s*\S+/m.test(template)) {
          if (/^uid:\s*/m.test(template)) {
            throw new Error(`starter template must not contain a fixed uid: ${rel}`);
          }
          writeFileSync(dest, template.replace(/^---\n/, `---\nuid: ${randomUUID()}\n`), 'utf-8');
        } else {
          cpSync(src, dest);
        }
        created += 1;
        ok(`  ${rel}`);
      }
    }
  }

  walk('');
  return { created, skipped };
}

async function runInit(targetArg, opts = {}) {
  const quickStart = Boolean(opts.quickStart);
  const target = resolve(cwd(), targetArg ?? 'vault');
  let serverCommand;
  try {
    serverCommand = resolveMcpServerCommand();
  } catch (err) {
    fail(err?.message ?? String(err));
    return 2;
  }
  const locale = typeof opts.locale === 'string' ? opts.locale.toLowerCase() : 'en';
  if (!Object.hasOwn(TEMPLATE_ROOTS, locale)) {
    fail(`unknown --locale "${locale}" — supported: ${Object.keys(TEMPLATE_ROOTS).join(', ')}`);
    return 2;
  }
  const templateRoot = resolveTemplateRoot(locale);
  info(`scaffolding ontology vault at ${COLORS.bold}${target}${COLORS.reset}`);

  if (!existsSync(templateRoot)) {
    fail(`template root not found: ${templateRoot}`);
    return 2;
  }

  const { created, skipped } = copyTree(templateRoot, target);

  if (created === 0) {
    warn(`no new files written — target already has matching files`);
  }
  if (skipped > 0) {
    warn(`${skipped} existing file(s) preserved (not overwritten)`);
  }

  // .mcp.json — wired to *this* vault. Two locations covered:
  //   1. cwd (codebase root) — typical "open myproject in Claude Code" flow.
  //      OATLAS_VAULT points to the vault sub-folder relative to cwd.
  //   2. vault target — for "open the vault folder itself in Claude Code"
  //      flow. OATLAS_VAULT='.' (vault is cwd).
  // Existing .mcp.json in either location is preserved (user might have
  // other servers wired) — a `.mcp.json.example` is dropped instead so the
  // user can diff and merge by hand.
  function mcpConfigForVault(omotVault, repoRoot) {
    return {
      mcpServers: {
        'ontology-atlas': {
          command: serverCommand.command,
          args: serverCommand.args,
          env: { OATLAS_VAULT: omotVault, OATLAS_REPO_ROOT: repoRoot },
        },
      },
    };
  }
  function writeMcpJson(dir, omotVault, repoRoot, label) {
    const mcpJson = join(dir, '.mcp.json');
    const mcpExample = join(dir, '.mcp.json.example');
    const mcpJsonText =
      JSON.stringify(mcpConfigForVault(omotVault, repoRoot), null, 2) + '\n';
    if (!existsSync(mcpJson)) {
      writeFileSync(mcpJson, mcpJsonText);
      ok(`  ${label}/.mcp.json (OATLAS_VAULT=${omotVault})`);
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

  function codexConfigForVault(omotVault, repoRoot) {
    const args = serverCommand.args.map(tomlString).join(', ');
    return [
      '[mcp_servers.ontology-atlas]',
      `command = ${tomlString(serverCommand.command)}`,
      `args = [${args}]`,
      '',
      '[mcp_servers.ontology-atlas.env]',
      `OATLAS_VAULT = ${tomlString(omotVault)}`,
      `OATLAS_REPO_ROOT = ${tomlString(repoRoot)}`,
      '',
    ].join('\n');
  }

  function writeCodexConfig(dir, omotVault, repoRoot, label) {
    const codexDir = join(dir, '.codex');
    const codexConfig = join(codexDir, 'config.toml');
    if (!existsSync(codexDir)) mkdirSync(codexDir, { recursive: true });
    if (!existsSync(codexConfig)) {
      writeFileSync(codexConfig, codexConfigForVault(omotVault, repoRoot));
      ok(`  ${label}/.codex/config.toml (OATLAS_VAULT=${omotVault})`);
    } else {
      warn(
        `  ${label}/.codex/config.toml already exists — preserved (manual merge if needed)`,
      );
    }
  }

  // macOS exposes the same temporary directory through aliases such as
  // `/tmp` and `/private/tmp`. Mixing an aliased absolute target with the
  // canonical process cwd makes `relative()` produce `/private/private/...`
  // when the generated config is resolved from the vault. Both directories
  // exist after scaffolding, so calculate every config path in one canonical
  // coordinate system.
  const cwdPath = realpathSync(cwd());
  const canonicalTarget = realpathSync(target);
  let vaultRepoArg = relative(canonicalTarget, cwdPath) || '.';
  if (!vaultRepoArg.startsWith('.')) vaultRepoArg = `./${vaultRepoArg}`;
  // 1. Vault target itself — vault is cwd; repo root remains explicit.
  writeMcpJson(target, '.', vaultRepoArg, 'vault');
  writeCodexConfig(target, '.', vaultRepoArg, 'vault');

  // 2. cwd (codebase root) — only if distinct from target. OATLAS_VAULT is the
  //    relative path from cwd to target.
  let cwdVaultArg = '.';
  if (cwdPath !== canonicalTarget) {
    let omotRel = relative(cwdPath, canonicalTarget) || '.';
    if (!omotRel.startsWith('.')) omotRel = `./${omotRel}`;
    cwdVaultArg = omotRel;
    writeMcpJson(cwdPath, omotRel, '.', 'cwd');
    writeCodexConfig(cwdPath, omotRel, '.', 'cwd');
  }

  const codexSetupCommand = [
    'codex',
    'mcp',
    'add',
    'ontology-atlas',
    '--env',
    `OATLAS_VAULT=${target}`,
    '--env',
    `OATLAS_REPO_ROOT=${cwdPath}`,
    '--',
    serverCommand.command,
    ...serverCommand.args,
  ].map(shellQuote).join(' ');
  // CLI 자기 호출은 이미 실행 가능한 형태라 다시 따옴표로 감싸지 않는다 —
  // 감싸면 `node /path` 전체가 한 토큰이 되어 실행이 깨진다.
  const analyzeCommand = [CLI, ...['analyze', '.', '--vault', cwdVaultArg].map(shellQuote)]
    .join(' ');
  const bootstrapCommand = [
    CLI,
    ...['bootstrap', '.', '--vault', cwdVaultArg].map(shellQuote),
  ].join(' ');

  // Slice 0 magic-moment instrumentation (PRODUCT-PLAN-2026-07.md §4/§9) —
  // local-only baseline for "vault worth asking" (see lib/telemetry.mjs).
  // Applies to every init, quick-start or not.
  stampInitCompleted(target);

  if (quickStart) {
    return runQuickStart({ target, cwdVaultArg });
  }

  stdout.write(`
${COLORS.green}${COLORS.bold}done${COLORS.reset} — vault scaffolded.

${COLORS.bold}Next steps:${COLORS.reset}

  ${COLORS.dim}1.${COLORS.reset} ${COLORS.bold}Explore the vault from the terminal:${COLORS.reset}
       ${COLORS.cyan}cd ${target}${COLORS.reset}
       ${COLORS.cyan}${CLI} list${COLORS.reset}                        ${COLORS.dim}# 5 starter nodes${COLORS.reset}
       ${COLORS.cyan}${CLI} validate${COLORS.reset}                    ${COLORS.dim}# frontmatter integrity${COLORS.reset}
       ${COLORS.cyan}${CLI} mcp-verify${COLORS.reset}                  ${COLORS.dim}# server + ${MCP_TOOL_COUNT}-tool MCP + graph smoke${COLORS.reset}

  ${COLORS.dim}2.${COLORS.reset} ${COLORS.bold}Bootstrap from your codebase${COLORS.reset} (recommended — agent-less, 1 line):
       ${COLORS.cyan}${analyzeCommand}${COLORS.reset}     ${COLORS.dim}# preview candidates only${COLORS.reset}
       ${COLORS.cyan}${bootstrapCommand}${COLORS.reset}   ${COLORS.dim}# apply nodes + edges${COLORS.reset}
       ${COLORS.dim}analyze (project + domains + capabilities + elements) + infer-imports${COLORS.reset}
       ${COLORS.dim}(depends_on edges) batch land in 3 round-trips. --threshold N filters${COLORS.reset}
       ${COLORS.dim}weak imports.${COLORS.reset}

  ${COLORS.dim}3.${COLORS.reset} ${COLORS.bold}Or add your first node by hand:${COLORS.reset}
       ${COLORS.cyan}${CLI} add capability auth/token-issue --title="Token issue" --domain=auth${COLORS.reset}
       ${COLORS.cyan}${CLI} find token${COLORS.reset}                  ${COLORS.dim}# verify it shows up${COLORS.reset}

  ${COLORS.dim}4.${COLORS.reset} ${COLORS.bold}Edit project.md${COLORS.reset} — set your project's real name + description.
       Then add domains / capabilities / elements as you discover them.

  ${COLORS.dim}5.${COLORS.reset} ${COLORS.bold}Open this folder in an AI agent${COLORS.reset}:
       ${COLORS.bold}Claude Code / Cursor${COLORS.reset}
       Both your codebase root (cwd) and the vault folder now have a wired
       ${COLORS.bold}.mcp.json${COLORS.reset}. Open either folder, restart the agent,
       and the ${COLORS.bold}ontology-atlas${COLORS.reset} namespace appears with ${MCP_TOOL_COUNT} tools
       (${MCP_TOOL_SPLIT}).

       ${COLORS.bold}Codex${COLORS.reset}
       Both your codebase root (cwd) and the vault folder now have a wired
       ${COLORS.bold}.codex/config.toml${COLORS.reset}. Open either folder in Codex and restart it.
       For a global Codex config instead, run:
       ${COLORS.cyan}${codexSetupCommand}${COLORS.reset}
       ${COLORS.dim}Codex can store MCP servers globally too, so the command is optional when the repo-local config is enough.${COLORS.reset}

  ${COLORS.dim}6.${COLORS.reset} ${COLORS.bold}See the graph${COLORS.reset} (optional, macOS app):
       Install the ontology-atlas macOS app from:
       ${COLORS.cyan}https://wlsdks.github.io/ontology-atlas/download/${COLORS.reset}
       Point its ${COLORS.bold}/docs${COLORS.reset} picker at this vault.

${COLORS.dim}AI agents and humans now share the same vault. Have fun.${COLORS.reset}
`);
  return 0;
}

// `init --quick-start` (Slice 0 — docs/plans/PRODUCT-PLAN-2026-07.md §9): one
// command = scaffold (already done by the time this runs, no prompts either
// way) + bootstrap from the repo (reuses the existing analyze/infer-imports
// pipeline via `runBootstrap` — no reimplementation) + .mcp.json (already
// unconditional above) + an absorb suggestion when CLAUDE.md/AGENTS.md
// exists (approval-tier principle: never auto-absorbed, human opt-in only)
// + a compact next-steps block (3 lines max).
async function runQuickStart({ target, cwdVaultArg }) {
  stdout.write(`\n${COLORS.bold}quick start${COLORS.reset} — bootstrapping from your repo...\n`);
  const bootstrapCode = await runBootstrap(['.', '--vault', cwdVaultArg]);

  const repoRoot = cwd();
  const foundGuides = ['AGENTS.md', 'CLAUDE.md'].filter((name) => existsSync(join(repoRoot, name)));
  if (foundGuides.length > 0) {
    stdout.write(
      `\n${COLORS.yellow}note${COLORS.reset}  found ${foundGuides.join(', ')} — consider absorbing ` +
        `${foundGuides.length > 1 ? 'them' : 'it'} into the vault (never automatic — your call):\n`,
    );
    for (const guide of foundGuides) {
      // 붙여넣어 실행하라고 청록색으로 찍는 줄 — `cliInvocation()` 을 통과해야
      // 한다(`self-invocation.mjs` 의 규율). 바로 아래 「Next」 줄은 이미 CLI 를
      // 쓰고 있었는데 이 줄만 죽은 이름이었다.
      const absorbCommand = [
        CLI,
        ...['absorb', guide, '--vault', cwdVaultArg].map(shellQuote),
      ].join(' ');
      stdout.write(`       ${COLORS.cyan}${absorbCommand}${COLORS.reset}\n`);
    }
    stdout.write(
      `       ${COLORS.dim}dry-run by default — review the plan, then land it yourself by adding --write${COLORS.reset}\n`,
    );
  }

  stdout.write(`
${COLORS.green}${COLORS.bold}quick start done${COLORS.reset} — vault scaffolded + bootstrapped from your repo.

${COLORS.bold}Next:${COLORS.reset}
  ${COLORS.dim}1.${COLORS.reset} Open the vault        ${COLORS.cyan}cd ${target} && ${CLI} list${COLORS.reset}
  ${COLORS.dim}2.${COLORS.reset} MCP already wired      restart Claude Code / Cursor / Codex from this folder
  ${COLORS.dim}3.${COLORS.reset} Try asking your agent  e.g. "what does the auth capability depend on?"
`);
  return bootstrapCode;
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
    return runInit(parsed.target, { quickStart: parsed.quickStart, locale: parsed.locale });
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
