// R13 #40 — CLI 5 명령 통합 test. mcp 의 integration.test.mjs 패턴 reuse.
// tmp vault fixture + cli spawn + stdout/exit code 검증.
//
// Source-checkout only. Run via `pnpm integration:cli` or
// `node --test cli/src/integration.test.mjs` from the repo root.

import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  readFileSync,
  rmSync,
  readdirSync,
} from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import {
  CLI_COMMANDS,
  CLI_COMMAND_COUNT,
  CLI_COMMAND_MODULES,
  CLI_COMMAND_RUNNERS,
  parseCliCommandMetadataFromDescription,
} from './lib/cli-commands.mjs';
import { parseMcpToolMetadataFromDescription } from './lib/mcp-metadata.mjs';
import {
  formatNoTestMatchMessage,
  formatTestFilterSuffix,
  resolveTestNamePattern,
} from '../../scripts/lib/test-name-pattern.mjs';
import { assertPnpmScriptsExist } from '../../scripts/lib/pnpm-script-refs.mjs';
import { CLI_CLIENT_INFO } from './lib/mcp-call.mjs';
import { expectedToolsListAnnotationSummary } from '../../mcp/scripts/verify.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CLI = join(__dirname, 'index.mjs');
const ROOT_PKG = JSON.parse(readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8'));
const CLI_PKG = JSON.parse(readFileSync(join(__dirname, '..', 'package.json'), 'utf-8'));
const MCP_PKG = JSON.parse(readFileSync(join(__dirname, '..', '..', 'mcp', 'package.json'), 'utf-8'));
const CLI_COMMAND_METADATA = parseCliCommandMetadataFromDescription(CLI_PKG.description);
const MCP_TOOL_METADATA = parseMcpToolMetadataFromDescription(MCP_PKG.description);
const EXPECTED_TOOL_COUNT = MCP_TOOL_METADATA?.toolCount;
const EXPECTED_TOOL_SPLIT_RE = MCP_TOOL_METADATA?.splitPattern;

assert.ok(CLI_COMMAND_METADATA, 'cli/package.json description must include the current command count');
assert.ok(MCP_TOOL_METADATA, 'mcp/package.json description must include the current tool count and split');

function run(args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [CLI, ...args], {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (b) => (stdout += b.toString()));
    proc.stderr.on('data', (b) => (stderr += b.toString()));
    proc.on('close', (code) => resolve({ code, stdout, stderr }));
    proc.on('error', reject);
  });
}

function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, '');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function withVault(seed = []) {
  const root = mkdtempSync(join(tmpdir(), 'cli-int-'));
  for (const { slug, content } of seed) {
    const full = join(root, `${slug}.md`);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content, 'utf-8');
  }
  return root;
}

let passed = 0;
let failed = 0;
let skipped = 0;
const TEST_FILTER = resolveTestFilter();
const TEST_NAME_PATTERN = TEST_FILTER.pattern;

function resolveTestFilter() {
  try {
    return resolveTestNamePattern();
  } catch (err) {
    console.error(err.message ?? err);
    process.exit(1);
  }
}

async function test(name, fn) {
  if (TEST_NAME_PATTERN && !TEST_NAME_PATTERN.test(name)) {
    skipped += 1;
    return;
  }
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed += 1;
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message ?? err}`);
  }
}

console.log(
  TEST_NAME_PATTERN
    ? `cli integration (${formatTestFilterSuffix(TEST_FILTER)})`
    : 'cli integration',
);

await test('metadata — package command count matches executable command inventory', async () => {
  assert.equal(CLI_COMMAND_METADATA.commandCount, CLI_COMMAND_COUNT);
});

await test('metadata — MCP clientInfo version matches CLI package version', async () => {
  assert.deepEqual(CLI_CLIENT_INFO, {
    name: 'oh-my-ontology-cli',
    version: CLI_PKG.version,
  });
});

await test('command inventory — help and command modules stay aligned', async () => {
  const r = await run(['--help']);
  assert.equal(r.code, 0);
  const clean = stripAnsi(r.stdout);

  for (const command of CLI_COMMANDS) {
    assert.match(clean, new RegExp(`oh-my-ontology ${command.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`));
  }

  for (const [command, runner] of Object.entries(CLI_COMMAND_RUNNERS)) {
    const mod = await import(runner.modulePath);
    assert.equal(typeof mod[runner.exportName], 'function', `${command} exports ${runner.exportName}`);
  }

  const commandFiles = readdirSync(join(__dirname, 'commands'))
    .filter((name) => name.endsWith('.mjs'))
    .sort();
  assert.deepEqual(commandFiles, Object.values(CLI_COMMAND_MODULES).sort());
});

await test('subcommand --help — every command exits cleanly without touching runtime state', async () => {
  for (const command of CLI_COMMANDS) {
    const r = await run([command, '--help']);
    assert.equal(r.code, 0, `${command} --help should exit 0\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stderr, '', `${command} --help should not write to stderr`);
    assert.match(stripAnsi(r.stdout), /Usage:/, `${command} --help should print usage`);
  }
});

await test('help — current setup contract and default slug layout are not stale', async () => {
  const r = await run(['--help']);
  assert.equal(r.code, 0);
  const clean = stripAnsi(r.stdout);
  assert.match(clean, /--raw-slug/);
  assert.match(clean, /default kind→folder prefix/);
  assert.doesNotMatch(clean, /auto-prefix.*opt-in/);
  assert.match(clean, /Codex 'mcp add'/);
  assert.match(clean, /Recommends 'bootstrap'/);
  assert.match(clean, /mcp-verify/);
  assert.match(clean, /graph-query smoke/);
  assert.match(clean, /OMOT_CLI_MCP_TIMEOUT_MS=N/);
  assert.match(clean, /longer one-shot MCP call window/);
});

await test('help <command> — delegates to focused subcommand usage and fails unknown topics on stderr', async () => {
  const compile = await run(['help', 'compile']);
  assert.equal(compile.code, 0);
  assert.equal(compile.stderr, '');
  assert.match(stripAnsi(compile.stdout), /Usage:\s+oh-my-ontology compile/);
  assert.doesNotMatch(stripAnsi(compile.stdout), /AI-native codebase ontology workbench/);

  const init = await run(['help', 'init']);
  assert.equal(init.code, 0);
  assert.equal(init.stderr, '');
  assert.match(stripAnsi(init.stdout), /Usage:\s+oh-my-ontology init \[folder\]/);

  const typo = await run(['help', 'complie']);
  assert.equal(typo.code, 1);
  assert.equal(typo.stdout, '');
  assert.match(stripAnsi(typo.stderr), /unknown help topic: complie\. Did you mean compile\?/);
  assert.match(stripAnsi(typo.stderr), /Usage:/);

  const extra = await run(['help', '--help', 'compile']);
  assert.equal(extra.code, 1);
  assert.equal(extra.stdout, '');
  assert.match(stripAnsi(extra.stderr), /too many arguments: compile/);
  assert.match(stripAnsi(extra.stderr), /Usage:/);
});

await test('top-level command typos include closest command hints', async () => {
  const cases = [
    { args: ['complie', 'docs/ontology', '--summary'], stderr: /unknown command: complie\. Did you mean compile\?/ },
    { args: ['hlep'], stderr: /unknown command: hlep\. Did you mean help\?/ },
    { args: ['--versoin'], stderr: /unknown command: --versoin\. Did you mean --version\?/ },
  ];
  for (const c of cases) {
    const r = await run(c.args);
    assert.equal(r.code, 1);
    assert.match(stripAnsi(r.stderr), c.stderr);
    assert.match(stripAnsi(r.stderr), /Usage:/);
    assert.equal(r.stdout, '');
  }
});

await test('list — empty vault: 0 노드 메시지', async () => {
  const root = withVault([]);
  try {
    const r = await run(['list', root]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /ontology 노드 0|0 ontology 노드/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('init — generated MCP config points at a runnable local server in source checkout', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-init-'));
  try {
    const r = await run(['init', 'ontology'], { cwd: root });
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, new RegExp(`${EXPECTED_TOOL_COUNT} tools`));
    assert.match(clean, EXPECTED_TOOL_SPLIT_RE);
    assert.doesNotMatch(clean, /16 MCP tools|16 tools/);
    assert.doesNotMatch(clean, /bootstrap .*--apply/);
    assert.match(clean, /Codex/);
    assert.match(clean, /codex mcp add oh-my-ontology/);
    assert.match(clean, /graph smoke/);
    assert.match(clean, /oh-my-ontology analyze \. --vault \.\/ontology/);
    assert.match(clean, /oh-my-ontology bootstrap \. --vault \.\/ontology/);
    assert.doesNotMatch(clean, /\/path\/to\/your\/repo/);

    const config = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8'));
    const server = config.mcpServers['oh-my-ontology'];
    assert.equal(server.env.OMOT_VAULT, './ontology');
    assert.equal(server.command, 'node');
    assert.match(server.args[0], /mcp\/src\/index\.js$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('init — rejects unknown flags and extra positional args before writing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-init-args-'));
  try {
    const flag = await run(['init', '--hlep'], { cwd: root });
    assert.equal(flag.code, 1);
    assert.match(stripAnsi(flag.stderr), /unknown flag: --hlep\. Did you mean --help\?/);
    assert.equal(existsSyncTest(join(root, '--hlep')), false);

    const shortTypo = await run(['init', '-help'], { cwd: root });
    assert.equal(shortTypo.code, 1);
    assert.match(stripAnsi(shortTypo.stderr), /unknown flag: -help\. Did you mean --help\?/);
    assert.equal(existsSyncTest(join(root, '-help')), false);

    const extra = await run(['init', 'one', 'two'], { cwd: root });
    assert.equal(extra.code, 1);
    assert.match(stripAnsi(extra.stderr), /too many arguments: two/);
    assert.equal(existsSyncTest(join(root, 'one')), false);

    const help = await run(['init', '--help'], { cwd: root });
    assert.equal(help.code, 0);
    assert.equal(help.stderr, '');
    assert.match(stripAnsi(help.stdout), /Usage:/);
    assert.equal(existsSyncTest(join(root, '--help')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('init — rejects invalid OMOT_MCP_PATH overrides before writing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-init-mcp-path-'));
  try {
    const missingPath = join(root, 'missing-mcp-entry.js');
    const missing = await run(['init', 'ontology'], {
      cwd: root,
      env: { OMOT_MCP_PATH: missingPath },
    });
    assert.equal(missing.code, 2);
    assert.equal(missing.stdout, '');
    assert.match(stripAnsi(missing.stderr), /OMOT_MCP_PATH does not exist/);
    assert.equal(existsSyncTest(join(root, 'ontology')), false);

    const directory = await run(['init', 'ontology'], {
      cwd: root,
      env: { OMOT_MCP_PATH: root },
    });
    assert.equal(directory.code, 2);
    assert.equal(directory.stdout, '');
    assert.match(stripAnsi(directory.stderr), /OMOT_MCP_PATH is not a file/);
    assert.equal(existsSyncTest(join(root, 'ontology')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('mcp-verify — runs MCP package verify against a resolved vault', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-mcp-verify-'));
  try {
    const init = await run(['init', 'ontology'], { cwd: root });
    assert.equal(init.code, 0, `stdout: ${init.stdout}\nstderr: ${init.stderr}`);

    const r = await run(['mcp-verify', 'ontology', '--timeout-ms', '1000'], { cwd: root });
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /timeout=1000ms/);
    assert.match(clean, new RegExp(`tools/list ${EXPECTED_TOOL_COUNT}/${EXPECTED_TOOL_COUNT}`));
    assert.match(clean, new RegExp(escapeRegExp(expectedToolsListAnnotationSummary())));
    assert.match(clean, /get_concepts/);
    assert.match(clean, /2 ok rows, 1 partial row/);
    assert.match(clean, /query_concepts limited — 1 query result \/ 4 total query results \(limited true\)/);
    assert.match(clean, /analyze_repo_structure/);
    assert.match(clean, /infer_imports/);
    assert.match(clean, /find_orphans/);
    assert.match(clean, /root\/sentinel defaults excluded/);
    assert.match(clean, /list_kinds/);
    assert.match(clean, /validate_vault/);
    assert.match(clean, /workspace_brief/);
    assert.match(clean, /workspace_brief non-blocking advisory nextActions/);
    assert.match(clean, /compile_issues:warn/);
    assert.match(clean, /health/);
    assert.match(clean, /compile_ontology/);
    assert.match(clean, /compile_ontology page — 1\/5 nodes, 1\/\d+ edges/);
    assert.match(clean, /compile_ontology indexes — out \d+, in \d+, edgeById \d+, aliases \d+, edges \d+\/\d+\/\d+/);
    assert.match(clean, /overview/);
    assert.match(clean, /overview query_plan/);
    assert.match(clean, /project_map query_plan/);
    assert.match(clean, /maintenance cursor — missing afterActionId reported/);
    assert.match(clean, /phase none; severity none; kind none; executable none; review none/);
    assert.match(clean, /maintenance cursor — ready page stable/);
    assert.match(clean, /neighbors — elements\/example/);
    assert.match(clean, /path — elements\/example → project \(1 hop, 1 edge\)/);
    assert.match(clean, /project_scope/);
    assert.match(clean, /destructive dry-runs — rename_concept · merge_concepts · delete_concept preview without write-maintenance/);
    assert.match(clean, /structuredContent — direct 16\/16, write 5\/5 \(batch row-isolation 2\/2, destructive dry-run 3\/3\), maintenance 3\/3, graph 11\/11/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('mcp-verify — verifies maintenance cursor resume when actions exist', async () => {
  const root = withVault([
    {
      slug: 'project',
      content: [
        '---',
        'kind: project',
        'slug: project',
        'title: Project',
        'domains:',
        '  - core',
        '---',
        '',
        '# Project',
        '',
      ].join('\n'),
    },
    {
      slug: 'core',
      content: [
        '---',
        'kind: domain',
        'slug: core',
        'title: Core',
        '---',
        '',
        '# Core',
        '',
      ].join('\n'),
    },
    {
      slug: 'feature',
      content: [
        '---',
        'kind: capability',
        'slug: feature',
        'title: Feature',
        'domain: core',
        'elements: []',
        '---',
        '',
        '# Feature',
        '',
      ].join('\n'),
    },
  ]);
  try {
    const r = await run(['mcp-verify', root, '--timeout-ms', '3000']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /maintenance cursor — ready page stable \(1 remaining action/);
    assert.match(clean, /kind add_missing_relation:1/);
    assert.match(clean, /maintenance cursor — resume afterActionId advanced \(maint_[a-f0-9]{8}; 0 remaining actions/);
    assert.match(clean, /query_concepts limited — 1 query result \/ 2 total query results \(limited true\)/);
    assert.match(clean, /destructive dry-runs — rename_concept · merge_concepts · delete_concept preview without write-maintenance/);
    assert.match(clean, /structuredContent — direct 16\/16, write 5\/5 \(batch row-isolation 2\/2, destructive dry-run 3\/3\), maintenance 3\/3, graph 11\/11/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('mcp-verify — allows valid vaults without a project node', async () => {
  const root = withVault([
    {
      slug: 'domains/core',
      content: [
        '---',
        'kind: domain',
        'slug: domains/core',
        'title: Core',
        '---',
        '',
        '# Core',
        '',
      ].join('\n'),
    },
  ]);
  try {
    const r = await run(['mcp-verify', root, '--timeout-ms', '1000']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /maintenance cursor — missing afterActionId reported/);
    assert.match(clean, /maintenance cursor — ready page stable/);
    assert.match(clean, /neighbors — domains\/core/);
    assert.match(clean, /path — domains\/core → domains\/core \(0 hops, 0 edges\)/);
    assert.match(clean, /project_scope — skipped \(no project node in vault\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('mcp-verify — allows an empty vault folder before graph smoke targets exist', async () => {
  const root = withVault([]);
  try {
    const r = await run(['mcp-verify', root, '--timeout-ms', '3000']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /vault total 0 nodes/);
    assert.match(clean, /maintenance cursor — ready page stable/);
    assert.match(clean, /neighbors\/path — skipped \(vault has no nodes\)/);
    assert.match(clean, /project_scope — skipped \(no project node in vault\)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('mcp-verify --help — describes the full graph-query smoke contract', async () => {
  const r = await run(['mcp-verify', '--help']);
  assert.equal(r.code, 0);
  assert.equal(r.stderr, '');
  const clean = stripAnsi(r.stdout);
  assert.match(clean, /Usage:/);
  assert.match(clean, /server boot/);
  assert.match(clean, /tool inventory \(missing\/extra\/duplicate\/invalid names\)/);
  assert.match(clean, /tools\/list inventory names, schema strictness, and annotation coverage/);
  assert.match(clean, /get_concept/);
  assert.match(clean, /get_concepts/);
  assert.match(clean, /find_evidence\/find_backlinks\/query_concepts\/limited query_concepts\/analyze_repo_structure\/infer_imports/);
  assert.match(clean, /find_neighbors\/find_path/);
  assert.match(clean, /find_orphans/);
  assert.match(clean, /project probe/);
  assert.match(clean, /node census\/file validation/);
  assert.match(clean, /list_kinds\/list_concepts\/compile_ontology\/overview/);
  assert.match(clean, /validate_vault\.scanned stays file-level health/);
  assert.match(clean, /Successful output prints read census consistency/);
  assert.match(clean, /compile_ontology summary \+ paginated full-artifact \+ indexed full-artifact smoke/);
  assert.match(clean, /neighbors\/node-to-project path\/project_scope graph-query smoke/);
  assert.match(clean, /tools\/list inventory names, schema strictness/);
  assert.match(clean, /annotation coverage \(title\/read\/write\/destructive\/idempotent\/local-only\)/);
  assert.match(clean, /destructive writer dry-runs with every planned response present and no changed\/postWriteMaintenance/);
  assert.match(clean, /patch_concept stale expected_mtime conflict guard rejection with vault_conflict/);
  assert.match(clean, /structuredContent coverage split by direct reads \/ batch row-isolation writes \/ destructive dry-runs \/ maintenance cursor checks \/ graph queries/);
  assert.match(clean, /write-tool postWriteMaintenance byPhase\/bySeverity\/byKind buckets \+ score\/proposedAction\/next-action guidance/);
  assert.match(clean, /runtime unknown-argument \/ invalid-enum rejection with structuredContent errorCode values \(unknown_argument \/ invalid_arguments\)/);
  assert.match(clean, /list_concepts\.kind, query_concepts\.kind\/has-key, find_neighbors\.types, find_orphans\.kind\/excludeKinds, match_nodes\.kind\/sort, recommend_relations\.kind, and match_edges\.type\/fromKind\/toKind typo and unsupported-kind rejection/);
  assert.match(clean, /relation filter \/ relation_check closest-value rejection/);
  assert.match(clean, /maintenance_plan cursor smoke/);
  assert.match(clean, /Maintenance filters are enum-validated for phases\/severities\/kinds/);
  assert.match(clean, /cursor smoke checks both cursor\.found=true with cursor\.reason=null and cursor\.found=false/);
  assert.match(clean, /ready cursor has actions, verify resumes from the first returned action id/);
  assert.match(clean, /zero remaining actions, and no next actions/);
  assert.match(clean, /nextExecutableAction \/ nextReviewAction point only at the first executable\/review action in the current returned page/);
  assert.match(clean, /Successful maintenance cursor lines print bucket summaries plus current-page executable\/review next-action summaries/);
  assert.match(clean, /Focused checks:/);
  assert.match(clean, /pnpm test:cli:args\s+CLI argument parser contract checks/);
  assert.match(clean, /pnpm integration:cli:mcp-verify/);
  assert.match(clean, /Installed CLI mcp-verify wrapper flow\/help\/failure checks/);
  assert.match(clean, /pnpm dogfood:compile\s+Root checkout dogfood vault compile_ontology summary/);
  assert.match(clean, /pnpm dogfood:compile-fix\s+Root checkout dogfood vault compile --fix idempotence gate/);
  assert.match(clean, /pnpm test:dogfood:args\s+Narrow dogfood shortcut argument helper contract/);
  assert.match(clean, /pnpm test:dogfood:script-refs\s+Narrow help\/package-script reference contract/);
  assert.match(clean, /pnpm test:dogfood:compile-fix\s+Narrow dogfood compile --fix idempotence runner contract/);
  assert.match(clean, /pnpm dogfood:health\s+Root checkout dogfood vault health gate/);
  assert.match(clean, /pnpm dogfood:brief\s+Root checkout dogfood vault workspace_brief snapshot/);
  assert.match(clean, /pnpm dogfood:status\s+Root checkout dogfood vault human-readable health \+ brief/);
  assert.match(clean, /pnpm test:dogfood:status\s+Narrow dogfood status shortcut runner contract/);
  assert.match(clean, /pnpm dogfood:verify\s+Root checkout dogfood vault verify shortcut/);
  assert.match(clean, /pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000\s+Source-checkout dogfood verify with explicit args/);
  assert.match(clean, /pnpm cli:mcp-verify -- --help\s+Source-checkout shortcut for this help from the repo root/);
  assert.match(clean, /pnpm test:mcp:verify\s+MCP verify helper contract without the full integration suite/);
  assert.match(clean, /pnpm test:mcp:verify:first-contact\s+Narrow first-contact initialize-safety-recovery\/unknown-tool\/write-safety\/health-summary\/advisory\/read\/sample-shape helper gates/);
  assert.match(clean, /pnpm test:mcp:verify:timeout/);
  assert.match(clean, /Narrow MCP verify timeout\/startup\/help diagnostics/);
  assertPnpmScriptsExist(clean, ROOT_PKG.scripts);
});

await test('mcp-verify — rejects invalid timeout values', async () => {
  const r = await run(['mcp-verify', '--timeout-ms', 'nope']);
  assert.equal(r.code, 1);
  assert.match(stripAnsi(r.stderr), /--timeout-ms must be a positive integer/);
  assert.match(stripAnsi(r.stderr), /Received: "nope"/);
  assert.match(stripAnsi(r.stderr), /--timeout-ms N/);
  assert.match(stripAnsi(r.stderr), /OMOT_VERIFY_TIMEOUT_MS=N/);
  assert.match(stripAnsi(r.stderr), /oh-my-ontology mcp-verify --timeout-ms 15000/);

  const partial = await run(['mcp-verify', '--timeout-ms=1000ms']);
  assert.equal(partial.code, 1);
  assert.match(stripAnsi(partial.stderr), /--timeout-ms must be a positive integer/);
  assert.match(stripAnsi(partial.stderr), /Received: "1000ms"/);
  assert.match(stripAnsi(partial.stderr), /--timeout-ms N/);
  assert.match(stripAnsi(partial.stderr), /OMOT_VERIFY_TIMEOUT_MS=N/);
  assert.match(stripAnsi(partial.stderr), /oh-my-ontology mcp-verify --timeout-ms 15000/);

  const explicitVault = await run(['mcp-verify', 'ontology', '--timeout-ms=1000ms']);
  assert.equal(explicitVault.code, 1);
  assert.match(stripAnsi(explicitVault.stderr), /--timeout-ms must be a positive integer/);
  assert.match(stripAnsi(explicitVault.stderr), /Received: "1000ms"/);
  assert.match(stripAnsi(explicitVault.stderr), /oh-my-ontology mcp-verify --vault ontology --timeout-ms 15000/);

  const explicitVaultFlag = await run(['mcp-verify', '--vault', 'ontology', '--timeout-ms=1000ms']);
  assert.equal(explicitVaultFlag.code, 1);
  assert.match(stripAnsi(explicitVaultFlag.stderr), /oh-my-ontology mcp-verify --vault ontology --timeout-ms 15000/);

  const missing = await run(['mcp-verify', '--timeout-ms']);
  assert.equal(missing.code, 1);
  assert.match(stripAnsi(missing.stderr), /--timeout-ms requires a value/);
  assert.match(stripAnsi(missing.stderr), /Received: undefined/);
  assert.match(stripAnsi(missing.stderr), /oh-my-ontology mcp-verify --timeout-ms 15000/);

  const nextFlag = await run(['mcp-verify', '--timeout-ms', '--vault', 'ontology']);
  assert.equal(nextFlag.code, 1);
  assert.match(stripAnsi(nextFlag.stderr), /--timeout-ms requires a value/);
  assert.match(stripAnsi(nextFlag.stderr), /Received: "--vault"/);
  assert.match(stripAnsi(nextFlag.stderr), /oh-my-ontology mcp-verify --vault ontology --timeout-ms 15000/);

  const envTimeout = await run(['mcp-verify', 'ontology'], {
    env: { OMOT_VERIFY_TIMEOUT_MS: '1000ms' },
  });
  assert.equal(envTimeout.code, 1);
  assert.match(stripAnsi(envTimeout.stderr), /OMOT_VERIFY_TIMEOUT_MS must be a positive integer/);
  assert.match(stripAnsi(envTimeout.stderr), /Received: "1000ms"/);
  assert.match(stripAnsi(envTimeout.stderr), /oh-my-ontology mcp-verify --vault ontology --timeout-ms 15000/);
  assert.doesNotMatch(stripAnsi(envTimeout.stderr), /npm run verify -- --timeout-ms 15000/);

  const envKillGrace = await run(['mcp-verify', 'ontology'], {
    env: { OMOT_VERIFY_KILL_GRACE_MS: '1000ms' },
  });
  assert.equal(envKillGrace.code, 1);
  assert.match(stripAnsi(envKillGrace.stderr), /OMOT_VERIFY_KILL_GRACE_MS must be a positive integer/);
  assert.match(stripAnsi(envKillGrace.stderr), /Received: "1000ms"/);
  assert.match(stripAnsi(envKillGrace.stderr), /Set OMOT_VERIFY_KILL_GRACE_MS=N/);

  const envTimeoutOverridden = await run(['mcp-verify', 'ontology', '--timeout-ms', '1000'], {
    env: { OMOT_VERIFY_TIMEOUT_MS: '1000ms' },
  });
  assert.notEqual(envTimeoutOverridden.code, 1);
  assert.doesNotMatch(stripAnsi(envTimeoutOverridden.stderr), /OMOT_VERIFY_TIMEOUT_MS must be a positive integer/);

  const typo = await run(['mcp-verify', '--timout-ms=1000']);
  assert.equal(typo.code, 1);
  assert.match(stripAnsi(typo.stderr), /unknown flag: --timout-ms=1000\. Did you mean --timeout-ms\?/);
});

await test('mcp-verify — passes CLI retry hint to the verify script', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-mcp-verify-retry-'));
  const vaultWithSpace = join(root, 'vault with space');
  mkdirSync(vaultWithSpace);
  const verifyScript = join(root, 'verify.mjs');
  writeFileSync(
    verifyScript,
    'process.stderr.write(`retry=${process.env.OMOT_VERIFY_RETRY_EXAMPLE}\\n`); process.exit(1);',
    'utf-8',
  );

  const r = await run(['mcp-verify', vaultWithSpace], {
    env: { OMOT_MCP_VERIFY_PATH: verifyScript },
  });

  assert.equal(r.code, 1);
  assert.match(stripAnsi(r.stderr), /retry=oh-my-ontology mcp-verify --vault '.+vault with space' --timeout-ms 15000/);
  assert.doesNotMatch(stripAnsi(r.stderr), /npm run verify -- --timeout-ms 15000/);
});

await test('mcp-verify — times out a stalled verify script override', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-mcp-verify-stall-'));
  const vault = join(root, 'ontology');
  mkdirSync(vault);
  const verifyScript = join(root, 'stalled-verify.mjs');
  writeFileSync(
    verifyScript,
    "process.on('SIGTERM', () => {}); setInterval(() => {}, 1000);",
    'utf-8',
  );

  const started = Date.now();
  const r = await run(['mcp-verify', vault, '--timeout-ms', '25'], {
    env: {
      OMOT_MCP_VERIFY_PATH: verifyScript,
      OMOT_VERIFY_KILL_GRACE_MS: '25',
    },
  });

  assert.equal(r.code, 1);
  assert.ok(Date.now() - started < 1000, 'wrapper should fail closed without hanging the integration suite');
  assert.match(stripAnsi(r.stderr), /MCP verify wrapper timed out after 50ms/);
  assert.match(stripAnsi(r.stderr), /Check OMOT_MCP_VERIFY_PATH/);
  assert.match(stripAnsi(r.stderr), /increase --timeout-ms \/ OMOT_VERIFY_TIMEOUT_MS/);
});

await test('mcp-verify — reports verify script signal exits', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-mcp-verify-signal-'));
  const vault = join(root, 'ontology');
  mkdirSync(vault);
  const verifyScript = join(root, 'signal-verify.mjs');
  writeFileSync(
    verifyScript,
    "process.stderr.write('verify script signal\\n'); process.kill(process.pid, 'SIGTERM');",
    'utf-8',
  );

  const r = await run(['mcp-verify', vault], {
    env: { OMOT_MCP_VERIFY_PATH: verifyScript },
  });

  assert.equal(r.code, 1);
  assert.match(stripAnsi(r.stderr), /verify script signal/);
  assert.match(stripAnsi(r.stderr), /MCP verify script terminated by SIGTERM/);
  assert.match(stripAnsi(r.stderr), /Check OMOT_MCP_VERIFY_PATH/);
});

await test('mcp-verify — rejects ambiguous vault arguments', async () => {
  const missing = await run(['mcp-verify', '--vault']);
  assert.equal(missing.code, 1);
  assert.match(stripAnsi(missing.stderr), /--vault requires a path/);

  const flagValue = await run(['mcp-verify', '--vault', '--timeout-ms', '1000']);
  assert.equal(flagValue.code, 1);
  assert.match(stripAnsi(flagValue.stderr), /--vault requires a path/);

  const empty = await run(['mcp-verify', '--vault=']);
  assert.equal(empty.code, 1);
  assert.match(stripAnsi(empty.stderr), /--vault requires a path/);

  const duplicate = await run(['mcp-verify', 'ontology', '--vault', 'docs/ontology']);
  assert.equal(duplicate.code, 1);
  assert.match(stripAnsi(duplicate.stderr), /either positional argument or --vault/);
});

await test('mcp-verify — fails an explicit missing verify script override', async () => {
  const missing = await run(['mcp-verify', 'docs/ontology'], {
    env: { OMOT_MCP_VERIFY_PATH: join(tmpdir(), 'missing-omot-verify-script.mjs') },
  });
  assert.equal(missing.code, 2);
  assert.match(stripAnsi(missing.stderr), /OMOT_MCP_VERIFY_PATH does not exist/);

  const directory = await run(['mcp-verify', 'docs/ontology'], {
    env: { OMOT_MCP_VERIFY_PATH: tmpdir() },
  });
  assert.equal(directory.code, 2);
  assert.match(stripAnsi(directory.stderr), /OMOT_MCP_VERIFY_PATH is not a file/);
});

await test('compile --fix — applies compiler relation-array canonicalization', async () => {
  const root = withVault([
    {
      slug: 'project',
      content:
        '---\nkind: project\ntitle: Project\ncapabilities:\n  - capabilities/z\n  - capabilities/a\n  - capabilities/z\n---\n',
    },
    {
      slug: 'capabilities/a',
      content: '---\nkind: capability\ntitle: A\n---\n',
    },
    {
      slug: 'capabilities/z',
      content: '---\nkind: capability\ntitle: Z\n---\n',
    },
  ]);
  try {
    const preview = await run(['compile', root]);
    assert.equal(preview.code, 0, `stdout: ${preview.stdout}\nstderr: ${preview.stderr}`);
    assert.match(stripAnsi(preview.stdout), /reorder available/);

    const fixed = await run(['compile', root, '--fix']);
    assert.equal(fixed.code, 0, `stdout: ${fixed.stdout}\nstderr: ${fixed.stderr}`);
    assert.match(stripAnsi(fixed.stdout), /reorder 1\/1 applied/);

    const text = readFileSync(join(root, 'project.md'), 'utf-8');
    assert.match(text, /capabilities: \[capabilities\/a, capabilities\/z\]/);
    assert.doesNotMatch(text, /capabilities\/z\n  - capabilities\/a\n  - capabilities\/z/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile --fix — applies all canonicalization actions even when output is paginated', async () => {
  const root = withVault([
    {
      slug: 'project',
      content:
        '---\nkind: project\ntitle: Project\ncapabilities:\n  - capabilities/z\n  - capabilities/a\n---\n',
    },
    {
      slug: 'domains/core',
      content:
        '---\nkind: domain\ntitle: Core\ncapabilities:\n  - capabilities/z\n  - capabilities/a\n---\n',
    },
    {
      slug: 'capabilities/a',
      content: '---\nkind: capability\ntitle: A\n---\n',
    },
    {
      slug: 'capabilities/z',
      content: '---\nkind: capability\ntitle: Z\n---\n',
    },
  ]);
  try {
    const fixed = await run(['compile', root, '--fix', '--nodes-limit=1', '--edges-limit=1']);
    assert.equal(fixed.code, 0, `stdout: ${fixed.stdout}\nstderr: ${fixed.stderr}`);
    assert.match(stripAnsi(fixed.stdout), /nodes page offset 0 · returned 1\/4 · next 1/);
    assert.match(stripAnsi(fixed.stdout), /edges page offset 0 · returned 1\/4 · next 1/);
    assert.match(stripAnsi(fixed.stdout), /reorder 2\/2 applied/);

    const project = readFileSync(join(root, 'project.md'), 'utf-8');
    const domain = readFileSync(join(root, 'domains/core.md'), 'utf-8');
    assert.match(project, /capabilities: \[capabilities\/a, capabilities\/z\]/);
    assert.match(domain, /capabilities: \[capabilities\/a, capabilities\/z\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile --json — flushes full machine output through stdout pipes', async () => {
  const capabilityCount = 720;
  const seed = [
    {
      slug: 'project',
      content:
        '---\nkind: project\ntitle: Project\ncapabilities:\n' +
        Array.from({ length: capabilityCount }, (_, index) => `  - capabilities/cap-${index}`).join('\n') +
        '\n---\n',
    },
    ...Array.from({ length: capabilityCount }, (_, index) => ({
      slug: `capabilities/cap-${index}`,
      content: `---\nkind: capability\ntitle: Capability ${index}\n---\n`,
    })),
  ];
  const root = withVault(seed);
  try {
    const r = await run(['compile', root, '--json']);
    assert.equal(r.code, 0, `stdout bytes: ${r.stdout.length}\nstderr: ${r.stderr}`);
    assert.ok(r.stdout.length > 65_536, `fixture should exceed common pipe buffer size, got ${r.stdout.length}`);
    const payload = JSON.parse(r.stdout);
    assert.equal(payload.nodeCount, capabilityCount + 1);
    assert.equal(payload.unresolvedEdgeCount, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile --fix — fails closed when canonicalization actions are missing', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { graphHash: 'hash', nodeCount: 1, edgeCount: 0, issueCount: 0, unresolvedEdgeCount: 0, canonicalizationActionCount: 1, summary: { nodes: 1, edges: 0, issues: 0, unresolvedEdges: 0, graphHash: 'hash', resolvedEdges: 0, externalEdges: 0 } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['compile', root, '--fix'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /missing canonicalizationActions array/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile --fix — fails closed when canonicalization action count drifts', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-count.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { graphHash: 'hash', nodeCount: 1, edgeCount: 0, issueCount: 0, unresolvedEdgeCount: 0, canonicalizationActionCount: 1, canonicalizationActions: [], summary: { nodes: 1, edges: 0, issues: 0, unresolvedEdges: 0, graphHash: 'hash', resolvedEdges: 0, externalEdges: 0 } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['compile', root, '--fix'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /canonicalizationActionCount mismatch: count=1, actions=0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile --fix — fails closed when canonicalization action count is malformed', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-malformed-count.mjs');
  const callsLog = join(root, 'calls.log');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "import { appendFileSync } from 'node:fs';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    appendFileSync(process.env.OMOT_FAKE_MCP_CALLS, `${msg.params.name}\\n`);",
      "    const payload = { graphHash: 'hash', nodeCount: 1, edgeCount: 0, issueCount: 0, unresolvedEdgeCount: 0, canonicalizationActionCount: '1', canonicalizationActions: [{ slug: 'project', keys: ['contains'], frontmatter: { contains: ['domains/graph'] }, expected_mtime: 1 }], summary: { nodes: 1, edges: 0, issues: 0, unresolvedEdges: 0, graphHash: 'hash', resolvedEdges: 0, externalEdges: 0 } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['compile', root, '--fix'], {
      env: { OMOT_MCP_PATH: fakeMcp, OMOT_FAKE_MCP_CALLS: callsLog },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /canonicalizationActionCount must be a non-negative integer/);
    assert.equal(readFileSync(callsLog, 'utf-8'), 'compile_ontology\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile --fix — fails closed before writes when canonicalization action rows are malformed', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-malformed-action.mjs');
  const callsLog = join(root, 'calls.log');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "import { appendFileSync } from 'node:fs';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    appendFileSync(process.env.OMOT_FAKE_MCP_CALLS, `${msg.params.name}\\n`);",
      "    const payload = { graphHash: 'hash', nodeCount: 1, edgeCount: 0, issueCount: 0, unresolvedEdgeCount: 0, canonicalizationActionCount: 1, canonicalizationActions: [{ slug: '', keys: ['domains'], frontmatter: {}, expected_mtime: 1 }], summary: { nodes: 1, edges: 0, issues: 0, unresolvedEdges: 0, graphHash: 'hash', resolvedEdges: 0, externalEdges: 0 } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['compile', root, '--fix'], {
      env: { OMOT_MCP_PATH: fakeMcp, OMOT_FAKE_MCP_CALLS: callsLog },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /canonicalizationActions\[0\]\.slug must be a non-empty string/);
    assert.equal(readFileSync(callsLog, 'utf-8'), 'compile_ontology\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile --fix — fails closed when canonicalization actions patch non-relation fields', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-non-relation-action.mjs');
  const callsLog = join(root, 'calls.log');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "import { appendFileSync } from 'node:fs';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    appendFileSync(process.env.OMOT_FAKE_MCP_CALLS, `${msg.params.name}\\n`);",
      "    const payload = { graphHash: 'hash', nodeCount: 1, edgeCount: 0, issueCount: 0, unresolvedEdgeCount: 0, canonicalizationActionCount: 1, canonicalizationActions: [{ slug: 'project', keys: ['capabilities'], frontmatter: { title: 'Changed', capabilities: ['capabilities/a'] }, expected_mtime: 1 }], summary: { nodes: 1, edges: 0, issues: 0, unresolvedEdges: 0, graphHash: 'hash', resolvedEdges: 0, externalEdges: 0 } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['compile', root, '--fix'], {
      env: { OMOT_MCP_PATH: fakeMcp, OMOT_FAKE_MCP_CALLS: callsLog },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /canonicalizationActions\[0\]\.frontmatter\.title is not a compiler relation-array key/);
    assert.equal(readFileSync(callsLog, 'utf-8'), 'compile_ontology\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile --help — prints usage without treating help as an error', async () => {
  const longHelp = await run(['compile', '--help']);
  assert.equal(longHelp.code, 0);
  assert.equal(longHelp.stderr, '');
  assert.match(stripAnsi(longHelp.stdout), /Usage:/);
  assert.match(stripAnsi(longHelp.stdout), /oh-my-ontology compile \[vault\]/);
  assert.match(stripAnsi(longHelp.stdout), /--fix/);

  const shortHelp = await run(['compile', '-h']);
  assert.equal(shortHelp.code, 0);
  assert.equal(shortHelp.stderr, '');
  assert.match(stripAnsi(shortHelp.stdout), /Usage:/);
});

await test('compile — rejects zero pagination limits', async () => {
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\n---\n' },
  ]);
  try {
    const nodes = await run(['compile', root, '--nodes-limit=0']);
    assert.equal(nodes.code, 1);
    assert.match(stripAnsi(nodes.stderr), /--nodes-limit must be a positive integer/);

    const edges = await run(['compile', root, '--edges-limit', '0']);
    assert.equal(edges.code, 1);
    assert.match(stripAnsi(edges.stderr), /--edges-limit must be a positive integer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile — rejects pagination limits above MCP page cap', async () => {
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\n---\n' },
  ]);
  try {
    const nodes = await run(['compile', root, '--nodes-limit=501']);
    assert.equal(nodes.code, 1);
    assert.match(stripAnsi(nodes.stderr), /--nodes-limit must be <= 500/);

    const edges = await run(['compile', root, '--edges-limit', '501']);
    assert.equal(edges.code, 1);
    assert.match(stripAnsi(edges.stderr), /--edges-limit must be <= 500/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile — rejects fractional pagination values', async () => {
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\n---\n' },
  ]);
  try {
    const limit = await run(['compile', root, '--nodes-limit=1.5']);
    assert.equal(limit.code, 1);
    assert.match(stripAnsi(limit.stderr), /--nodes-limit must be a positive integer/);

    const offset = await run(['compile', root, '--edges-offset=1.5']);
    assert.equal(offset.code, 1);
    assert.match(stripAnsi(offset.stderr), /--edges-offset must be a non-negative integer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('compile — rejects ambiguous vault arguments before compile/fix', async () => {
  const missing = await run(['compile', '--vault']);
  assert.equal(missing.code, 1);
  assert.match(stripAnsi(missing.stderr), /--vault requires a path/);

  const typo = await run(['compile', '--nodes-lmit=1']);
  assert.equal(typo.code, 1);
  assert.match(stripAnsi(typo.stderr), /unknown flag: --nodes-lmit=1\. Did you mean --nodes-limit\?/);

  const singleDashTypo = await run(['compile', '-summary']);
  assert.equal(singleDashTypo.code, 1);
  assert.match(stripAnsi(singleDashTypo.stderr), /unknown flag: -summary\. Did you mean --summary\?/);

  const flagValue = await run(['compile', '--vault', '--fix']);
  assert.equal(flagValue.code, 1);
  assert.match(stripAnsi(flagValue.stderr), /--vault requires a path/);

  const empty = await run(['compile', '--vault=']);
  assert.equal(empty.code, 1);
  assert.match(stripAnsi(empty.stderr), /--vault requires a path/);

  const duplicate = await run(['compile', 'ontology', '--vault', 'docs/ontology']);
  assert.equal(duplicate.code, 1);
  assert.match(stripAnsi(duplicate.stderr), /either positional argument or --vault/);

  const tooMany = await run(['compile', 'one', 'two']);
  assert.equal(tooMany.code, 1);
  assert.match(stripAnsi(tooMany.stderr), /too many arguments: two/);
});

await test('compile --json — unresolved graph references exit non-zero', async () => {
  const root = withVault([
    {
      slug: 'capabilities/a',
      content:
        '---\nkind: capability\nslug: capabilities/a\ntitle: A\ndependencies: [capabilities/missing]\n---\n\n# A\n',
    },
  ]);
  try {
    const r = await run(['compile', root, '--json']);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.summary.issues, 1);
    assert.equal(data.summary.unresolvedEdges, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('list — kind 있는 노드만 카운트', async () => {
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\n---\n' },
    { slug: 'b', content: '---\nkind: domain\ntitle: B\n---\n' },
    { slug: 'noframe', content: '# just a doc' },
  ]);
  try {
    const r = await run(['list', root]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /2 ontology 노드/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('list --json — JSON 머신 가독', async () => {
  const root = withVault([
    { slug: 'foo', content: '---\nkind: capability\ntitle: Foo\n---\n' },
  ]);
  try {
    const r = await run(['list', root, '--json']);
    assert.equal(r.code, 0);
    const parsed = JSON.parse(r.stdout);
    assert.equal(parsed.total, 1);
    assert.equal(parsed.nodes[0].kind, 'capability');
    assert.equal(parsed.nodes[0].slug, 'foo');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('local/frontmatter commands — reject invalid vault and value arguments before file work', async () => {
  const cases = [
    {
      args: ['list', '--kind', 'capability'],
      expectedCode: 0,
    },
    {
      args: ['list', '--kind', '-json'],
      expectedCode: 1,
      stderr: /--kind requires a value/,
    },
    {
      args: ['list', '--vault', '--json'],
      expectedCode: 1,
      stderr: /--vault requires a path/,
    },
    {
      args: ['list', '--vault', '-json'],
      expectedCode: 1,
      stderr: /--vault requires a path/,
    },
    {
      args: ['list', '--jsson'],
      expectedCode: 1,
      stderr: /unknown flag: --jsson\. Did you mean --json\?/,
    },
    {
      args: ['list', '-json'],
      expectedCode: 1,
      stderr: /unknown flag: -json\. Did you mean --json\?/,
    },
    {
      args: ['list', '--kind=capabilty'],
      expectedCode: 1,
      stderr: /--kind must be one of: project, domain, capability, element, document, vault-readme\. Received: "capabilty"\. Did you mean "capability"\?/,
    },
    {
      args: ['list', 'one', 'two'],
      expectedCode: 1,
      stderr: /too many arguments: two/,
    },
    {
      args: ['list', './not-a-vault'],
      expectedCode: 2,
      stderr: /Vault root not found:/,
    },
    {
      args: ['validate', '--vault', '--json'],
      expectedCode: 1,
      stderr: /--vault requires a path/,
    },
    {
      args: ['validate', 'one', 'two'],
      expectedCode: 1,
      stderr: /too many arguments: two/,
    },
    {
      args: ['validate', './not-a-vault'],
      expectedCode: 2,
      stderr: /Vault root not found:/,
    },
    {
      args: ['validate', '--fail-on'],
      expectedCode: 1,
      stderr: /--fail-on requires a value/,
    },
    {
      args: ['validate', '--fail-on=empty-kind,'],
      expectedCode: 1,
      stderr: /--fail-on must not contain empty CSV items/,
    },
    {
      args: ['validate', '--failon=empty-kind'],
      expectedCode: 1,
      stderr: /unknown flag: --failon=empty-kind\. Did you mean --fail-on\?/,
    },
    {
      args: ['validate', '-strict'],
      expectedCode: 1,
      stderr: /unknown flag: -strict\. Did you mean --strict\?/,
    },
    {
      args: ['find', 'auth', 'ontology', '--vault', 'docs/ontology'],
      expectedCode: 1,
      stderr: /either positional argument or --vault/,
    },
    {
      args: ['find', 'auth', 'one', 'two'],
      expectedCode: 1,
      stderr: /too many arguments: two/,
    },
    {
      args: ['find', 'auth', '--kind'],
      expectedCode: 1,
      stderr: /--kind requires a value/,
    },
    {
      args: ['find', 'auth', '--kind=capabilty'],
      expectedCode: 1,
      stderr: /--kind must be one of: project, domain, capability, element, document, vault-readme\. Received: "capabilty"\. Did you mean "capability"\?/,
    },
    {
      args: ['find', 'auth', '--knd=capability'],
      expectedCode: 1,
      stderr: /unknown flag: --knd=capability\. Did you mean --kind\?/,
    },
    {
      args: ['find', 'auth', './not-a-vault'],
      expectedCode: 2,
      stderr: /Vault root not found:/,
    },
    {
      args: ['add', 'capability', 'foo', '--title', 'Foo', '--vault'],
      expectedCode: 1,
      stderr: /--vault requires a path/,
    },
    {
      args: ['add', 'capability', 'foo', '--tite=Foo'],
      expectedCode: 1,
      stderr: /unknown flag: --tite=Foo\. Did you mean --title\?/,
    },
    {
      args: ['add', 'capabilty', 'foo', '--title', 'Foo'],
      expectedCode: 1,
      stderr: /kind must be one of: project, domain, capability, element, document\. Received: "capabilty"\. Did you mean "capability"\?/,
    },
    {
      args: ['add', 'capability', 'foo', '--title', '--vault'],
      expectedCode: 1,
      stderr: /--title requires a value/,
    },
    {
      args: ['add', 'capability', 'foo', '--title', '-vault'],
      expectedCode: 1,
      stderr: /--title requires a value/,
    },
    {
      args: ['add', 'capability', 'foo', '--title', 'Foo', '--domain', '-json'],
      expectedCode: 1,
      stderr: /--domain requires a value/,
    },
    {
      args: ['add', 'capability', 'foo', 'extra', '--title', 'Foo'],
      expectedCode: 1,
      stderr: /too many arguments: extra/,
    },
    {
      args: ['import', 'input.md', '--vault'],
      expectedCode: 1,
      stderr: /--vault requires a path/,
    },
    {
      args: ['import', 'input.md', '--kind'],
      expectedCode: 1,
      stderr: /--kind requires a value/,
    },
    {
      args: ['import', 'input.md', '--kind=capabilty'],
      expectedCode: 1,
      stderr: /--kind must be one of: project, domain, capability, element, document\. Received: "capabilty"\. Did you mean "capability"\?/,
    },
    {
      args: ['import', 'input.md', '--dryrun'],
      expectedCode: 1,
      stderr: /unknown flag: --dryrun\. Did you mean --dry-run\?/,
    },
  ];

  for (const c of cases) {
    const r = await run(c.args);
    assert.equal(r.code, c.expectedCode, `${c.args.join(' ')}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    if (c.stdout) assert.match(stripAnsi(r.stdout), c.stdout);
    if (c.stderr) assert.match(stripAnsi(r.stderr), c.stderr);
  }
});

await test('add — --body= 명시 빈 문자열은 기본 본문으로 대체하지 않음', async () => {
  const root = withVault([]);
  try {
    const empty = await run([
      'add',
      'document',
      'empty-body',
      '--title',
      'Empty Body',
      '--body=',
      '--vault',
      root,
    ]);
    assert.equal(empty.code, 0, `stdout: ${empty.stdout}\nstderr: ${empty.stderr}`);

    const padded = await run([
      'add',
      'document',
      'padded-body',
      '--title',
      'Padded Body',
      '--body',
      '  keep padding  ',
      '--vault',
      root,
    ]);
    assert.equal(padded.code, 0, `stdout: ${padded.stdout}\nstderr: ${padded.stderr}`);

    const missing = await run([
      'add',
      'document',
      'missing-body',
      '--title',
      'Missing Body',
      '--body',
    ]);
    assert.equal(missing.code, 1);
    assert.match(stripAnsi(missing.stderr), /--body requires a value/);

    const emptyText = readFileSync(join(root, 'empty-body.md'), 'utf-8');
    assert.match(emptyText, /^---[\s\S]*title: Empty Body[\s\S]*---\n\n$/);
    assert.doesNotMatch(emptyText, /# Empty Body/);

    const paddedText = readFileSync(join(root, 'padded-body.md'), 'utf-8');
    assert.match(paddedText, /---\n\n  keep padding  $/);

    const dashBody = await run([
      'add',
      'document',
      'dash-body',
      '--title',
      'Dash Body',
      '--body',
      '- keep dash',
      '--vault',
      root,
    ]);
    assert.equal(dashBody.code, 0, `stdout: ${dashBody.stdout}\nstderr: ${dashBody.stderr}`);
    assert.match(readFileSync(join(root, 'dash-body.md'), 'utf-8'), /---\n\n- keep dash$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate — clean vault: exit 0', async () => {
  // R14 — capability/element 는 domain 까지 박아야 missing-expected-field
  // warning 없이 clean. canonical kind 인식 자체를 보는 fixture 라 domain 추가.
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ndomain: domains/auth\n---\n' },
    { slug: 'domains/auth', content: '---\nkind: domain\ntitle: Auth\n---\n' },
  ]);
  try {
    const r = await run(['validate', root]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /clean ✓|issue 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate — empty kind: exit 1 + empty-kind code', async () => {
  const root = withVault([
    { slug: 'bad', content: '---\nkind:\n---\n' },
  ]);
  try {
    const r = await run(['validate', root]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /empty-kind/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate — 2+ 같은 code → "grouped by code" 요약 섹션 (R+)', async () => {
  // 같은 missing-expected-field warning 이 3 file 에서 — grouped 섹션에
  // "missing-expected-field — 3 occurrences" + 첫 3 file 노출되어야 함.
  const root = withVault([
    { slug: 'cap1', content: '---\nkind: capability\ntitle: One\n---\n' },
    { slug: 'cap2', content: '---\nkind: capability\ntitle: Two\n---\n' },
    { slug: 'cap3', content: '---\nkind: capability\ntitle: Three\n---\n' },
  ]);
  try {
    const r = await run(['validate', root]);
    // capability missing domain → warning, exit 0 (warning only)
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    // per-file detail 보존
    assert.match(clean, /cap1\.md/);
    assert.match(clean, /cap2\.md/);
    // grouped section 등장
    assert.match(clean, /grouped by code/);
    assert.match(clean, /missing-expected-field — 3 occurrences/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate — 1회짜리 code 는 grouped 섹션 안 보임 (per-file 만)', async () => {
  // 단일 issue 는 per-file 출력만으로 충분 — grouped 섹션 노이즈 회피.
  const root = withVault([
    { slug: 'bad', content: '---\nkind:\n---\n' }, // empty-kind error
  ]);
  try {
    const r = await run(['validate', root]);
    assert.equal(r.code, 1);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /empty-kind/);
    assert.doesNotMatch(clean, /grouped by code/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --list-codes — issue code 목록 출력 (R+ cycle 44)', async () => {
  const r = await run(['validate', '--list-codes']);
  assert.equal(r.code, 0);
  const clean = stripAnsi(r.stdout);
  for (const code of [
    'unclosed-frontmatter',
    'parse-zero-keys',
    'missing-kind',
    'empty-kind',
    'unknown-kind',
    'missing-expected-field',
    'non-canonical-graph-array',
    'dangling-graph-reference',
  ]) {
    assert.match(clean, new RegExp(code), `${code} 가 출력에 있어야`);
  }
  // severity 표시
  assert.match(clean, /error/i);
  assert.match(clean, /warning/i);
});

await test('validate --list-codes --json — codes 배열 머신 가독', async () => {
  const r = await run(['validate', '--list-codes', '--json']);
  assert.equal(r.code, 0);
  const data = JSON.parse(r.stdout);
  assert.ok(Array.isArray(data.codes));
  assert.ok(data.codes.length >= 6);
  for (const c of data.codes) {
    assert.equal(typeof c.code, 'string');
    assert.ok(c.severity === 'error' || c.severity === 'warning');
    assert.equal(typeof c.description, 'string');
  }
});

await test('validate --fail-on=does-not-exist — stderr 에 unknown code 경고 (R+ cycle 44)', async () => {
  const root = withVault([
    { slug: 'p', content: '---\nkind: project\ntitle: P\n---\n' },
  ]);
  try {
    const r = await run(['validate', root, '--fail-on=does-not-exist']);
    // unknown code 경고가 stderr 에 보여야 (실행은 그대로 — 매치 없으니 exit 0).
    assert.equal(r.code, 0);
    assert.match(r.stderr, /알려지지 않은 code|--list-codes/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --fail-on=empty-kind — empty-kind 있으면 exit 1 (R+ cycle 43)', async () => {
  const root = withVault([
    { slug: 'broken', content: '---\nkind:\ntitle: X\n---\n' },
    { slug: 'capWithoutDomain', content: '---\nkind: capability\ntitle: A\n---\n' },
  ]);
  try {
    const r = await run(['validate', root, '--fail-on=empty-kind']);
    assert.equal(r.code, 1);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /--fail-on=empty-kind: matched empty-kind/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --fail-on=empty-kind — empty-kind 없으면 exit 0 (warning 무관)', async () => {
  // 다른 warning (missing-expected-field) 만 있는 vault. --fail-on 이 그
  // code 가 아니므로 exit 0.
  const root = withVault([
    { slug: 'capWithoutDomain', content: '---\nkind: capability\ntitle: A\n---\n' },
  ]);
  try {
    const r = await run(['validate', root, '--fail-on=empty-kind']);
    assert.equal(r.code, 0, 'empty-kind 없으니 exit 0 (warning 무시)');
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /--fail-on=empty-kind: no match → exit 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --fail-on=code1,code2 — 다중 code (CSV) 중 하나라도 매치되면 exit 1', async () => {
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\n---\n' },
  ]);
  try {
    // missing-expected-field warning 만 있음. CSV 에 그 code 포함.
    const r = await run([
      'validate',
      root,
      '--fail-on=empty-kind,missing-expected-field',
    ]);
    assert.equal(r.code, 1);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /matched missing-expected-field/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --fail-on 이 --strict 보다 우선 — 다른 warning 은 fail 안 함', async () => {
  // --strict 면 missing-expected-field warning → exit 1.
  // --strict --fail-on=empty-kind 면 → empty-kind 만 보고 exit 0.
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\n---\n' },
  ]);
  try {
    const r = await run([
      'validate',
      root,
      '--strict',
      '--fail-on=empty-kind',
    ]);
    assert.equal(r.code, 0, '--fail-on 이 --strict 무력화');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --json --fail-on — summary.failOn 노출', async () => {
  const root = withVault([
    { slug: 'broken', content: '---\nkind:\ntitle: X\n---\n' },
  ]);
  try {
    const r = await run([
      'validate',
      root,
      '--json',
      '--fail-on=empty-kind',
    ]);
    assert.equal(r.code, 1);
    const data = JSON.parse(r.stdout);
    assert.deepEqual(data.summary.failOn, ['empty-kind']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --strict — warning 만 있어도 exit 1 (R+ cycle 42)', async () => {
  // capability 의 domain 누락 → missing-expected-field warning. default 면
  // exit 0 (errors 만 fail), --strict 면 exit 1.
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\n---\n' },
  ]);
  try {
    const noStrict = await run(['validate', root]);
    assert.equal(noStrict.code, 0, 'default: warning only → exit 0');
    const strict = await run(['validate', root, '--strict']);
    assert.equal(strict.code, 1, '--strict: warning → exit 1');
    const clean = stripAnsi(strict.stdout);
    assert.match(clean, /missing-expected-field|warning/);
    // strict 모드 표시.
    assert.match(clean, /--strict/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --strict — clean vault 면 strict 여도 exit 0', async () => {
  const root = withVault([
    { slug: 'p', content: '---\nkind: project\ntitle: P\n---\n' },
  ]);
  try {
    const r = await run(['validate', root, '--strict']);
    assert.equal(r.code, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --json --strict — summary.strict=true, warning 시 exit 1', async () => {
  const root = withVault([
    { slug: 'a', content: '---\nkind: capability\ntitle: A\n---\n' },
  ]);
  try {
    const r = await run(['validate', root, '--json', '--strict']);
    assert.equal(r.code, 1);
    const data = JSON.parse(r.stdout);
    assert.equal(data.summary.strict, true);
    assert.equal(data.summary.errorFiles, 0);
    assert.ok(data.summary.warningFiles >= 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --json — clean vault: scanned/problems[]/summary 노출, exit 0 (R+ cycle 40)', async () => {
  // capability 는 domain 누락 시 missing-expected-field warning. project 로
  // 정말 깨끗한 vault 만든다.
  const root = withVault([
    { slug: 'p', content: '---\nkind: project\ntitle: P\n---\n' },
  ]);
  try {
    const r = await run(['validate', root, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.equal(typeof data.scanned, 'number');
    assert.deepEqual(data.problems, []);
    assert.equal(data.summary.errorFiles, 0);
    assert.equal(data.summary.warningFiles, 0);
    assert.deepEqual(data.summary.byCode, {});
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --json — empty-kind error: problems[] / summary.byCode, exit 1 (R+ cycle 40)', async () => {
  const root = withVault([
    { slug: 'broken', content: '---\nkind:\ntitle: X\n---\n' },
  ]);
  try {
    const r = await run(['validate', root, '--json']);
    assert.equal(r.code, 1);
    const data = JSON.parse(r.stdout);
    assert.ok(data.problems.length >= 1);
    const p = data.problems.find((x) => /broken\.md$/.test(x.file));
    assert.ok(p, 'broken.md 가 problems 에 있어야');
    assert.ok(p.issues.some((i) => i.code === 'empty-kind'));
    assert.ok(data.summary.byCode['empty-kind']);
    assert.equal(data.summary.byCode['empty-kind'].severity, 'error');
    assert.ok(data.summary.errorFiles >= 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('validate --json — dangling graph reference warning', async () => {
  const root = withVault([
    { slug: 'a', content: '---\nkind: project\ntitle: A\ndependencies: [missing]\n---\n' },
  ]);
  try {
    const r = await run(['validate', root, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    const p = data.problems.find((x) => /a\.md$/.test(x.file));
    assert.ok(p, 'a.md 가 problems 에 있어야');
    assert.ok(p.issues.some((i) => i.code === 'dangling-graph-reference'));
    assert.equal(data.summary.byCode['dangling-graph-reference'].severity, 'warning');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add — 새 노드 + duplicate throws', async () => {
  const root = withVault([]);
  try {
    const r1 = await run([
      'add',
      'capability',
      'auth/foo',
      '--title',
      'Foo',
      '--vault',
      root,
    ]);
    assert.equal(r1.code, 0, `first add should succeed, got ${r1.code}: ${r1.stderr}`);
    // R15 — auto-prefix default on, capability → capabilities/ folder
    const written = readFileSync(join(root, 'capabilities/auth/foo.md'), 'utf-8');
    assert.match(written, /kind: capability/);
    assert.match(written, /title: Foo/);

    const r2 = await run([
      'add',
      'capability',
      'auth/foo',
      '--title',
      'Dup',
      '--vault',
      root,
    ]);
    assert.equal(r2.code, 1);
    assert.match(r2.stderr + r2.stdout, /already exists/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add — title 빈 문자열 거부', async () => {
  const root = withVault([]);
  try {
    const r = await run(['add', 'capability', 'foo', '--title', '', '--vault', root]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /--title requires a value|--title must be a non-empty string|title.*required/i);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add — slug/title/domain padded 값은 쓰기 전에 거부', async () => {
  const root = withVault([]);
  try {
    const cases = [
      {
        args: ['add', 'capability', ' foo', '--title', 'Foo', '--vault', root],
        stderr: /slug must not have leading or trailing whitespace/,
      },
      {
        args: ['add', 'capability', 'foo', '--title', ' Foo ', '--vault', root],
        stderr: /--title must not have leading or trailing whitespace/,
      },
      {
        args: ['add', 'capability', 'foo', '--title', 'Foo', '--domain', ' identity ', '--vault', root],
        stderr: /--domain must not have leading or trailing whitespace/,
      },
      {
        args: ['add', 'capability', 'foo', '--title', 'Foo', '--domain=', '--vault', root],
        stderr: /--domain must be a non-empty string/,
      },
    ];
    for (const c of cases) {
      const r = await run(c.args);
      assert.equal(r.code, 1, `${c.args.join(' ')}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
      assert.match(stripAnsi(r.stderr), c.stderr);
    }
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add — unknown kind closest-value hint before writing', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'capabilty',
      'foo',
      '--title',
      'Foo',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 1);
    assert.match(stripAnsi(r.stderr), /kind must be one of: project, domain, capability, element, document\. Received: "capabilty"\. Did you mean "capability"\?/);
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add --auto-prefix — kind 별 folder 자동 (R12 #37)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'capability',
      'foo',
      '--title',
      'Foo',
      '--auto-prefix',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    const written = readFileSync(join(root, 'capabilities/foo.md'), 'utf-8');
    assert.match(written, /slug: capabilities\/foo/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add (default) — kind→folder 자동 (R15 default on)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'capability',
      'bar',
      '--title',
      'Bar',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    // R15 — default auto-prefix → capabilities/bar.md
    const written = readFileSync(join(root, 'capabilities/bar.md'), 'utf-8');
    assert.match(written, /slug: capabilities\/bar/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add --raw-slug — auto-prefix 명시 opt-out (R15)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'capability',
      'baz',
      '--title',
      'Baz',
      '--raw-slug',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    // --raw-slug 으로 root 에 직접
    const written = readFileSync(join(root, 'baz.md'), 'utf-8');
    assert.match(written, /slug: baz/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add element path-style → cyan hint advisory (post-Paravel dogfood)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'element',
      'src/features/auth',
      '--title',
      'Auth module',
      '--domain',
      'identity',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    // 4단계 nested 작성 자체는 valid
    const written = readFileSync(
      join(root, 'elements/src/features/auth.md'),
      'utf-8',
    );
    assert.match(written, /kind: element/);
    // stderr 에 path-style hint
    assert.match(r.stderr, /path-style/);
    assert.match(r.stderr, /4 levels/);
    assert.match(r.stderr, /--raw-slug/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add element flat slug → hint 없음 (정상 case)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'element',
      'zod',
      '--title',
      'Zod library',
      '--domain',
      'identity',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.stderr, /path-style/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('add capability path slug → hint 없음 (element 만 적용)', async () => {
  const root = withVault([]);
  try {
    const r = await run([
      'add',
      'capability',
      'auth/login',
      '--title',
      'Login',
      '--domain',
      'identity',
      '--vault',
      root,
    ]);
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.stderr, /path-style/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('find — title 부분매칭', async () => {
  const root = withVault([
    {
      slug: 'auth-token',
      content: '---\nkind: capability\ntitle: Auth Token Issue\n---\n',
    },
    { slug: 'other', content: '---\nkind: domain\ntitle: Other\n---\n' },
  ]);
  try {
    const r = await run(['find', 'token', root]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /auth-token/);
    assert.match(clean, /1 매칭/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('find — 매칭 0 도 exit 0 (정상)', async () => {
  const root = withVault([
    { slug: 'foo', content: '---\nkind: capability\ntitle: Foo\n---\n' },
  ]);
  try {
    const r = await run(['find', 'xyz999', root]);
    assert.equal(r.code, 0);
    assert.match(r.stdout, /매칭 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('find --kind 필터', async () => {
  const root = withVault([
    { slug: 'foo-cap', content: '---\nkind: capability\ntitle: foo cap\n---\n' },
    { slug: 'foo-dom', content: '---\nkind: domain\ntitle: foo dom\n---\n' },
  ]);
  try {
    const r = await run(['find', 'foo', root, '--kind=capability']);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /foo-cap/);
    assert.doesNotMatch(clean, /foo-dom/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

// ── R14 import 명령 통합 ─────────────────────────────────────────────────

function withTmpDir() {
  return mkdtempSync(join(tmpdir(), 'cli-import-src-'));
}

await test('import — input frontmatter 의 kind 사용, schema arrayDefaults 적용', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'token-issue.md');
    writeFileSync(
      file,
      '---\nkind: capability\ntitle: Token issue\ndomain: domains/auth\n---\n\n# Token issue\n\nbody.\n',
      'utf-8',
    );
    const r = await run(['import', file, '--vault', vault]);
    assert.equal(r.code, 0);
    // R15 — auto-prefix default on, capability → capabilities/ folder
    const written = readFileSync(join(vault, 'capabilities/token-issue.md'), 'utf-8');
    assert.match(written, /kind: capability/);
    assert.match(written, /domain: domains\/auth/);
    // schema arrayDefaults — capability 는 elements: [] 자동 추가.
    assert.match(written, /elements:/);
    // body 보존.
    assert.match(written, /body\./);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import — frontmatter kind 없으면 --kind fallback', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'foo.md');
    writeFileSync(file, '# Foo\n\nbare markdown without frontmatter.\n', 'utf-8');
    const r = await run([
      'import',
      file,
      '--vault',
      vault,
      '--kind',
      'capability',
    ]);
    assert.equal(r.code, 0);
    // R15 — auto-prefix default on, capability → capabilities/ folder
    const written = readFileSync(join(vault, 'capabilities/foo.md'), 'utf-8');
    assert.match(written, /kind: capability/);
    // title 은 첫 H1 'Foo' 추출.
    assert.match(written, /title: Foo/);
    // body 보존.
    assert.match(written, /bare markdown/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import — kindless skip (kind 도 --kind 도 없음)', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'note.md');
    writeFileSync(file, '# just a note\n', 'utf-8');
    const r = await run(['import', file, '--vault', vault]);
    // 1 입력 모두 kindless → exit 1, 메시지에 kindless 명시.
    assert.equal(r.code, 1);
    const clean = stripAnsi(r.stderr + r.stdout);
    assert.match(clean, /kindless|no kind/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import — invalid frontmatter kind reports closest-value hint', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'typo.md');
    writeFileSync(file, '---\nkind: capabilty\ntitle: Typo\n---\n\n# Typo\n', 'utf-8');
    const r = await run(['import', file, '--vault', vault]);
    assert.equal(r.code, 1);
    assert.match(stripAnsi(r.stderr), /kind must be one of: project, domain, capability, element, document\. Received: "capabilty"\. Did you mean "capability"\?/);
    assert.equal(existsSyncTest(join(vault, 'capabilities/typo.md')), false);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import --auto-prefix — kind→folder 자동', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'login.md');
    writeFileSync(
      file,
      '---\nkind: capability\ntitle: Login\ndomain: domains/auth\n---\n\nx\n',
      'utf-8',
    );
    const r = await run([
      'import',
      file,
      '--vault',
      vault,
      '--auto-prefix',
    ]);
    assert.equal(r.code, 0);
    const written = readFileSync(join(vault, 'capabilities/login.md'), 'utf-8');
    assert.match(written, /slug: capabilities\/login/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import — slug 충돌 시 default skip, --rename 시 -2 회피', async () => {
  // 같은 slug 의 .md 가 vault 에 이미 있는 상태로 시작.
  // R15 — auto-prefix default on, vault seed slug 도 capabilities/ 안.
  const vault = withVault([
    {
      slug: 'capabilities/foo',
      content:
        '---\nkind: capability\nslug: capabilities/foo\ntitle: Existing\ndomain: domains/auth\n---\n',
    },
  ]);
  const src = withTmpDir();
  try {
    const file = join(src, 'foo.md');
    writeFileSync(
      file,
      '---\nkind: capability\ntitle: Imported\ndomain: domains/auth\n---\n',
      'utf-8',
    );

    // default — auto-prefix on, slug 가 capabilities/foo 로 충돌.
    const r1 = await run(['import', file, '--vault', vault]);
    assert.equal(r1.code, 1);
    const c1 = stripAnsi(r1.stderr + r1.stdout);
    assert.match(c1, /conflict|already exists/);

    // --rename — capabilities/foo-2.md 로 import 성공
    const r2 = await run(['import', file, '--vault', vault, '--rename']);
    assert.equal(r2.code, 0);
    const written = readFileSync(
      join(vault, 'capabilities/foo-2.md'),
      'utf-8',
    );
    assert.match(written, /slug: capabilities\/foo-2/);
    assert.match(written, /title: Imported/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import --dry-run — 디스크 변경 0', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    const file = join(src, 'plan.md');
    writeFileSync(
      file,
      '---\nkind: domain\ntitle: Plan\n---\n',
      'utf-8',
    );
    const r = await run(['import', file, '--vault', vault, '--dry-run']);
    assert.equal(r.code, 0);
    // vault 안에 파일 안 만들어졌어야.
    assert.equal(
      existsSyncTest(join(vault, 'plan.md')),
      false,
      'dry-run should not write',
    );
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /would import|plan/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

await test('import — 디렉토리 재귀 walk', async () => {
  const vault = withVault([]);
  const src = withTmpDir();
  try {
    mkdirSync(join(src, 'sub'), { recursive: true });
    writeFileSync(
      join(src, 'a.md'),
      '---\nkind: domain\ntitle: A\n---\n',
      'utf-8',
    );
    writeFileSync(
      join(src, 'sub', 'b.md'),
      '---\nkind: domain\ntitle: B\n---\n',
      'utf-8',
    );
    const r = await run(['import', src, '--vault', vault]);
    assert.equal(r.code, 0);
    // R15 — auto-prefix default on, domain → domains/ folder
    assert.equal(existsSyncTest(join(vault, 'domains/a.md')), true);
    assert.equal(existsSyncTest(join(vault, 'domains/b.md')), true);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(src, { recursive: true, force: true });
  }
});

function existsSyncTest(p) {
  try {
    readFileSync(p);
    return true;
  } catch {
    return false;
  }
}

// ── R15 graph-level commands (backlinks/query/rename/merge/delete) ───────
//
// 이 명령들은 mcp child_process spawn — relative path fallback (../../mcp/
// src/index.js) 으로 monorepo dev 환경에서 작동.

async function buildGraphFixture() {
  const root = withVault([
    {
      slug: 'capabilities/foo',
      content:
        '---\nkind: capability\nslug: capabilities/foo\ntitle: Foo\ndomain: domains/auth\nelements: [src/foo.ts]\n---\n\n# Foo\n',
    },
    {
      slug: 'capabilities/bar',
      content:
        '---\nkind: capability\nslug: capabilities/bar\ntitle: Bar\ndomain: domains/auth\nrelates: [capabilities/foo]\n---\n\n# Bar\n',
    },
    {
      slug: 'domains/auth',
      content:
        '---\nkind: domain\nslug: domains/auth\ntitle: Auth\ncapabilities: [capabilities/foo, capabilities/bar]\n---\n\n# Auth\n',
    },
  ]);
  return root;
}

function buildCycleFixture() {
  return withVault([
    {
      slug: 'capabilities/a',
      content:
        '---\nkind: capability\nslug: capabilities/a\ntitle: A\ndomain: domains/auth\ndependencies: [capabilities/b]\n---\n\n# A\n',
    },
    {
      slug: 'capabilities/b',
      content:
        '---\nkind: capability\nslug: capabilities/b\ntitle: B\ndomain: domains/auth\ndependencies: [capabilities/a]\n---\n\n# B\n',
    },
    {
      slug: 'domains/auth',
      content:
        '---\nkind: domain\nslug: domains/auth\ntitle: Auth\ncapabilities: [capabilities/a, capabilities/b]\n---\n\n# Auth\n',
    },
  ]);
}

await test('backlinks — capabilities/foo 의 backlinks (bar relates + auth capabilities)', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['backlinks', 'capabilities/foo', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /backlink/);
    assert.match(clean, /capabilities\/bar\s+— Bar/);
    assert.match(clean, /domains\/auth\s+— Auth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('backlinks --json — JSON 응답 파싱', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['backlinks', 'capabilities/foo', root, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(Array.isArray(data.matches));
    assert.ok(data.matches.length >= 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('backlinks --json — fails closed on malformed find_backlinks payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-backlinks-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { target: 'capabilities/foo', total: 1, matches: [{ slug: 'domains/auth', kind: 'domain', title: 'Auth', matchedKeys: [''] }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['backlinks', 'capabilities/foo', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /find_backlinks matches\[0\] has an invalid backlink shape/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('path — capabilities/bar → capabilities/foo (1 hop, via relates)', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['path', 'capabilities/bar', 'capabilities/foo', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /1 hop/);
    assert.match(clean, /capabilities\/bar — Bar/);
    assert.match(clean, /capabilities\/foo — Foo/);
    // bar.relates 가 foo 를 가리키므로 via=relates 로 노출
    assert.match(clean, /relates/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('path --json — edges[] 포함된 raw 응답 파싱', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'path',
      'capabilities/bar',
      'capabilities/foo',
      root,
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(Array.isArray(data.hops), 'hops 배열');
    assert.ok(Array.isArray(data.edges), 'edges 배열');
    assert.ok(Array.isArray(data.nodes), 'nodes 배열');
    assert.equal(data.edges.length, data.hops.length - 1, 'edges 길이는 hops - 1');
    assert.equal(data.nodes.length, data.hops.length, 'nodes 길이는 hops 와 같다');
    assert.equal(data.found, true);
    assert.equal(data.edges[0].via, 'relates');
    assert.deepEqual(
      data.nodes.map((node) => node.title),
      ['Bar', 'Foo'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('path — same slug → 0 hops trivial', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['path', 'capabilities/foo', 'capabilities/foo', root]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /capabilities\/foo — Foo/);
    assert.match(clean, /same slug|0 hops/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('path --json — disconnected nodes exit non-zero', async () => {
  const root = withVault([
    {
      slug: 'capabilities/a',
      content: '---\nkind: capability\nslug: capabilities/a\ntitle: A\n---\n\n# A\n',
    },
    {
      slug: 'capabilities/b',
      content: '---\nkind: capability\nslug: capabilities/b\ntitle: B\n---\n\n# B\n',
    },
  ]);
  try {
    const r = await run(['path', 'capabilities/a', 'capabilities/b', root, '--json']);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.found, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('path --json — fails closed on malformed find_path payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-path-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { found: true, hopCount: 1, hops: ['a', 'b'], edges: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['path', 'a', 'b', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /find_path response edges length must match hops length/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('path — 두 인자 누락 시 usage + exit 1', async () => {
  const r = await run(['path', 'only-one']);
  assert.equal(r.code, 1);
  assert.match(stripAnsi(r.stderr), /from.*to.*required|both/);
});

await test('read-only graph commands — reject ambiguous vault arguments before MCP call', async () => {
  const cases = [
    {
      args: ['backlinks', 'capabilities/foo', '--vault'],
      pattern: /--vault requires a path/,
    },
    {
      args: ['backlinks', 'capabilities/foo', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['query', 'kind=capability', 'one', 'two'],
      pattern: /too many arguments: two/,
    },
    {
      args: ['path', 'capabilities/foo', 'capabilities/bar', '--vault='],
      pattern: /--vault requires a path/,
    },
    {
      args: ['path', 'capabilities/foo', 'capabilities/bar', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['orphans', '--vault', '--json'],
      pattern: /--vault requires a path/,
    },
    {
      args: ['node', 'capabilities/foo', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['node', 'capabilities/foo', '--jsson'],
      pattern: /unknown flag: --jsson\. Did you mean --json\?/,
    },
    {
      args: ['node', 'capabilities/foo', '--lmit=1'],
      pattern: /unknown flag: --lmit=1\. Did you mean --limit\?/,
    },
    {
      args: ['node', 'capabilities/foo', '--limit=0'],
      pattern: /--limit must be a positive integer/,
    },
    {
      args: ['node', 'capabilities/foo', '--limit=501'],
      pattern: /--limit must be <= 500/,
    },
    {
      args: ['node', 'capabilities/foo', '--types'],
      pattern: /--types requires a value/,
    },
    {
      args: ['node', 'capabilities/foo', '--types=dependencies,'],
      pattern: /--types must not contain empty CSV items/,
    },
    {
      args: ['node', 'capabilities/foo', '--types=depend_on'],
      pattern: /--types items must be one of:[\s\S]*Received: "depend_on"\.[\s\S]*Did you mean "depends_on"\?/,
    },
    {
      args: ['node', 'capabilities/foo', '--no-extenal'],
      pattern: /unknown flag: --no-extenal\. Did you mean --no-external\?/,
    },
    {
      args: ['node', 'capabilities/foo', '-json'],
      pattern: /unknown flag: -json\. Did you mean --json\?/,
    },
    {
      args: ['overview', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['hubs', 'one', 'two'],
      pattern: /too many arguments: two/,
    },
    {
      args: ['health', '--vault='],
      pattern: /--vault requires a path/,
    },
    {
      args: ['health', '--jsson'],
      pattern: /unknown flag: --jsson\. Did you mean --json\?/,
    },
    {
      args: ['health', '-json'],
      pattern: /unknown flag: -json\. Did you mean --json\?/,
    },
    {
      args: ['cycles', '--vault', '--json'],
      pattern: /--vault requires a path/,
    },
    {
      args: ['blast-radius', 'capabilities/foo', 'one', 'two'],
      pattern: /too many arguments: two/,
    },
    {
      args: ['workspace-brief', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['workspace-brief', '--jsson'],
      pattern: /unknown flag: --jsson\. Did you mean --json\?/,
    },
    {
      args: ['workspace-brief', '-json'],
      pattern: /unknown flag: -json\. Did you mean --json\?/,
    },
  ];

  for (const c of cases) {
    const r = await run(c.args);
    assert.equal(r.code, 1, `${c.args.join(' ')}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(stripAnsi(r.stderr), c.pattern);
  }
});

await test('graph MCP calls — reject invalid OMOT_MCP_PATH overrides before spawning node', async () => {
  const missing = await run(['overview', 'docs/ontology'], {
    env: { OMOT_MCP_PATH: join(tmpdir(), 'missing-omot-mcp-entry.js') },
  });
  assert.equal(missing.code, 2);
  assert.match(stripAnsi(missing.stderr), /OMOT_MCP_PATH does not exist/);
  assert.doesNotMatch(stripAnsi(missing.stderr), /vault overview|MODULE_NOT_FOUND/);

  const directory = await run(['overview', 'docs/ontology'], {
    env: { OMOT_MCP_PATH: tmpdir() },
  });
  assert.equal(directory.code, 2);
  assert.match(stripAnsi(directory.stderr), /OMOT_MCP_PATH is not a file/);
  assert.doesNotMatch(stripAnsi(directory.stderr), /vault overview|MODULE_NOT_FOUND/);
});

await test('graph MCP calls — label spawned MCP exit failures with tool and vault context', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-exit-mcp.mjs');
  writeFileSync(
    fakeMcp,
    "console.error('fake mcp boom');\nprocess.exit(7);\n",
    'utf-8',
  );
  try {
    const r = await run(['overview', root], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const stderr = stripAnsi(r.stderr);
    assert.match(stderr, /mcp exited code 7 while calling query_ontology/);
    assert.ok(stderr.includes(`vault ${root}`), stderr);
    assert.match(stderr, /Check OMOT_MCP_PATH/);
    assert.match(stderr, /OMOT_CLI_MCP_TIMEOUT_MS=N/);
    assert.match(stderr, /fake mcp boom/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('graph MCP calls — label missing tools/call responses with tool and vault context', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-missing-response-mcp.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['overview', root], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const stderr = stripAnsi(r.stderr);
    assert.match(stderr, /mcp response missing tools\/call result for query_ontology/);
    assert.ok(stderr.includes(`vault ${root}`), stderr);
    assert.match(stderr, /Check OMOT_MCP_PATH/);
    assert.match(stderr, /OMOT_CLI_MCP_TIMEOUT_MS=N/);
    assert.match(stderr, /"id":1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('graph MCP calls — label JSON-RPC tool errors with code and data context', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-json-rpc-error-mcp.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, error: { code: -32602, message: 'Invalid params', data: { field: 'operation', received: 'overveiw' } } }));",
      "    rl.close();",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['overview', root], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const stderr = stripAnsi(r.stderr);
    assert.match(stderr, /mcp tool error \(query_ontology\): code=-32602 Invalid params/);
    assert.match(stderr, /"field":"operation"/);
    assert.match(stderr, /"received":"overveiw"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('graph MCP calls — reject invalid explicit vault roots before spawning MCP', async () => {
  const missing = await run(['overview', './not-a-vault']);
  assert.equal(missing.code, 2);
  assert.match(stripAnsi(missing.stderr), /Vault root not found:/);
  assert.doesNotMatch(stripAnsi(missing.stderr), /mcp exited|vault root 검증 실패/);

  const dir = mkdtempSync(join(tmpdir(), 'cli-vault-root-'));
  const file = join(dir, 'not-a-vault.md');
  try {
    writeFileSync(file, 'not a directory\n');
    const notDirectory = await run(['overview', file]);
    assert.equal(notDirectory.code, 2);
    assert.match(stripAnsi(notDirectory.stderr), /Vault root is not a directory:/);
    assert.doesNotMatch(stripAnsi(notDirectory.stderr), /mcp exited|vault root 검증 실패/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

await test('graph diagnostic commands — reject invalid option values before MCP call', async () => {
  const cases = [
    {
      args: ['query', 'kind=capability', '--limit', '--json'],
      pattern: /--limit requires a value/,
    },
    {
      args: ['query', 'kind=capability', '--limit=501'],
      pattern: /--limit must be <= 500/,
    },
    {
      args: ['query', 'kind=capability', '--lmit=1'],
      pattern: /unknown flag: --lmit=1\. Did you mean --limit\?/,
    },
    {
      args: ['query', 'kind=capability', '--lmit'],
      pattern: /unknown flag: --lmit\. Did you mean --limit\?/,
    },
    {
      args: ['query', 'kind=capability', '-limit=1'],
      pattern: /unknown flag: -limit=1\. Did you mean --limit\?/,
    },
    {
      args: ['backlinks', 'capabilities/foo', '--jsson'],
      pattern: /unknown flag: --jsson\. Did you mean --json\?/,
    },
    {
      args: ['overview', '--limit=0'],
      pattern: /--limit must be a positive integer/,
    },
    {
      args: ['overview', '--limit=501'],
      pattern: /--limit must be <= 500/,
    },
    {
      args: ['overview', '--lmit=1'],
      pattern: /unknown flag: --lmit=1\. Did you mean --limit\?/,
    },
    {
      args: ['hubs', '--limit=abc'],
      pattern: /--limit must be a positive integer/,
    },
    {
      args: ['hubs', '--limit=501'],
      pattern: /--limit must be <= 500/,
    },
    {
      args: ['hubs', '--lmit=1'],
      pattern: /unknown flag: --lmit=1\. Did you mean --limit\?/,
    },
    {
      args: ['path', 'capabilities/foo', 'capabilities/bar', '--max-hops=2x'],
      pattern: /--max-hops must be a non-negative integer/,
    },
    {
      args: ['path', 'capabilities/foo', 'capabilities/bar', '--max-hops=21'],
      pattern: /--max-hops must be <= 20/,
    },
    {
      args: ['path', 'capabilities/foo', 'capabilities/bar', '--max-hop=2'],
      pattern: /unknown flag: --max-hop=2\. Did you mean --max-hops\?/,
    },
    {
      args: ['path', 'capabilities/foo', 'capabilities/bar', '-max-hops=2'],
      pattern: /unknown flag: -max-hops=2\. Did you mean --max-hops\?/,
    },
    {
      args: ['cycles', '--max-hops', '--json'],
      pattern: /--max-hops requires a value/,
    },
    {
      args: ['cycles', '--max-hops=21'],
      pattern: /--max-hops must be <= 20/,
    },
    {
      args: ['cycles', '--max-hop=2'],
      pattern: /unknown flag: --max-hop=2\. Did you mean --max-hops\?/,
    },
    {
      args: ['blast-radius', 'capabilities/foo', '--depth=2x'],
      pattern: /--depth must be a non-negative integer/,
    },
    {
      args: ['blast-radius', 'capabilities/foo', '--depth=21'],
      pattern: /--depth must be <= 20/,
    },
    {
      args: ['blast-radius', 'capabilities/foo', '--direction', '--json'],
      pattern: /--direction requires a value/,
    },
    {
      args: ['blast-radius', 'capabilities/foo', '--direction=sideways'],
      pattern: /--direction must be one of: incoming, outgoing, both\. Received: "sideways"\./,
    },
    {
      args: ['blast-radius', 'capabilities/foo', '--direction=incomng'],
      pattern: /--direction must be one of: incoming, outgoing, both\. Received: "incomng"\. Did you mean "incoming"\?/,
    },
    {
      args: ['blast-radius', 'capabilities/foo', '--directon=incoming'],
      pattern: /unknown flag: --directon=incoming\. Did you mean --direction\?/,
    },
    {
      args: ['orphans', '--kind'],
      pattern: /--kind requires a value/,
    },
    {
      args: ['orphans', '--kind=capabilty'],
      pattern: /--kind must be one of: project, domain, capability, element, document, vault-readme\. Received: "capabilty"\. Did you mean "capability"\?/,
    },
    {
      args: ['orphans', '--exclude-kinds='],
      pattern: /--exclude-kinds requires a value/,
    },
    {
      args: ['orphans', '--exclude-kinds=project,'],
      pattern: /--exclude-kinds must not contain empty CSV items/,
    },
    {
      args: ['orphans', '--exclude-kinds=project,capabilty'],
      pattern: /--exclude-kinds items must be one of: project, domain, capability, element, document, vault-readme\. Received: "capabilty"\. Did you mean "capability"\?/,
    },
    {
      args: ['orphans', '--exlude-kinds=domain'],
      pattern: /unknown flag: --exlude-kinds=domain\. Did you mean --exclude-kinds\?/,
    },
    {
      args: ['similar', 'auth', '--limit=0'],
      pattern: /--limit must be a positive integer/,
    },
    {
      args: ['similar', 'auth', '--limit=501'],
      pattern: /--limit must be <= 500/,
    },
    {
      args: ['similar', 'auth', '--kind'],
      pattern: /--kind requires a value/,
    },
    {
      args: ['similar', 'auth', '--kind=capabilty'],
      pattern: /--kind must be one of: project, domain, capability, element, document\. Received: "capabilty"\. Did you mean "capability"\?/,
    },
    {
      args: ['similar', '--slug'],
      pattern: /--slug requires a value/,
    },
    {
      args: ['similar', 'auth', '--lmit=1'],
      pattern: /unknown flag: --lmit=1\. Did you mean --limit\?/,
    },
    {
      args: ['similar', 'auth', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
  ];

  for (const c of cases) {
    const r = await run(c.args);
    assert.equal(r.code, 1, `${c.args.join(' ')}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(stripAnsi(r.stderr), c.pattern);
  }
});

await test('orphans — graph fixture 에서 referenced 노드 0건 보고', async () => {
  // buildGraphFixture: foo (referenced by bar.relates + auth.capabilities),
  // bar (referenced by 0 — orphan? but auth domain.capabilities 가 references bar),
  // auth (referenced by foo/bar domain: inline parent).
  // 정확한 그래프: foo, bar, auth 모두 referenced.
  const root = await buildGraphFixture();
  try {
    const r = await run(['orphans', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /vault clean ✓|orphan 0/);
    // domain / capability 모두 referenced — orphan 아님
    assert.doesNotMatch(clean, /domains\/auth/);
    assert.doesNotMatch(clean, /capabilities\/foo/);
    assert.doesNotMatch(clean, /capabilities\/bar/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('orphans --json — JSON 응답 파싱', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['orphans', root, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(Array.isArray(data.orphans));
    assert.equal(data.orphans.some((o) => o.slug === 'domains/auth'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('orphans --json — fails closed on malformed find_orphans payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-orphans-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { total: 1, orphans: [{ slug: 'capabilities/foo', kind: 'capability' }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['orphans', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /find_orphans orphans\[0\] has an invalid orphan shape/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('orphans --kind capability — 필터 적용', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['orphans', root, '--kind', 'capability']);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    // capability 인 orphan 0 (foo, bar 둘 다 referenced)
    assert.match(clean, /vault clean ✓|orphan 0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('query — kind=capability AND has(elements)', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'query',
      'kind=capability AND has(elements)',
      root,
    ]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    // Only foo has elements; bar has relates only.
    assert.match(clean, /showing 1\/1 match\(es\)/);
    assert.match(clean, /parsed:.*kind = capability.*has\(elements\)/);
    assert.match(clean, /capabilities\/foo/);
    assert.doesNotMatch(clean, /capabilities\/bar.*\n/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('query --json — fails closed on malformed query_concepts payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-query-concepts-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { filter: 'kind=capability', total: 1, matches: [{ slug: 'capabilities/foo', kind: 'capability' }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['query', 'kind=capability', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /query_concepts matches\[0\] has an invalid query-result shape/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('overview — graph fixture 의 counts + 허브 정확', async () => {
  // buildGraphFixture: 3 노드 (capabilities/foo, capabilities/bar, domains/auth)
  const root = await buildGraphFixture();
  try {
    const r = await run(['overview', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    // header — 3 노드 (vault-readme 없음)
    assert.match(clean, /3 노드/);
    // KIND 분포 — capability 2 / domain 1
    assert.match(clean, /capability\s+2/);
    assert.match(clean, /domain\s+1/);
    // 허브 — degree 가 가장 큰 domains/auth 가 top
    assert.match(clean, /domains\/auth/);
    assert.match(clean, /domains\/auth\s+— Auth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('overview --json — JSON 응답 graph/byKind/hubs 키 노출', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['overview', root, '--json']);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'overview');
    assert.ok(data.graph);
    assert.equal(data.graph.nodes, 3);
    assert.ok(data.byKind);
    assert.equal(data.byKind.capability, 2);
    assert.equal(data.byKind.domain, 1);
    assert.ok(Array.isArray(data.hubs));
    // domains/auth 가 hubs 안에 있어야 함 (degree 가장 큼)
    assert.ok(data.hubs.some((h) => h.slug === 'domains/auth'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('overview/hubs/blast-radius --json — fail closed on malformed graph query payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-graph-query-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const operation = msg.params.arguments.operation;",
      "    const payload = operation === 'overview'",
      "      ? { operation: 'overview', graph: { nodes: '2', edges: 1 }, byKind: {}, byDomain: {}, byRelation: {}, hubs: [] }",
      "      : operation === 'centrality'",
      "        ? { operation: 'centrality', rankings: { pageRank: [{}], bridges: [], authorities: [], hubs: [] } }",
      "        : { operation: 'blast_radius', center: 'domains/auth', risk: 'low', summary: { affectedNodes: 1, affectedEdges: '0', affectedKinds: 1, affectedDomains: 1, crossDomainEdges: 0 }, byKind: {}, byDomain: {}, nodes: { total: 0, limited: false, rows: [] }, edges: { total: 0, limited: false, rows: [] } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const overview = await run(['overview', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(overview.code, 2, `stdout: ${overview.stdout}\nstderr: ${overview.stderr}`);
    assert.equal(overview.stdout, '');
    assert.match(stripAnsi(overview.stderr), /overview graph\.nodes must be a non-negative integer/);

    const hubs = await run(['hubs', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(hubs.code, 2, `stdout: ${hubs.stdout}\nstderr: ${hubs.stderr}`);
    assert.equal(hubs.stdout, '');
    assert.match(stripAnsi(hubs.stderr), /centrality rankings\.pageRank\[0\] has an invalid ranking shape/);

    const blast = await run(['blast-radius', 'domains/auth', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(blast.code, 2, `stdout: ${blast.stdout}\nstderr: ${blast.stderr}`);
    assert.equal(blast.stdout, '');
    assert.match(stripAnsi(blast.stderr), /blast_radius summary\.affectedEdges must be a non-negative integer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('blast-radius — affected node rows include node titles for scanability', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['blast-radius', 'capabilities/foo', root, '--depth=1']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /affected nodes/);
    assert.match(clean, /capabilities\/bar\s+— Bar/);
    assert.match(clean, /domains\/auth\s+— Auth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('overview --limit 3 — 허브 N 만 출력', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['overview', root, '--limit', '3']);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    // 허브 라인 (rank prefix 1-3 만) — 4+ 가 없어야
    assert.match(clean, /허브 노드.*상위 3/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('hubs — human rankings include node titles for scanability', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['hubs', root, '--limit=2']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /PageRank/);
    assert.match(clean, /domains\/auth\s+— Auth/);
    assert.match(clean, /capabilities\/foo\s+— Foo/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('workspace-brief — fail severity nextActions make the CLI fail', async () => {
  const root = buildCycleFixture();
  try {
    const text = await run(['workspace-brief', root]);
    assert.equal(text.code, 1, `stdout: ${text.stdout}\nstderr: ${text.stderr}`);
    assert.match(text.stdout, /\x1b\[33mneeds_attention\x1b\[0m/);

    const r = await run(['workspace-brief', root, '--json']);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.status, 'needs_attention');
    assert.equal(
      data.nextActions.some((action) => action.severity === 'fail' && action.id === 'dependency_cycles'),
      true,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('workspace-brief — prints health check coverage', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['workspace-brief', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(r.stdout, /\x1b\[32mhealthy\x1b\[0m/);
    assert.match(clean, /capabilities\/foo\s+— Foo/);
    assert.match(clean, /HEALTH CHECKS/);
    assert.match(clean, /compile_issues:pass:0/);
    assert.match(clean, /components:pass:1/);
    assert.match(clean, /GROWTH/);
    assert.match(clean, /actions:1/);
    assert.match(clean, /external:1/);
    assert.match(clean, /ignoredExternal:0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('workspace-brief — labels project_scope contained counts clearly', async () => {
  const root = withVault([
    {
      slug: 'project',
      content: '---\nkind: project\nslug: project\ntitle: Project\ncontains: [domains/auth]\n---\n\n# Project\n',
    },
    {
      slug: 'domains/auth',
      content: '---\nkind: domain\nslug: domains/auth\ntitle: Auth\n---\n\n# Auth\n',
    },
  ]);
  try {
    const r = await run(['workspace-brief', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /PROJECT별 포함 노드 수 \(project_scope\)/);
    assert.match(clean, /Project\s+2 노드/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('workspace-brief --json — forwards focused diagnosis tuning flags', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'workspace-brief',
      root,
      '--json',
      '--component-types=dependencies',
      '--dependency-types',
      'dependencies',
      '--component-limit=2',
      '--node-limit=1',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'workspace_brief');
    assert.equal(data.status, 'healthy');
    const components = data.health.checks.find((check) => check.id === 'components');
    assert.equal(components.status, 'info');
    assert.equal(components.count, 3);
    assert.match(components.message, /scoped ontology graph/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('workspace-brief --help — documents health and growth output', async () => {
  const r = await run(['workspace-brief', '--help']);
  assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const clean = stripAnsi(r.stdout);
  assert.match(clean, /Use --json for repeatable first-contact snapshots such as pnpm dogfood:brief/);
  assert.match(clean, /Use pnpm dogfood:health first when you only need the fail-closed health gate/);
  assert.match(clean, /Use pnpm dogfood:status for the cheap human-readable health \+ workspace-brief pair/);
  assert.match(clean, /Fail-severity nextActions or failing health checks exit non-zero for shell gates/);
  assert.match(clean, /project_scope 포함 노드 요약/);
  assert.match(clean, /HEALTH CHECKS id:status:count/);
  assert.match(clean, /GROWTH actions\/relations\/dangling\/external\/ignoredExternal counts/);
  assert.match(clean, /--dependency-types A,B/);
  assert.match(clean, /--component-types A,B/);
  assert.match(clean, /Tuning flags forward to query_ontology workspace_brief/);
});

await test('maintenance --json — exposes maintenance_plan work queue', async () => {
  const root = buildCycleFixture();
  try {
    const r = await run(['maintenance', root, '--json', '--limit', '2']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'maintenance_plan');
    assert.equal(data.sideEffect, false);
    assert.equal(data.summary.dependencyCycles, 1);
    assert.equal(data.cursor.found, true);
    assert.ok(Array.isArray(data.actions));
    assert.equal(data.actions.some((action) => action.kind === 'break_dependency_cycle'), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('maintenance --json — fails closed on malformed maintenance_plan payloads', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-maintenance-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { operation: 'maintenance_plan', summary: { totalActions: 1, filteredActions: 1, remainingActions: '1', executableActions: 0, reviewActions: 1 }, cursor: { afterActionId: null, found: true, reason: null, startIndex: 0, nextAfterActionId: null, hasMore: false }, byPhase: {}, bySeverity: {}, byKind: {}, nextExecutableAction: null, nextReviewAction: null, actions: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['maintenance', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /maintenance_plan summary\.remainingActions must be a non-negative integer/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('maintenance — supports cursor and enum filter flags', async () => {
  const root = buildCycleFixture();
  try {
    const filtered = await run(['maintenance', root, '--phases', 'repair', '--severities', 'fail', '--kinds', 'break_dependency_cycle', '--limit=1']);
    assert.equal(filtered.code, 0, `stdout: ${filtered.stdout}\nstderr: ${filtered.stderr}`);
    const clean = stripAnsi(filtered.stdout);
    assert.match(clean, /maintenance plan/);
    assert.match(clean, /summary: compileIssues:0, cycles:1/);
    assert.match(clean, /ignoredExternal:0/);
    assert.match(clean, /break_dependency_cycle/);
    assert.match(clean, /filters: phases=repair · severities=fail · kinds=break_dependency_cycle/);
    assert.match(clean, /buckets: phase repair:1 · severity fail:1 · kind break_dependency_cycle:1/);
    assert.match(clean, /next review: maint_/);

    const missingCursor = await run(['maintenance', root, '--after-action-id', 'missing-action', '--json']);
    assert.equal(missingCursor.code, 0, `stdout: ${missingCursor.stdout}\nstderr: ${missingCursor.stderr}`);
    const data = JSON.parse(missingCursor.stdout);
    assert.equal(data.cursor.found, false);
    assert.equal(data.cursor.nextAfterActionId, null);
    assert.equal(data.cursor.hasMore, false);
    assert.equal(data.actions.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('maintenance --help — documents summary and next pointers', async () => {
  const r = await run(['maintenance', '--help']);
  assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const clean = stripAnsi(r.stdout);
  assert.match(clean, /cursor state, summary counts, bucket counts/);
  assert.match(clean, /current-page next executable\/review pointers/);
});

await test('maintenance — rejects malformed CLI flags before runtime work', async () => {
  const missingPhases = await run(['maintenance', '--phases']);
  assert.equal(missingPhases.code, 1);
  assert.match(stripAnsi(missingPhases.stderr), /--phases requires a value/);
  assert.match(stripAnsi(missingPhases.stderr), /oh-my-ontology maintenance/);

  const emptyPhaseItem = await run(['maintenance', '--phases=repair,']);
  assert.equal(emptyPhaseItem.code, 1);
  assert.match(stripAnsi(emptyPhaseItem.stderr), /--phases must not contain empty CSV items/);

  const missingCursor = await run(['maintenance', '--after-action-id']);
  assert.equal(missingCursor.code, 1);
  assert.match(stripAnsi(missingCursor.stderr), /--after-action-id requires a value/);

  const highLimit = await run(['maintenance', '--limit=501']);
  assert.equal(highLimit.code, 1);
  assert.match(stripAnsi(highLimit.stderr), /--limit must be <= 500/);

  const typo = await run(['maintenance', '--lmit=1']);
  assert.equal(typo.code, 1);
  assert.match(stripAnsi(typo.stderr), /unknown flag: --lmit=1\. Did you mean --limit\?/);
});

await test('health --json — unhealthy graph exits non-zero', async () => {
  const root = buildCycleFixture();
  try {
    const r = await run(['health', root, '--json']);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'health');
    assert.equal(data.status, 'needs_attention');
    assert.equal(data.summary.dependencyCycles, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('health/workspace-brief --json — fail closed on malformed diagnosis payloads', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-diagnosis-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const operation = msg.params.arguments.operation;",
      "    const payload = operation === 'health'",
      "      ? { operation: 'health', status: 'healthy', summary: { nodes: 1, edges: 0 }, checks: [{ id: 'compile_issues', status: 'pass' }] }",
      "      : { operation: 'workspace_brief', status: 'healthy', summary: { nodes: 1, edges: 0 }, nextActions: [{ kind: 'cleanup', severity: 'fatal' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const health = await run(['health', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(health.code, 2, `stdout: ${health.stdout}\nstderr: ${health.stderr}`);
    assert.equal(health.stdout, '');
    assert.match(stripAnsi(health.stderr), /health checks\[0\] has an invalid health-check shape/);

    const brief = await run(['workspace-brief', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(brief.code, 2, `stdout: ${brief.stdout}\nstderr: ${brief.stderr}`);
    assert.equal(brief.stdout, '');
    assert.match(stripAnsi(brief.stderr), /workspace_brief nextActions\[0\] has an invalid next-action shape/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('health — prints check status and count coverage', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['health', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(r.stdout, /\x1b\[32mhealthy\x1b\[0m/);
    assert.match(clean, /compile_issues\s+pass:0/);
    assert.match(clean, /components\s+pass:1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('health --help — documents focused diagnosis tuning flags', async () => {
  const r = await run(['health', '--help']);
  assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const clean = stripAnsi(r.stdout);
  assert.match(clean, /--dependency-types A,B/);
  assert.match(clean, /--component-types A,B/);
  assert.match(clean, /--component-limit N/);
  assert.match(clean, /Use --json for repeatable automation gates such as pnpm dogfood:health/);
  assert.match(clean, /Failing health checks exit non-zero; use workspace-brief when you also need hotspots and next actions/);
  assert.match(clean, /Use pnpm dogfood:status for the cheap human-readable health \+ workspace-brief pair/);
  assert.match(clean, /Tuning flags forward to query_ontology health/);
});

await test('health --json — forwards focused diagnosis tuning flags', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'health',
      root,
      '--json',
      '--component-types',
      'dependencies',
      '--dependency-types=dependencies',
      '--component-limit=2',
      '--node-limit=1',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'health');
    assert.equal(data.status, 'healthy');
    const components = data.checks.find((check) => check.id === 'components');
    assert.equal(components.status, 'info');
    assert.equal(components.count, 3);
    assert.match(components.message, /scoped ontology graph/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('health/workspace-brief — reject malformed diagnosis tuning flags', async () => {
  const missing = await run(['health', '--component-types']);
  assert.equal(missing.code, 1);
  assert.match(stripAnsi(missing.stderr), /--component-types requires a value/);

  const emptyTypes = await run(['workspace-brief', '--dependency-types=,']);
  assert.equal(emptyTypes.code, 1);
  assert.match(stripAnsi(emptyTypes.stderr), /--dependency-types requires at least one relation type/);

  const trailingEmptyType = await run(['health', '--component-types=dependencies,']);
  assert.equal(trailingEmptyType.code, 1);
  assert.match(stripAnsi(trailingEmptyType.stderr), /--component-types must not contain empty CSV items/);

  const highLimit = await run(['health', '--component-limit=501']);
  assert.equal(highLimit.code, 1);
  assert.match(stripAnsi(highLimit.stderr), /--component-limit must be <= 500/);

  const typo = await run(['workspace-brief', '--component-lmit=1']);
  assert.equal(typo.code, 1);
  assert.match(stripAnsi(typo.stderr), /unknown flag: --component-lmit=1\. Did you mean --component-limit\?/);
});

await test('cycles --json — dependency cycles exit non-zero', async () => {
  const root = buildCycleFixture();
  try {
    const r = await run(['cycles', root, '--json']);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'cycles');
    assert.equal(data.totalCycles, 1);
    assert.deepEqual(data.cycles[0].nodeSummaries.map((node) => node.title), ['A', 'B', 'A']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('cycles — human output includes node titles', async () => {
  const root = buildCycleFixture();
  try {
    const r = await run(['cycles', root]);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /capabilities\/a\s+— A/);
    assert.match(clean, /capabilities\/b\s+— B/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('cycles --json — fails closed on malformed cycles payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-cycles-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { operation: 'cycles', totalCycles: 1, cycles: [{ slugs: ['a'] }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['cycles', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /cycles query cycles\[0\] has an invalid cycle shape/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('node — graph fixture 의 capabilities/foo deep dive', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['node', 'capabilities/foo', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    // header
    assert.match(clean, /capability/);
    assert.match(clean, /slug\s+capabilities\/foo/);
    // foo 는 bar 가 relates 로 reference + auth domain 의 capabilities 로 reference
    assert.match(clean, /INCOMING/);
    assert.match(clean, /capabilities\/bar|domains\/auth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('node --json — JSON 응답 node/edges/lineage 키 노출', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['node', 'capabilities/foo', root, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'node_profile');
    assert.equal(data.center, 'capabilities/foo');
    assert.ok(data.node);
    assert.equal(data.node.slug, 'capabilities/foo');
    assert.ok(data.edges);
    assert.ok(data.edges.incoming);
    assert.ok(data.edges.outgoing);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('node --limit — high-degree edge groups are tunable', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['node', 'capabilities/foo', root, '--limit=1', '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'node_profile');
    assert.equal(data.edges.incoming.total, 2);
    assert.equal(data.edges.incoming.edges.length, 1);
    assert.equal(data.edges.incoming.limited, true);

    const human = await run(['node', 'capabilities/foo', root, '--limit=1']);
    assert.equal(human.code, 0, `stdout: ${human.stdout}\nstderr: ${human.stderr}`);
    assert.match(stripAnsi(human.stdout), /incoming edges limited: showing 1\/2; use --limit N for more/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('node --types — relation filters are forwarded before edge limits', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['node', 'capabilities/foo', root, '--types=relates', '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'node_profile');
    assert.equal(data.edges.incoming.total, 1);
    assert.equal(data.edges.incoming.edges[0]?.via, 'relates');
    assert.equal(data.edges.incoming.edges[0]?.from, 'capabilities/bar');
    assert.equal(data.edges.outgoing.total, 0);

    const human = await run(['node', 'capabilities/foo', root, '--types=relates']);
    assert.equal(human.code, 0, `stdout: ${human.stdout}\nstderr: ${human.stderr}`);
    const clean = stripAnsi(human.stdout);
    assert.match(clean, /filters types=relates/);
    assert.match(clean, /relates/);
    assert.match(clean, /capabilities\/bar/);
    assert.doesNotMatch(clean, /\n\s+domains\/auth/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('node --no-external/--no-unresolved — noisy refs can be hidden from edge lists', async () => {
  const root = withVault([
    {
      slug: 'capabilities/foo',
      content:
        '---\nkind: capability\nslug: capabilities/foo\ntitle: Foo\ndomain: domains/auth\nelements: [src/foo.ts]\ndependencies: [capabilities/missing]\n---\n\n# Foo\n',
    },
    {
      slug: 'domains/auth',
      content:
        '---\nkind: domain\nslug: domains/auth\ntitle: Auth\ncapabilities: [capabilities/foo]\n---\n\n# Auth\n',
    },
  ]);
  try {
    const all = await run(['node', 'capabilities/foo', root, '--json']);
    assert.equal(all.code, 0, `stdout: ${all.stdout}\nstderr: ${all.stderr}`);
    const allData = JSON.parse(all.stdout);
    assert.equal(allData.edges.outgoing.total, 3);
    assert.ok(allData.edges.outgoing.edges.some((edge) => edge.external && edge.to === 'src/foo.ts'));
    assert.ok(allData.edges.outgoing.edges.some((edge) => !edge.resolved && !edge.external && edge.to === 'capabilities/missing'));

    const filtered = await run(['node', 'capabilities/foo', root, '--no-external', '--no-unresolved', '--json']);
    assert.equal(filtered.code, 0, `stdout: ${filtered.stdout}\nstderr: ${filtered.stderr}`);
    const filteredData = JSON.parse(filtered.stdout);
    assert.equal(filteredData.edges.outgoing.total, 1);
    assert.deepEqual(filteredData.edges.outgoing.edges.map((edge) => edge.via), ['domain']);

    const noMatches = await run(['node', 'capabilities/foo', root, '--types=elements', '--no-external']);
    assert.equal(noMatches.code, 0, `stdout: ${noMatches.stdout}\nstderr: ${noMatches.stderr}`);
    const clean = stripAnsi(noMatches.stdout);
    assert.match(clean, /filters types=elements .* external=false/);
    assert.match(clean, /no matching edges for current filters/);
    assert.doesNotMatch(clean, /isolated — 어떤 노드와도 연결 안 됨/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('node --json — fails closed on malformed node_profile payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-node-profile-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { operation: 'node_profile', center: 'capabilities/foo', node: { slug: 'capabilities/foo', kind: 'capability', title: 'Foo' }, degree: { in: 1, out: 1 }, edges: { incoming: { total: 0, byRelation: {}, limited: false, edges: [] }, outgoing: { total: 0, byRelation: {}, limited: false, edges: [] } } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['node', 'capabilities/foo', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /node_profile degree must contain non-negative in\/out\/total counts/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('node — slug 누락 시 usage + exit 1', async () => {
  const r = await run(['node']);
  assert.equal(r.code, 1);
  const clean = stripAnsi(r.stderr);
  assert.match(clean, /slug is required/);
});

await test('similar — title 매치로 graph fixture 의 비슷한 노드 발견', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['similar', 'foo capability', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /similar to:.*foo capability/);
    // fixture 의 capabilities/foo 가 매치되어야 (title 'Foo' 에 매치)
    assert.match(clean, /capabilities\/(foo|bar)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('similar --json — JSON 응답 matches/score/signals 키 노출', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['similar', 'foo', root, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'similar_nodes');
    assert.ok(Array.isArray(data.matches));
    if (data.matches.length > 0) {
      assert.ok(typeof data.matches[0].score === 'number');
      assert.ok(data.matches[0].signals);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('similar --json — fails closed on malformed similar_nodes payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-similar-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { operation: 'similar_nodes', totalMatches: 1, limited: false, matches: [{ node: { slug: 'capabilities/foo', kind: 'capability' }, score: 0.4, signals: {} }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['similar', 'foo', root, '--json'], { env: { OMOT_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /similar_nodes matches\[0\] has an invalid similar-node shape/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('similar — query / --slug 둘 다 없으면 usage + exit 1', async () => {
  const r = await run(['similar']);
  assert.equal(r.code, 1);
  const clean = stripAnsi(r.stderr);
  assert.match(clean, /query is required/);
});

await test('rename — dry-run preview, no disk change', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'rename',
      'capabilities/foo',
      'capabilities/foo-renamed',
      root,
    ]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /dry-run/);
    assert.match(clean, /capabilities\/foo-renamed/);
    assert.match(clean, /[1-9]\d* file\(s\) would change/);
    assert.match(clean, /capabilities\/bar\s+— Bar/);
    assert.match(clean, /relates changed/);
    // foo.md 그대로 존재 (dry-run)
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), true);
    assert.equal(
      existsSyncTest(join(root, 'capabilities/foo-renamed.md')),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('rename --confirm — 파일 이동 + backlink redirect', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'rename',
      'capabilities/foo',
      'capabilities/foo-renamed',
      root,
      '--confirm',
    ]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /[1-9]\d* file\(s\) updated/);
    assert.match(clean, /capabilities\/bar\s+— Bar/);
    assert.match(clean, /relates changed/);
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), false);
    assert.equal(
      existsSyncTest(join(root, 'capabilities/foo-renamed.md')),
      true,
    );
    // bar 의 relates 가 redirect 됐는지
    const barText = readFileSync(
      join(root, 'capabilities/bar.md'),
      'utf-8',
    );
    assert.match(barText, /capabilities\/foo-renamed/);
    assert.doesNotMatch(barText, /relates:.*\bcapabilities\/foo\b(?!-renamed)/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('rename --confirm --overwrite — existing target slug 대체', async () => {
  const root = await buildGraphFixture();
  try {
    const blocked = await run([
      'rename',
      'capabilities/foo',
      'capabilities/bar',
      root,
      '--confirm',
    ]);
    assert.equal(blocked.code, 2);
    assert.match(stripAnsi(blocked.stderr), /Target slug already exists/);
    assert.match(stripAnsi(blocked.stderr), /overwrite/);

    const r = await run([
      'rename',
      'capabilities/foo',
      'capabilities/bar',
      root,
      '--confirm',
      '--overwrite',
    ]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), false);
    const barText = readFileSync(join(root, 'capabilities/bar.md'), 'utf-8');
    assert.match(barText, /title: Foo/);
    assert.match(barText, /slug: capabilities\/bar/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('delete — backlinks 있으면 dry-run 에서 경고', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['delete', 'capabilities/foo', root]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /dry-run/);
    assert.match(clean, /backlink/);
    assert.match(clean, /capabilities\/bar\s+— Bar/);
    assert.match(clean, /domains\/auth\s+— Auth/);
    assert.match(clean, /--force/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('delete --confirm — backlinks 있으면 MCP error 로 실패', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'delete',
      'capabilities/foo',
      root,
      '--confirm',
    ]);
    assert.equal(r.code, 2);
    const clean = stripAnsi(r.stderr);
    assert.match(clean, /backlink/);
    assert.match(clean, /force:true|--force/);
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('delete --confirm --force — 적용 출력에 dangling backlink 를 보여준다', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'delete',
      'capabilities/foo',
      root,
      '--confirm',
      '--force',
    ]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /deleted/);
    assert.match(clean, /deleted node\s+Foo/);
    assert.match(clean, /# Foo/);
    assert.match(clean, /2 dangling backlink\(s\) left/);
    assert.match(clean, /capabilities\/bar\s+— Bar\s+\(relates\)/);
    assert.match(clean, /domains\/auth\s+— Auth\s+\(capabilities\)/);
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), false);
    assert.match(readFileSync(join(root, 'capabilities/bar.md'), 'utf-8'), /capabilities\/foo/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('delete --confirm (no backlinks) — 파일 삭제', async () => {
  const root = withVault([
    {
      slug: 'capabilities/lonely',
      content:
        '---\nkind: capability\nslug: capabilities/lonely\ntitle: Lonely\ndomain: domains/auth\n---\n',
    },
  ]);
  try {
    const r = await run([
      'delete',
      'capabilities/lonely',
      root,
      '--confirm',
    ]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    assert.match(stripAnsi(r.stdout), /deleted node\s+Lonely/);
    assert.equal(
      existsSyncTest(join(root, 'capabilities/lonely.md')),
      false,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('merge — dry-run preview', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'merge',
      'capabilities/foo',
      'capabilities/bar',
      root,
    ]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /dry-run/);
    assert.match(clean, /capabilities\/foo/);
    assert.match(clean, /capabilities\/bar/);
    assert.match(clean, /[1-9]\d* file\(s\) would change/);
    assert.match(clean, /domains\/auth\s+— Auth/);
    assert.match(clean, /capabilities changed/);
    // foo.md 그대로 존재 (dry-run)
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('merge --confirm — 적용 출력에 변경 파일과 key 를 보여준다', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'merge',
      'capabilities/foo',
      'capabilities/bar',
      root,
      '--confirm',
    ]);
    assert.equal(r.code, 0, `stderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /[1-9]\d* file\(s\) updated/);
    assert.match(clean, /capabilities\/foo\.md deleted/);
    assert.match(clean, /deleted source\s+Foo/);
    assert.match(clean, /# Foo/);
    assert.match(clean, /domains\/auth\s+— Auth/);
    assert.match(clean, /capabilities changed/);
    assert.equal(existsSyncTest(join(root, 'capabilities/foo.md')), false);
    const authText = readFileSync(join(root, 'domains/auth.md'), 'utf-8');
    assert.doesNotMatch(authText, /capabilities\/foo/);
    assert.match(authText, /capabilities\/bar/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('graph write commands — reject ambiguous vault arguments before MCP call', async () => {
  const cases = [
    {
      args: ['rename', 'capabilities/foo', 'capabilities/bar', '--vault'],
      pattern: /--vault requires a path/,
    },
    {
      args: ['rename', 'capabilities/foo', 'capabilities/bar', '--vault='],
      pattern: /--vault requires a path/,
    },
    {
      args: ['rename', 'capabilities/foo', 'capabilities/bar', '--cnfirm'],
      pattern: /unknown flag: --cnfirm\. Did you mean --confirm\?/,
    },
    {
      args: ['rename', 'capabilities/foo', 'capabilities/bar', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['rename', 'capabilities/foo', 'capabilities/bar', 'one', 'two'],
      pattern: /too many arguments: two/,
    },
    {
      args: ['merge', 'capabilities/foo', 'capabilities/bar', '--vault', '--json'],
      pattern: /--vault requires a path/,
    },
    {
      args: ['merge', 'capabilities/foo', 'capabilities/bar', '--cnfirm'],
      pattern: /unknown flag: --cnfirm\. Did you mean --confirm\?/,
    },
    {
      args: ['merge', 'capabilities/foo', 'capabilities/bar', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['delete', 'capabilities/foo', '--vault', '--confirm'],
      pattern: /--vault requires a path/,
    },
    {
      args: ['delete', 'capabilities/foo', '--froce'],
      pattern: /unknown flag: --froce\. Did you mean --force\?/,
    },
    {
      args: ['delete', 'capabilities/foo', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['delete', 'capabilities/foo', 'one', 'two'],
      pattern: /too many arguments: two/,
    },
  ];

  for (const c of cases) {
    const r = await run(c.args);
    assert.equal(r.code, 1, `${c.args.join(' ')}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(stripAnsi(r.stderr), c.pattern);
  }
});

await test('repo analysis commands — reject invalid vault/root arguments before MCP call', async () => {
  const cases = [
    {
      args: ['analyze', '--vault', '--apply'],
      pattern: /--vault requires a path/,
    },
    {
      args: ['analyze', '--vault='],
      pattern: /--vault requires a path/,
    },
    {
      args: ['analyze', '--max-depht=2'],
      pattern: /unknown flag: --max-depht=2\. Did you mean --max-depth\?/,
    },
    {
      args: ['analyze', 'one', 'two'],
      pattern: /too many arguments: two/,
    },
    {
      args: ['infer-imports', '--vault', '--apply'],
      pattern: /--vault requires a path/,
    },
    {
      args: ['infer-imports', '--vault='],
      pattern: /--vault requires a path/,
    },
    {
      args: ['infer-imports', '--max-file=10'],
      pattern: /unknown flag: --max-file=10\. Did you mean --max-files\?/,
    },
    {
      args: ['infer-imports', 'one', 'two'],
      pattern: /too many arguments: two/,
    },
    {
      args: ['bootstrap', '--vault', '--skip-imports'],
      pattern: /--vault requires a path/,
    },
    {
      args: ['bootstrap', '--vault='],
      pattern: /--vault requires a path/,
    },
    {
      args: ['bootstrap', '--skip-import'],
      pattern: /unknown flag: --skip-import\. Did you mean --skip-imports\?/,
    },
    {
      args: ['bootstrap', 'one', 'two'],
      pattern: /too many arguments: two/,
    },
  ];

  for (const c of cases) {
    const r = await run(c.args);
    assert.equal(r.code, 1, `${c.args.join(' ')}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(stripAnsi(r.stderr), c.pattern);
  }
});

await test('repo analysis commands — reject invalid numeric option values before MCP call', async () => {
  const cases = [
    {
      args: ['analyze', '--max-depth'],
      pattern: /--max-depth requires a value/,
    },
    {
      args: ['analyze', '--max-depth=abc'],
      pattern: /--max-depth must be a non-negative integer/,
    },
    {
      args: ['analyze', '--max-depth=11'],
      pattern: /--max-depth must be <= 10/,
    },
    {
      args: ['infer-imports', '--max-files', '--json'],
      pattern: /--max-files requires a value/,
    },
    {
      args: ['infer-imports', '--max-files=0'],
      pattern: /--max-files must be a positive integer/,
    },
    {
      args: ['infer-imports', '--max-files=50001'],
      pattern: /--max-files must be <= 50000/,
    },
    {
      args: ['infer-imports', '--threshold', '--json'],
      pattern: /--threshold requires a value/,
    },
    {
      args: ['bootstrap', '--max-depth', '--skip-imports'],
      pattern: /--max-depth requires a value/,
    },
    {
      args: ['bootstrap', '--max-depth=11'],
      pattern: /--max-depth must be <= 10/,
    },
    {
      args: ['bootstrap', '--max-files=abc'],
      pattern: /--max-files must be a positive integer/,
    },
    {
      args: ['bootstrap', '--max-files=50001'],
      pattern: /--max-files must be <= 50000/,
    },
    {
      args: ['bootstrap', '--threshold=0'],
      pattern: /--threshold must be a positive integer/,
    },
  ];

  for (const c of cases) {
    const r = await run(c.args);
    assert.equal(r.code, 1, `${c.args.join(' ')}\nstdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.match(stripAnsi(r.stderr), c.pattern);
  }
});

// ── analyze --apply (R+ — agent-less bootstrap) ─────────────────────────
//
// CLI 가 analyze_repo_structure 결과를 add_concepts + add_relations 배치로
// land. /ontology-bootstrap skill 의 CLI 짝.

function makeRepoFixture() {
  const repo = mkdtempSync(join(tmpdir(), 'cli-repo-'));
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify(
      { name: 'test-app', description: 'Test app for analyze --apply' },
      null,
      2,
    ),
    'utf-8',
  );
  // FSD-ish layout — features 한 두개 만들어 capability 후보 생성.
  mkdirSync(join(repo, 'src', 'features', 'auth'), { recursive: true });
  mkdirSync(join(repo, 'src', 'features', 'billing'), { recursive: true });
  return repo;
}

await test('analyze --apply — clean init starter nodes are pruned', async () => {
  const repo = makeRepoFixture();
  try {
    const init = await run(['init', 'ontology'], { cwd: repo });
    assert.equal(init.code, 0, `init failed: ${init.stdout}\n${init.stderr}`);

    const vault = join(repo, 'ontology');
    const r = await run(['analyze', repo, '--vault', vault, '--apply']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /starters\s+4 removed/);
    assert.equal(existsSyncTest(join(vault, 'project.md')), false);
    assert.equal(existsSyncTest(join(vault, 'domains', 'example.md')), false);
    assert.equal(
      existsSyncTest(join(vault, 'capabilities', 'example.md')),
      false,
    );
    assert.equal(existsSyncTest(join(vault, 'elements', 'example.md')), false);
    assert.equal(existsSyncTest(join(vault, 'test-app.md')), true);
    assert.equal(existsSyncTest(join(vault, 'capabilities', 'auth.md')), true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply — edited starter nodes are preserved', async () => {
  const repo = makeRepoFixture();
  try {
    const init = await run(['init', 'ontology'], { cwd: repo });
    assert.equal(init.code, 0, `init failed: ${init.stdout}\n${init.stderr}`);

    const vault = join(repo, 'ontology');
    const editedDomain = join(vault, 'domains', 'example.md');
    writeFileSync(
      editedDomain,
      readFileSync(editedDomain, 'utf-8').replace(
        'title: Example domain',
        'title: Edited domain',
      ),
      'utf-8',
    );

    const r = await run(['analyze', repo, '--vault', vault, '--apply']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /starters\s+3 removed · 1 preserved/);
    assert.equal(existsSyncTest(editedDomain), true);
    assert.match(readFileSync(editedDomain, 'utf-8'), /title: Edited domain/);
    assert.equal(existsSyncTest(join(vault, 'capabilities', 'example.md')), false);
    assert.equal(existsSyncTest(join(vault, 'test-app.md')), true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply — project slug can replace untouched starter project', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'cli-repo-project-'));
  try {
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify({ name: 'project', description: 'Real project app' }, null, 2),
      'utf-8',
    );
    mkdirSync(join(repo, 'src', 'features', 'auth'), { recursive: true });
    const init = await run(['init', 'ontology'], { cwd: repo });
    assert.equal(init.code, 0, `init failed: ${init.stdout}\n${init.stderr}`);

    const vault = join(repo, 'ontology');
    const r = await run(['analyze', repo, '--vault', vault, '--apply']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const projectDoc = readFileSync(join(vault, 'project.md'), 'utf-8');
    assert.match(projectDoc, /title: Real project app/);
    assert.doesNotMatch(projectDoc, /title: My project/);
    assert.equal(existsSyncTest(join(vault, 'capabilities', 'auth.md')), true);
  } finally {
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply — concepts/relations vault 에 land', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r = await run([
      'analyze',
      repo,
      '--vault',
      vault,
      '--apply',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /analyze --apply/);
    assert.match(clean, /concepts/);
    // project (test-app) 노드가 vault 에 land 됐어야.
    const projectFile = join(vault, 'test-app.md');
    assert.equal(existsSyncTest(projectFile), true, 'project file landed');
    const fm = readFileSync(projectFile, 'utf-8');
    assert.match(fm, /kind: project/);
    // analyze 가 pkg.description 을 title 로 사용 (혹은 fallback humanize).
    assert.match(fm, /title: Test app for analyze --apply/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze (default, no --apply) — vault 변경 0', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r = await run(['analyze', repo, '--vault', vault]);
    assert.equal(r.code, 0);
    // vault 에 새 .md 파일이 *없어야* 함 (default 는 read-only).
    assert.equal(
      existsSyncTest(join(vault, 'test-app.md')),
      false,
      'project file 안 만들어짐 (default mode)',
    );
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply 두 번째 실행 → "already existed" 카운트, errors 0', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r1 = await run(['analyze', repo, '--vault', vault, '--apply']);
    assert.equal(r1.code, 0);
    const r2 = await run(['analyze', repo, '--vault', vault, '--apply']);
    assert.equal(r2.code, 0, `2번째 실행 실패: ${r2.stdout}\n${r2.stderr}`);
    const clean = stripAnsi(r2.stdout);
    // 모두 already existed (concept side) + 모두 already existed (relation side, idempotent).
    assert.match(clean, /already existed/);
    // errors 0
    assert.match(clean, /0 errors/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply — 마지막 vault census 라인 (R+ cycle 38)', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r = await run(['analyze', repo, '--vault', vault, '--apply']);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /vault now has \d+ nodes/);
    assert.match(clean, /project=1/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply --json — vaultCensus 필드 (R+ cycle 38)', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r = await run([
      'analyze',
      repo,
      '--vault',
      vault,
      '--apply',
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.vaultCensus);
    assert.equal(typeof data.vaultCensus.total, 'number');
    assert.ok(data.vaultCensus.total >= 1);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply --json — applied / summary 필드 노출', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  try {
    const r = await run([
      'analyze',
      repo,
      '--vault',
      vault,
      '--apply',
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.applied, 'applied 필드 있음');
    assert.ok(Array.isArray(data.applied.concepts), 'applied.concepts 배열');
    assert.ok(Array.isArray(data.applied.relations), 'applied.relations 배열');
    assert.ok(data.summary, 'summary 필드 있음');
    assert.equal(typeof data.summary.errors, 'number');
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply — labels row-level failures without slug or relation shape', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  const fakeMcp = join(vault, 'fake-mcp-analyze-row-labels.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'analyze_repo_structure') {",
      "    const payload = { rootPath: '/repo', framework: 'generic', project: { slug: 'demo', title: 'Demo' }, domains: [{ slug: 'domains/core', title: 'Core', evidence: { source: 'README.md' } }], capabilities: [], elements: [], suggestedRelations: [{ from: 'demo', to: 'domains/core', type: 'contains' }], skipped: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_concepts') {",
      "    const payload = { concepts: [{ ok: false, error: 'concepts[0] missing slug' }, { ok: true, slug: 'domains/core', filePath: '/tmp/domains/core.md', changed: true }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_relations') {",
      "    const payload = { relations: [{ ok: false, error: 'relations[0] missing source' }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['analyze', repo, '--vault', vault, '--apply'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /✗ concepts\[0\] — concepts\[0\] missing slug/);
    assert.match(clean, /✗ relations\[0\] — relations\[0\] missing source/);
    assert.doesNotMatch(clean, /undefined/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply — fails closed when add_concepts response rows drift', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  const fakeMcp = join(vault, 'fake-mcp-analyze-batch-drift.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'analyze_repo_structure') {",
      "    const payload = { rootPath: '/repo', framework: 'generic', project: { slug: 'demo', title: 'Demo' }, domains: [], capabilities: [], elements: [], suggestedRelations: [], skipped: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_concepts') {",
      "    const payload = { concepts: [{ slug: 'demo', ok: 'true' }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['analyze', repo, '--vault', vault, '--apply'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /add_concepts\.concepts\[0\]\.ok must be a boolean/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --apply — fails closed when add_relations response row count drifts', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  const fakeMcp = join(vault, 'fake-mcp-analyze-relation-count-drift.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'analyze_repo_structure') {",
      "    const payload = { rootPath: '/repo', framework: 'generic', project: { slug: 'demo', title: 'Demo' }, domains: [{ slug: 'domains/core', title: 'Core', evidence: { source: 'README.md' } }], capabilities: [], elements: [], suggestedRelations: [{ from: 'demo', to: 'domains/core', type: 'contains' }], skipped: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_concepts') {",
      "    const payload = { concepts: msg.params.arguments.concepts.map((concept) => ({ slug: concept.slug, ok: true, filePath: `/tmp/${concept.slug}.md`, changed: true })) };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_relations') {",
      "    const payload = { relations: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['analyze', repo, '--vault', vault, '--apply'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /add_relations\.relations row count mismatch: expected 1, got 0/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze — fails closed when analyze_repo_structure candidate payload drifts', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  const fakeMcp = join(vault, 'fake-mcp-analyze-candidate-drift.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'analyze_repo_structure') {",
      "    const payload = { rootPath: '/repo', framework: 'generic', project: { slug: 'demo', title: 'Demo' }, domains: {}, capabilities: [], elements: [], suggestedRelations: [], skipped: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['analyze', repo, '--vault', vault, '--json'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /analyze_repo_structure\.domains must be an array/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('analyze --json — fails closed when analyze_repo_structure framework drifts', async () => {
  const vault = withVault([]);
  const repo = makeRepoFixture();
  const fakeMcp = join(vault, 'fake-mcp-analyze-framework-drift.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'analyze_repo_structure') {",
      "    const payload = { rootPath: '/repo', framework: 'unknown', project: { slug: 'demo', title: 'Demo' }, domains: [], capabilities: [], elements: [], suggestedRelations: [], skipped: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['analyze', repo, '--vault', vault, '--json'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /analyze_repo_structure\.framework must be one of fsd, next, generic/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

// ── infer-imports --apply (R+ — agent-less depends_on landing) ──────────
//
// analyze --apply 의 짝. moduleEdges 를 depends_on 관계로 batch land.

function makeImportRepo() {
  // 두 capability (a, b) 가 a → b 로 import. moduleEdges 가 1 개 나옴.
  const repo = mkdtempSync(join(tmpdir(), 'cli-imp-'));
  mkdirSync(join(repo, 'src', 'a'), { recursive: true });
  mkdirSync(join(repo, 'src', 'b'), { recursive: true });
  writeFileSync(
    join(repo, 'src', 'a', 'index.ts'),
    "import { x } from '../b';\nexport const z = x;\n",
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'b', 'index.ts'),
    'export const x = 1;\n',
    'utf-8',
  );
  return repo;
}

function makeImportKindRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'cli-imp-kind-'));
  mkdirSync(join(repo, 'src', 'a'), { recursive: true });
  mkdirSync(join(repo, 'src', 'b'), { recursive: true });
  writeFileSync(
    join(repo, 'src', 'a', 'index.ts'),
    [
      "import { x } from '../b/static';",
      "const y = await import('../b/dynamic');",
      "const z = require('../b/required');",
      "export { r } from '../b/reexported';",
      'export const value = x + y + z;',
      '',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(join(repo, 'src', 'b', 'static.ts'), 'export const x = 1;\n', 'utf-8');
  writeFileSync(join(repo, 'src', 'b', 'dynamic.ts'), 'export const y = 1;\n', 'utf-8');
  writeFileSync(join(repo, 'src', 'b', 'required.ts'), 'export const z = 1;\n', 'utf-8');
  writeFileSync(join(repo, 'src', 'b', 'reexported.ts'), 'export const r = 1;\n', 'utf-8');
  return repo;
}

await test('infer-imports --apply — depends_on 관계 land (endpoints 존재 시)', async () => {
  const vault = withVault([
    {
      slug: 'capabilities/a',
      content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n',
    },
    {
      slug: 'capabilities/b',
      content: '---\nkind: capability\ntitle: B\ndomain: x\n---\n',
    },
  ]);
  const repo = makeImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--apply',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /infer-imports --apply/);
    assert.match(clean, /landed|already existed/);
    // a.md 의 frontmatter 에 dependencies (inline 또는 list) 에 b 포함.
    const aDoc = readFileSync(join(vault, 'capabilities', 'a.md'), 'utf-8');
    assert.match(aDoc, /dependencies:.*\bb\b/s);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports preview — file edge kind summary exposed', async () => {
  const vault = withVault([]);
  const repo = makeImportKindRepo();
  try {
    const r = await run(['infer-imports', repo, '--vault', vault]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /edge kinds/);
    assert.match(clean, /static=1/);
    assert.match(clean, /dynamic=1/);
    assert.match(clean, /require=1/);
    assert.match(clean, /reexport=1/);
    assert.match(clean, /capabilities\/a.*capabilities\/b.*static=1.*dynamic=1.*require=1.*reexport=1/s);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports (default) — vault 변경 0', async () => {
  const vault = withVault([
    {
      slug: 'capabilities/a',
      content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n',
    },
  ]);
  const repo = makeImportRepo();
  try {
    const before = readFileSync(join(vault, 'capabilities', 'a.md'), 'utf-8');
    const r = await run(['infer-imports', repo, '--vault', vault]);
    assert.equal(r.code, 0);
    const after = readFileSync(join(vault, 'capabilities', 'a.md'), 'utf-8');
    assert.equal(after, before, 'a.md 내용 그대로 (default 모드)');
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --apply — endpoint 없으면 row-level error, batch 살아남음', async () => {
  // vault 에 a 만 있고 b 가 없음 — a → b edge 는 fail 행, batch 자체는 OK.
  const vault = withVault([
    {
      slug: 'capabilities/a',
      content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n',
    },
  ]);
  const repo = makeImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--apply',
    ]);
    // 적어도 한 row 가 fail → exit 1.
    assert.equal(r.code, 1, `expected exit 1; stdout: ${r.stdout}`);
    const clean = stripAnsi(r.stdout);
    // 에러 행 노출.
    assert.match(clean, /✗|does not exist|errors/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --apply — 마지막 vault census 라인 (R+ cycle 38)', async () => {
  const vault = withVault([
    { slug: 'capabilities/a', content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n' },
    { slug: 'capabilities/b', content: '---\nkind: capability\ntitle: B\ndomain: x\n---\n' },
  ]);
  const repo = makeImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--apply',
    ]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /vault now has \d+ nodes/);
    assert.match(clean, /capability=2/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --apply --json — applied / summary 필드 노출', async () => {
  const vault = withVault([
    {
      slug: 'capabilities/a',
      content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n',
    },
    {
      slug: 'capabilities/b',
      content: '---\nkind: capability\ntitle: B\ndomain: x\n---\n',
    },
  ]);
  const repo = makeImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--apply',
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.applied, 'applied 필드');
    assert.ok(Array.isArray(data.applied.relations), 'applied.relations 배열');
    assert.ok(data.summary, 'summary 필드');
    assert.equal(typeof data.summary.errors, 'number');
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --apply — labels row-level relation failures without relation shape', async () => {
  const vault = withVault([
    {
      slug: 'capabilities/a',
      content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n',
    },
    {
      slug: 'capabilities/b',
      content: '---\nkind: capability\ntitle: B\ndomain: x\n---\n',
    },
  ]);
  const repo = makeImportRepo();
  const fakeMcp = join(vault, 'fake-mcp-infer-row-labels.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'infer_imports') {",
      "    const payload = { rootPath: '/repo', filesScanned: 2, edges: [], externalImports: [], unresolved: [], moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 1, kindCounts: { static: 1 } }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_relations') {",
      "    const payload = { relations: [{ ok: false, error: 'relations[0] missing target' }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['infer-imports', repo, '--vault', vault, '--apply'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /✗ relations\[0\] — relations\[0\] missing target/);
    assert.doesNotMatch(clean, /undefined/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --apply — fails closed when add_relations response rows drift', async () => {
  const vault = withVault([
    {
      slug: 'capabilities/a',
      content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n',
    },
    {
      slug: 'capabilities/b',
      content: '---\nkind: capability\ntitle: B\ndomain: x\n---\n',
    },
  ]);
  const repo = makeImportRepo();
  const fakeMcp = join(vault, 'fake-mcp-infer-batch-drift.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'infer_imports') {",
      "    const payload = { rootPath: '/repo', filesScanned: 2, edges: [], externalImports: [], unresolved: [], moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 1, kindCounts: { static: 1 } }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_relations') {",
      "    const payload = { relations: [{ ok: true, from: 'capabilities/a', to: '', type: 'depends_on' }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['infer-imports', repo, '--vault', vault, '--apply'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /add_relations chunk @0\.relations\[0\]\.to must be a non-empty string/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports — fails closed when infer_imports module edge payload drifts', async () => {
  const vault = withVault([]);
  const repo = makeImportRepo();
  const fakeMcp = join(vault, 'fake-mcp-infer-payload-drift.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'infer_imports') {",
      "    const payload = { rootPath: '/repo', filesScanned: 1, edges: [], externalImports: [], unresolved: [], moduleEdges: [{ from: 'capabilities/a', to: 'capabilities/b', count: 2, kindCounts: { static: 1 } }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['infer-imports', repo, '--vault', vault, '--json'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(
      stripAnsi(r.stderr),
      /infer_imports\.moduleEdges\[0\]\.kindCounts total must equal count: count 2, kindCounts 1/,
    );
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --json — fails closed when infer_imports rootPath payload drifts', async () => {
  const vault = withVault([]);
  const repo = makeImportRepo();
  const fakeMcp = join(vault, 'fake-mcp-infer-rootpath-drift.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'infer_imports') {",
      "    const payload = { rootPath: '', filesScanned: 1, edges: [], externalImports: [], unresolved: [], moduleEdges: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['infer-imports', repo, '--vault', vault, '--json'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /infer_imports\.rootPath must be a non-empty string/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --json — fails closed when unresolved reason payload drifts', async () => {
  const vault = withVault([]);
  const repo = makeImportRepo();
  const fakeMcp = join(vault, 'fake-mcp-infer-unresolved-reason-drift.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'infer_imports') {",
      "    const payload = { rootPath: '/repo', filesScanned: 1, edges: [], externalImports: [], unresolved: [{ from: 'src/a.ts', spec: '@/missing', reason: 'unresolved-alias' }], moduleEdges: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['infer-imports', repo, '--vault', vault, '--json'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(
      stripAnsi(r.stderr),
      /infer_imports\.unresolved\[0\]\.reason must be one of empty, relative-not-found, alias-not-found/,
    );
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

// ── infer-imports --threshold N (R+ — weak edge 차단) ────────────────────

function makeStrongImportRepo() {
  // a 가 b 를 3번 import (count 3), c 를 1번 import (count 1).
  const repo = mkdtempSync(join(tmpdir(), 'cli-thr-'));
  mkdirSync(join(repo, 'src', 'a'), { recursive: true });
  mkdirSync(join(repo, 'src', 'b'), { recursive: true });
  mkdirSync(join(repo, 'src', 'c'), { recursive: true });
  // a 안 3개 파일이 b 를 import → b 는 count=3
  writeFileSync(
    join(repo, 'src', 'a', 'one.ts'),
    "import { x } from '../b';\nexport const a1 = x;\n",
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'a', 'two.ts'),
    "import { x } from '../b';\nexport const a2 = x;\n",
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'a', 'three.ts'),
    "import { x } from '../b';\nexport const a3 = x;\n",
    'utf-8',
  );
  // a/four 만 c 를 import → c 는 count=1 (weak)
  writeFileSync(
    join(repo, 'src', 'a', 'four.ts'),
    "import { y } from '../c';\nexport const a4 = y;\n",
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'b', 'index.ts'),
    'export const x = 1;\n',
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'c', 'index.ts'),
    'export const y = 1;\n',
    'utf-8',
  );
  return repo;
}

await test('infer-imports --threshold 3 — count < 3 edges 필터 (preview 모드)', async () => {
  const vault = withVault([]);
  const repo = makeStrongImportRepo();
  try {
    // 사전 — threshold 없이는 a→b · a→c 두 edge 모두 보여야 함.
    const noThr = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--json',
    ]);
    assert.equal(noThr.code, 0);
    const noThrData = JSON.parse(noThr.stdout);
    assert.ok(
      noThrData.moduleEdges.length >= 2,
      `expected 2+ edges, got ${noThrData.moduleEdges.length}`,
    );

    // threshold 3 — count < 3 인 a→c 는 제외.
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--threshold',
      '3',
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.moduleEdges.length < noThrData.moduleEdges.length);
    for (const m of data.moduleEdges) {
      assert.ok(m.count >= 3, `${m.from}→${m.to} count=${m.count} should be ≥3`);
    }
    // thresholdApplied 메타데이터.
    assert.ok(data.thresholdApplied);
    assert.equal(data.thresholdApplied.threshold, 3);
    assert.ok(data.thresholdApplied.filteredOut >= 1);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --threshold 3 --apply — 약한 edge 는 land 안 됨', async () => {
  // vault 에 a, b, c 모두 존재 — threshold 없으면 a→b, a→c 둘 다 land.
  // threshold 3 면 a→b 만 land, a→c 는 filtered out (depend on c 안 생김).
  const vault = withVault([
    { slug: 'capabilities/a', content: '---\nkind: capability\ntitle: A\ndomain: x\n---\n' },
    { slug: 'capabilities/b', content: '---\nkind: capability\ntitle: B\ndomain: x\n---\n' },
    { slug: 'capabilities/c', content: '---\nkind: capability\ntitle: C\ndomain: x\n---\n' },
  ]);
  const repo = makeStrongImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--apply',
      '--threshold',
      '3',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const aDoc = readFileSync(join(vault, 'capabilities', 'a.md'), 'utf-8');
    // a 는 b 의존 (count=3, ≥ threshold).
    assert.match(aDoc, /dependencies:.*\bb\b/s);
    // a 는 c 의존 *없음* (count=1, < threshold) — filter out.
    assert.doesNotMatch(aDoc, /\bc\b/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --threshold 0 (또는 미지정) — 변경 없음', async () => {
  const vault = withVault([]);
  const repo = makeStrongImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--threshold',
      '1',
      '--json',
    ]);
    // threshold=1 이면 count >= 1 — 사실상 모든 edge. 필터 메타데이터도 안 붙음
    // (코드가 threshold > 1 일 때만 필터).
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.equal(data.thresholdApplied, undefined);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('infer-imports --threshold abc — 잘못된 입력 거부', async () => {
  const vault = withVault([]);
  const repo = makeStrongImportRepo();
  try {
    const r = await run([
      'infer-imports',
      repo,
      '--vault',
      vault,
      '--threshold',
      'abc',
    ]);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /threshold/i);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

// ── bootstrap (R+ — analyze --apply + infer-imports --apply 합본) ───────

function makeFullRepo() {
  // FSD-ish layout — cycle 35 fix 후 analyze 와 infer_imports 가 같은 slug
  // ("auth" / "billing") 을 만들어 bootstrap 의 imports 단계가 endpoint 매치
  // 가능. 이전 cycle 34 에선 생성된 generic layout 으로 우회했음.
  const repo = mkdtempSync(join(tmpdir(), 'cli-bs-'));
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify({ name: 'bs-app', description: 'BS app' }, null, 2),
    'utf-8',
  );
  mkdirSync(join(repo, 'src', 'features', 'auth'), { recursive: true });
  mkdirSync(join(repo, 'src', 'features', 'billing'), { recursive: true });
  writeFileSync(
    join(repo, 'src', 'features', 'auth', 'index.ts'),
    "import { x } from '../billing';\nexport const a = x;\n",
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'features', 'billing', 'index.ts'),
    'export const x = 1;\n',
    'utf-8',
  );
  return repo;
}

function makeSingleFileLayeredRepo() {
  const repo = mkdtempSync(join(tmpdir(), 'cli-bs-layered-'));
  writeFileSync(
    join(repo, 'package.json'),
    JSON.stringify(
      { name: 'habit-ledger-pro', description: 'Habit Ledger Pro' },
      null,
      2,
    ),
    'utf-8',
  );
  writeFileSync(
    join(repo, 'README.md'),
    '# Habit Ledger Pro\n\n## Writing Habit Tracking\n\n## Local Data Integrity\n',
    'utf-8',
  );
  mkdirSync(join(repo, 'src', 'app'), { recursive: true });
  mkdirSync(join(repo, 'src', 'features'), { recursive: true });
  mkdirSync(join(repo, 'src', 'domain'), { recursive: true });
  mkdirSync(join(repo, 'src', 'storage'), { recursive: true });
  writeFileSync(
    join(repo, 'src', 'app', 'main.js'),
    [
      'import { checkIn } from "../features/check-in.js";',
      'import { weeklyReview } from "../features/weekly-review.js";',
      'export const run = () => [checkIn(), weeklyReview()];',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'features', 'check-in.js'),
    [
      'import { normalizeHabit } from "../domain/habit.js";',
      'import { appendEntry } from "../storage/json-store.js";',
      'export const checkIn = () => appendEntry(normalizeHabit("write"));',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'features', 'weekly-review.js'),
    [
      'import { calculateStreak } from "../domain/streak.js";',
      'import { readEntries } from "../storage/json-store.js";',
      'export const weeklyReview = () => calculateStreak(readEntries());',
    ].join('\n'),
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'domain', 'habit.js'),
    'export const normalizeHabit = (name) => ({ name });\n',
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'domain', 'streak.js'),
    'export const calculateStreak = (entries) => entries.length;\n',
    'utf-8',
  );
  writeFileSync(
    join(repo, 'src', 'storage', 'json-store.js'),
    'export const appendEntry = (entry) => entry;\nexport const readEntries = () => [];\n',
    'utf-8',
  );
  return repo;
}

await test('bootstrap — analyze + infer-imports 한 명령으로 land (FSD slug parity, cycle 35)', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run(['bootstrap', repo, '--vault', vault]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /1\) analyze/);
    assert.match(clean, /2\) imports/);
    // project + capability 노드 land
    assert.equal(existsSyncTest(join(vault, 'bs-app.md')), true, 'project');
    assert.equal(existsSyncTest(join(vault, 'capabilities', 'auth.md')), true, 'auth capability');
    assert.equal(
      existsSyncTest(join(vault, 'capabilities', 'billing.md')),
      true,
      'billing capability',
    );
    // R+ — FSD slug parity 확인. analyze 가 "capabilities/auth" /
    // "capabilities/billing" 으로 capability 만들고, infer_imports 의 module slug 도 일치해야
    // depends_on 에지가 진짜 land 됨. cycle 34 known issue 의 회귀 차단.
    const authDoc = readFileSync(join(vault, 'capabilities', 'auth.md'), 'utf-8');
    assert.match(
      authDoc,
      /dependencies:.*\bbilling\b/s,
      `auth.md should depend_on billing — got: ${authDoc}`,
    );
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap — single-file layered repo import endpoints 먼저 생성 후 depends_on land', async () => {
  const vault = withVault([]);
  const repo = makeSingleFileLayeredRepo();
  try {
    const r = await run([
      'bootstrap',
      repo,
      '--vault',
      vault,
      '--threshold',
      '1',
      '--json',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.summary.errors, 0);
    assert.ok(Array.isArray(data.imports.endpointConcepts));
    assert.ok(
      data.imports.endpointConcepts.some(
        (row) => row.ok === true && row.slug === 'capabilities/check-in',
      ),
      `expected bootstrap-created check-in endpoint, got: ${JSON.stringify(data.imports.endpointConcepts)}`,
    );
    assert.ok(
      data.imports.relations.some(
        (row) =>
          row.ok === true &&
          row.from === 'capabilities/check-in' &&
          row.to === 'elements/src/storage/json-store',
      ),
      `expected check-in → storage element relation, got: ${JSON.stringify(data.imports.relations)}`,
    );
    assert.ok(
      data.imports.containmentRelations.some(
        (row) =>
          row.ok === true &&
          row.from === 'habit-ledger-pro' &&
          row.to === 'domains/writing-habit-tracking',
      ),
      `expected project → domain containment, got: ${JSON.stringify(data.imports.containmentRelations)}`,
    );
    assert.ok(
      data.imports.containmentRelations.some(
        (row) =>
          row.ok === true &&
          row.from === 'domains/writing-habit-tracking' &&
          row.to === 'capabilities/check-in',
      ),
      `expected domain → check-in containment, got: ${JSON.stringify(data.imports.containmentRelations)}`,
    );
    const checkInDoc = readFileSync(
      join(vault, 'capabilities', 'check-in.md'),
      'utf-8',
    );
    assert.match(checkInDoc, /domain: domains\/writing-habit-tracking/);
    assert.match(checkInDoc, /dependencies:.*elements\/src\/storage\/json-store/s);
    assert.equal(
      existsSyncTest(join(vault, 'capabilities', 'domain.md')),
      false,
      'support layer should not become capabilities/domain',
    );
    assert.equal(
      existsSyncTest(join(vault, 'capabilities', 'storage.md')),
      false,
      'support layer should not become capabilities/storage',
    );
    assert.equal(
      existsSyncTest(join(vault, 'elements', 'src', 'storage', 'json-store.md')),
      true,
      'storage implementation should become an element',
    );
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap --skip-imports — 1단계 (analyze) 만, imports 영역 skipped 표시', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run([
      'bootstrap',
      repo,
      '--vault',
      vault,
      '--skip-imports',
    ]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /1\) analyze/);
    assert.match(clean, /skipped \(--skip-imports\)/);
    assert.equal(existsSyncTest(join(vault, 'bs-app.md')), true);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap --json — analyze / imports / summary 모두 단일 JSON', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run(['bootstrap', repo, '--vault', vault, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.analyze, 'analyze 필드');
    assert.ok(Array.isArray(data.analyze.concepts));
    assert.ok(Array.isArray(data.analyze.relations));
    assert.ok(data.imports, 'imports 필드');
    assert.ok(Array.isArray(data.imports.relations));
    assert.ok(data.summary, 'summary 필드');
    assert.equal(typeof data.summary.errors, 'number');
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap --threshold 3 — 약한 import (count<3) 안 land', async () => {
  // billing 는 1번만 import 됨 → threshold 3 면 import edge 안 land.
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run([
      'bootstrap',
      repo,
      '--vault',
      vault,
      '--threshold',
      '3',
      '--json',
    ]);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    // imports 의 thresholdApplied 메타데이터.
    assert.ok(data.imports.thresholdApplied);
    assert.equal(data.imports.thresholdApplied.threshold, 3);
    // import relations 거의 0 (모두 약함).
    assert.equal(data.imports.relations.length, 0);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap — 마지막에 vault census 한 줄 (R+ cycle 37)', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run(['bootstrap', repo, '--vault', vault]);
    assert.equal(r.code, 0);
    const clean = stripAnsi(r.stdout);
    // census 라인 — \"vault now has N nodes (project=1 · capability=2 · ...)\"
    assert.match(clean, /vault now has \d+ nodes/);
    // 적어도 project + capability 카운트 표시.
    assert.match(clean, /project=1/);
    assert.match(clean, /capability=/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap --json — vaultCensus 필드 노출 (R+ cycle 37)', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run(['bootstrap', repo, '--vault', vault, '--json']);
    assert.equal(r.code, 0);
    const data = JSON.parse(r.stdout);
    assert.ok(data.vaultCensus, 'vaultCensus 필드');
    assert.equal(typeof data.vaultCensus.total, 'number');
    assert.ok(data.vaultCensus.byKind, 'byKind 객체');
    assert.ok(data.vaultCensus.total >= 3, 'project + 2 capability 최소');
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap --skip-imports — labels row-level failures without slug or relation shape', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  const fakeMcp = join(vault, 'fake-mcp-bootstrap-row-labels.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'analyze_repo_structure') {",
      "    const payload = { rootPath: '/repo', framework: 'generic', project: { slug: 'demo', title: 'Demo' }, domains: [{ slug: 'domains/core', title: 'Core', evidence: { source: 'README.md' } }], capabilities: [], elements: [], suggestedRelations: [{ from: 'demo', to: 'domains/core', type: 'contains' }], skipped: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_concepts') {",
      "    const payload = { concepts: [{ ok: false, error: 'concepts[0] missing slug' }, { ok: true, slug: 'domains/core', filePath: '/tmp/domains/core.md', changed: true }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_relations') {",
      "    const payload = { relations: [{ ok: false, error: 'relations[0] missing source' }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['bootstrap', repo, '--vault', vault, '--skip-imports'], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /✗ concept concepts\[0\] — concepts\[0\] missing slug/);
    assert.match(clean, /✗ suggested relations\[0\] — relations\[0\] missing source/);
    assert.doesNotMatch(clean, /undefined/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap — fails closed when add_concepts response rows drift', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  const fakeMcp = join(vault, 'fake-mcp-bootstrap-concepts-drift.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'analyze_repo_structure') {",
      "    const payload = { rootPath: '/repo', framework: 'generic', project: { slug: 'demo', title: 'Demo' }, domains: [], capabilities: [], elements: [], suggestedRelations: [], skipped: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_concepts') {",
      "    const payload = { concepts: [{ slug: 'demo', ok: 'true' }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['bootstrap', repo, '--vault', vault], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /add_concepts\.concepts\[0\]\.ok must be a boolean/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap — fails closed when add_relations response rows drift', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  const fakeMcp = join(vault, 'fake-mcp-bootstrap-relations-drift.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.method === 'initialize') {",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {} }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'analyze_repo_structure') {",
      "    const payload = { rootPath: '/repo', framework: 'generic', project: { slug: 'demo', title: 'Demo' }, domains: [{ slug: 'domains/core', title: 'Core', evidence: { source: 'README.md' } }], capabilities: [], elements: [], suggestedRelations: [{ from: 'demo', to: 'domains/core', type: 'contains' }], skipped: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_concepts') {",
      "    const payload = { concepts: msg.params.arguments.concepts.map((concept) => ({ slug: concept.slug, ok: true, filePath: `/tmp/${concept.slug}.md`, changed: true })) };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "    return;",
      "  }",
      "  if (msg.params?.name === 'add_relations') {",
      "    const payload = { relations: [{ ok: true, from: 'demo', to: '', type: 'contains' }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['bootstrap', repo, '--vault', vault], {
      env: { OMOT_MCP_PATH: fakeMcp },
    });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /add_relations chunk @0\.relations\[0\]\.to must be a non-empty string/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('bootstrap 두번째 실행 — idempotent (errors 0)', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r1 = await run(['bootstrap', repo, '--vault', vault]);
    assert.equal(r1.code, 0);
    const r2 = await run(['bootstrap', repo, '--vault', vault]);
    assert.equal(r2.code, 0, `2nd run failed: ${r2.stdout}`);
    const clean = stripAnsi(r2.stdout);
    assert.match(clean, /already existed/);
    // errors 0 — 모든 행이 already exists / alreadyExists.
    assert.match(clean, /0 errors/);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

const skippedSuffix = skipped > 0 ? `, ${skipped} skipped` : '';
console.log(`\ncli integration: ${passed} passed, ${failed} failed${skippedSuffix}`);
if (TEST_NAME_PATTERN && passed === 0) {
  console.error(formatNoTestMatchMessage('cli', TEST_FILTER));
  process.exit(1);
}
if (failed > 0) process.exit(1);
