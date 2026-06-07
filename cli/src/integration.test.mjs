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
    name: 'ontology-atlas-cli',
    version: CLI_PKG.version,
  });
});

await test('command inventory — help and command modules stay aligned', async () => {
  const r = await run(['--help']);
  assert.equal(r.code, 0);
  const clean = stripAnsi(r.stdout);

  for (const command of CLI_COMMANDS) {
    assert.match(clean, new RegExp(`ontology-atlas ${command.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`));
  }
  assert.match(clean, /--prompt --graph-db-pack --verify-fallbacks/);
  assert.match(clean, /shell Graph DB pack/);

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
  assert.match(clean, /OATLAS_CLI_MCP_TIMEOUT_MS=N/);
  assert.match(clean, /longer one-shot MCP call window/);
});

await test('help <command> — delegates to focused subcommand usage and fails unknown topics on stderr', async () => {
  const compile = await run(['help', 'compile']);
  assert.equal(compile.code, 0);
  assert.equal(compile.stderr, '');
  assert.match(stripAnsi(compile.stdout), /Usage:\s+ontology-atlas compile/);
  assert.doesNotMatch(stripAnsi(compile.stdout), /AI-native codebase ontology workbench/);

  const init = await run(['help', 'init']);
  assert.equal(init.code, 0);
  assert.equal(init.stderr, '');
  assert.match(stripAnsi(init.stdout), /Usage:\s+ontology-atlas init \[folder\]/);

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
    assert.match(clean, /codex mcp add ontology-atlas/);
    assert.match(clean, /\.codex\/config\.toml/);
    assert.match(clean, /graph smoke/);
    assert.match(clean, /ontology-atlas analyze \. --vault \.\/ontology/);
    assert.match(clean, /ontology-atlas bootstrap \. --vault \.\/ontology/);
    assert.doesNotMatch(clean, /\/path\/to\/your\/repo/);

    const config = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8'));
    const server = config.mcpServers['ontology-atlas'];
    assert.equal(server.env.OATLAS_VAULT, './ontology');
    assert.equal(server.command, 'node');
    assert.match(server.args[0], /mcp\/src\/index\.js$/);

    const codexConfig = readFileSync(join(root, '.codex', 'config.toml'), 'utf-8');
    assert.match(codexConfig, /\[mcp_servers\.ontology-atlas\]/);
    assert.match(codexConfig, /command = "node"/);
    assert.match(codexConfig, /OATLAS_VAULT = "\.\/ontology"/);

    const vaultCodexConfig = readFileSync(join(root, 'ontology', '.codex', 'config.toml'), 'utf-8');
    assert.match(vaultCodexConfig, /OATLAS_VAULT = "\."/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-setup — writes agent configs for an existing vault without starter files', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-agent-setup-'));
  try {
    mkdirSync(join(root, 'ontology'), { recursive: true });
    const dryRun = await run(['agent-setup', 'ontology', '--root', '.', '--json'], { cwd: root });
    assert.equal(dryRun.code, 1);
    const dryRunData = JSON.parse(dryRun.stdout);
    assert.equal(dryRunData.operation, 'agent_setup');
    assert.equal(dryRunData.sideEffect, false);
    assert.equal(dryRunData.summary.missing, 4);
    assert.equal(existsSyncTest(join(root, '.mcp.json')), false);
    assert.equal(existsSyncTest(join(root, 'ontology', '.mcp.json')), false);

    const write = await run(['agent-setup', 'ontology', '--root', '.', '--write', '--json'], { cwd: root });
    assert.equal(write.code, 0, write.stderr);
    const data = JSON.parse(write.stdout);
    assert.equal(data.sideEffect, true);
    assert.equal(data.summary.ready, 4);
    assert.equal(data.summary.written, 4);
    assert.match(data.commands.setupState, /agent-setup .* --root .* --json/);
    assert.match(data.commands.setupRepair, /agent-setup .* --root .* --write/);
    assert.match(data.commands.restartGuidance, /Restart Claude Code, Cursor, or Codex from .* after repair/);
    assert.match(data.commands.setupGate, /agent-brief .* --verify-fallbacks --json/);
    assert.deepEqual(
      data.commands.graphRunbook.map((command) => command.replace(data.vaultRoot, '<vault>')),
      [
        'ontology-atlas validate <vault>',
        'ontology-atlas mcp-verify <vault> --timeout-ms 15000',
        'ontology-atlas agent-brief <vault> --verify-fallbacks',
        'ontology-atlas workspace-brief <vault>',
        'ontology-atlas agent-brief <vault> --prompt',
        'ontology-atlas agent-brief <vault> --graph-db-pack',
        'ontology-atlas hubs <vault> --plan --limit 10 --types depends_on,relates',
        'ontology-atlas hubs <vault> --limit 10 --types depends_on,relates',
      ],
    );
    assert.equal(data.docs.workflowGuide, 'docs/AGENT-GRAPH-WORKFLOW.md');
    assert.match(data.docs.workflowGuideDescription, /CLI-only/);
    assert.deepEqual(data.docs.modeComparison.map((mode) => mode.id), [
      'cli_only',
      'mcp_connected',
      'graph_db_pack',
      'setup_gate',
    ]);
    assert.match(data.docs.modeComparison.find((mode) => mode.id === 'mcp_connected').gives, /structured repair fields/);
    assert.match(data.docs.modeComparison.find((mode) => mode.id === 'graph_db_pack').gives, /proof follow-ups/);
    assert.deepEqual(data.docs.firstContactProofContract.map((proof) => proof.id), [
      'config_state',
      'mcp_verify',
      'json_gate',
      'graph_briefs',
    ]);
    assert.match(data.docs.firstContactProofContract.find((proof) => proof.id === 'config_state').proves, /root-specific/);
    assert.match(data.docs.firstContactProofContract.find((proof) => proof.id === 'mcp_verify').proves, /24 tools/);
    assert.match(data.docs.firstContactProofContract.find((proof) => proof.id === 'json_gate').proves, /ok\/performanceOk/);
    assert.match(data.docs.firstContactProofContract.find((proof) => proof.id === 'graph_briefs').proves, /workspace-brief/);

    const rootMcp = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8'));
    assert.equal(rootMcp.mcpServers['ontology-atlas'].env.OATLAS_VAULT, './ontology');
    const vaultMcp = JSON.parse(readFileSync(join(root, 'ontology', '.mcp.json'), 'utf-8'));
    assert.equal(vaultMcp.mcpServers['ontology-atlas'].env.OATLAS_VAULT, '.');

    const rootCodex = readFileSync(join(root, '.codex', 'config.toml'), 'utf-8');
    assert.match(rootCodex, /OATLAS_VAULT = "\.\/ontology"/);
    const vaultCodex = readFileSync(join(root, 'ontology', '.codex', 'config.toml'), 'utf-8');
    assert.match(vaultCodex, /OATLAS_VAULT = "\."/);

    assert.equal(readdirSync(join(root, 'ontology')).filter((name) => name.endsWith('.md')).length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-setup — terminal output points humans to the workflow guide', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-agent-setup-guide-'));
  try {
    mkdirSync(join(root, 'ontology'), { recursive: true });
    const r = await run(['agent-setup', 'ontology', '--root', '.'], { cwd: root });
    assert.equal(r.code, 1);
    assert.match(stripAnsi(r.stdout), /ontology-atlas agent-setup .*ontology.* --root .* --json/);
    assert.match(stripAnsi(r.stdout), /Feature guide: docs\/AGENT-GRAPH-WORKFLOW\.md/);
    assert.match(stripAnsi(r.stdout), /Read-first graph runbook:/);
    assert.match(stripAnsi(r.stdout), /ontology-atlas workspace-brief .*ontology/);
    assert.match(stripAnsi(r.stdout), /ontology-atlas agent-brief .*ontology.* --graph-db-pack/);
    assert.match(stripAnsi(r.stdout), /ontology-atlas hubs .*ontology.* --plan --limit 10 --types depends_on,relates/);
    assert.match(stripAnsi(r.stdout), /Repair missing configs only if needed: ontology-atlas agent-setup .*ontology.* --root .* --write/);
    assert.match(stripAnsi(r.stdout), /Restart Claude Code, Cursor, or Codex from .* after repair/);
    assert.match(stripAnsi(r.stdout), /Mode guide:/);
    assert.match(stripAnsi(r.stdout), /MCP-connected — direct read\/write tools/);
    assert.match(stripAnsi(r.stdout), /graph DB differences/);
    assert.match(stripAnsi(r.stdout), /First-contact proof contract:/);
    assert.match(stripAnsi(r.stdout), /Config state — agent-setup --json reports root-specific/);
    assert.match(stripAnsi(r.stdout), /MCP verify — mcp-verify can boot the local MCP server/);
    assert.match(stripAnsi(r.stdout), /JSON setup gate — agent-brief --verify-fallbacks --json returns ok\/performanceOk/);
    assert.match(stripAnsi(r.stdout), /Graph briefs — workspace-brief and agent-brief --graph-db-pack/);
    assert.match(stripAnsi(r.stdout), /After code changes:/);
    assert.match(stripAnsi(r.stdout), /sync docs\/ontology before finishing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-activity — writes, shows, and clears the live heartbeat file', async () => {
  const root = withVault([]);
  try {
    const write = await run([
      'agent-activity',
      root,
      '--agent',
      'codex',
      '--state',
      'editing',
      '--focus',
      'Implement live activity CLI',
      '--ontology-slug',
      'capabilities/agent-live-activity-contract',
      '--file',
      'cli/src/commands/agent-activity.mjs',
      '--file',
      'src/views/ontology-view/ui/parts/AgentStatusPopover.tsx',
      '--plan',
      'run focused tests',
      '--mcp',
      'validate_vault',
      '--codegraph',
      'codegraph_context cli agent activity',
      '--verify',
      'pnpm integration:cli:entry',
      '--updated-at',
      '2026-06-06T06:00:00.000Z',
      '--json',
    ]);
    assert.equal(write.code, 0, `stdout: ${write.stdout}\nstderr: ${write.stderr}`);
    assert.equal(write.stderr, '');
    const data = JSON.parse(write.stdout);
    assert.equal(data.operation, 'agent_activity');
    assert.equal(data.sideEffect, true);
    assert.equal(data.path, '.ontology-atlas/agent-activity.json');
    assert.equal(data.heartbeat.agent, 'codex');
    assert.equal(data.heartbeat.state, 'editing');
    assert.equal(data.heartbeat.focus.summary, 'Implement live activity CLI');
    assert.equal(data.heartbeat.focus.ontologySlug, 'capabilities/agent-live-activity-contract');
    assert.equal(data.reviewMode, 'ontology-focus');
    assert.deepEqual(data.reviewTarget, {
      kind: 'ontology',
      ontologySlug: 'capabilities/agent-live-activity-contract',
      files: [
        'cli/src/commands/agent-activity.mjs',
        'src/views/ontology-view/ui/parts/AgentStatusPopover.tsx',
      ],
      label: 'ontology · capabilities/agent-live-activity-contract',
    });
    assert.deepEqual(data.proof, {
      count: 3,
      sources: {
        mcp: 1,
        codegraph: 1,
        verification: 1,
      },
      label: 'MCP · 1, CodeGraph · 1, Verify · 1',
    });
    assert.deepEqual(data.heartbeat.focus.files, [
      'cli/src/commands/agent-activity.mjs',
      'src/views/ontology-view/ui/parts/AgentStatusPopover.tsx',
    ]);
    assert.deepEqual(data.heartbeat.plan, ['run focused tests']);
    assert.deepEqual(data.heartbeat.evidence.mcp, ['validate_vault']);
    assert.deepEqual(data.heartbeat.evidence.codegraph, ['codegraph_context cli agent activity']);
    assert.deepEqual(data.heartbeat.evidence.verification, ['pnpm integration:cli:entry']);

    const onDisk = JSON.parse(
      readFileSync(join(root, '.ontology-atlas', 'agent-activity.json'), 'utf-8'),
    );
    assert.deepEqual(onDisk, data.heartbeat);

    const show = await run(['agent-activity', root, '--show', '--json']);
    assert.equal(show.code, 0);
    const shown = JSON.parse(show.stdout);
    assert.equal(shown.heartbeat.focus.summary, 'Implement live activity CLI');
    assert.equal(shown.reviewMode, 'ontology-focus');
    assert.equal(shown.stale, true);
    assert.equal(typeof shown.ageMs, 'number');
    assert.ok(shown.ageMs > 5 * 60 * 1000);
    assert.deepEqual(shown.reviewTarget, data.reviewTarget);
    assert.deepEqual(shown.proof, data.proof);

    const humanShow = await run(['agent-activity', root, '--show']);
    assert.equal(humanShow.code, 0);
    assert.match(stripAnsi(humanShow.stdout), /freshness · stale/);
    assert.match(stripAnsi(humanShow.stdout), /review mode · ontology-focus/);
    assert.match(stripAnsi(humanShow.stdout), /review target kind · ontology/);
    assert.match(
      stripAnsi(humanShow.stdout),
      /review target · ontology · capabilities\/agent-live-activity-contract/,
    );
    assert.match(stripAnsi(humanShow.stdout), /proof · MCP · 1, CodeGraph · 1, Verify · 1/);

    const sourceOnlyWrite = await run([
      'agent-activity',
      root,
      '--agent',
      'codex',
      '--state',
      'editing',
      '--focus',
      'Extract product meaning from source changes',
      '--file',
      '  cli/src/commands/agent-activity.mjs  ',
      '--json',
    ]);
    assert.equal(sourceOnlyWrite.code, 0);
    const sourceOnlyData = JSON.parse(sourceOnlyWrite.stdout);
    assert.equal(sourceOnlyData.reviewMode, 'business-extraction');
    assert.deepEqual(sourceOnlyData.reviewTarget, {
      kind: 'source',
      ontologySlug: null,
      files: ['cli/src/commands/agent-activity.mjs'],
      label: 'source · cli/src/commands/agent-activity.mjs',
    });

    const humanSourceOnlyWrite = await run([
      'agent-activity',
      root,
      '--agent',
      'codex',
      '--state',
      'editing',
      '--focus',
      'Extract product meaning from source changes',
      '--file',
      'cli/src/commands/agent-activity.mjs',
    ]);
    assert.equal(humanSourceOnlyWrite.code, 0);
    assert.match(stripAnsi(humanSourceOnlyWrite.stdout), /review mode · business-extraction/);
    assert.match(stripAnsi(humanSourceOnlyWrite.stdout), /review target kind · source/);
    assert.match(
      stripAnsi(humanSourceOnlyWrite.stdout),
      /review target · source · cli\/src\/commands\/agent-activity\.mjs/,
    );

    const clear = await run(['agent-activity', root, '--clear', '--json']);
    assert.equal(clear.code, 0);
    assert.equal(JSON.parse(clear.stdout).cleared, true);
    assert.equal(existsSyncTest(join(root, '.ontology-atlas', 'agent-activity.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-activity — validates write mode before touching the vault', async () => {
  const root = withVault([]);
  try {
    const missing = await run(['agent-activity', root, '--state', 'editing', '--json']);
    assert.equal(missing.code, 1);
    assert.equal(missing.stdout, '');
    assert.match(stripAnsi(missing.stderr), /--agent is required/);

    const typo = await run(['agent-activity', root, '--agent', 'codex', '--state', 'edting']);
    assert.equal(typo.code, 1);
    assert.match(stripAnsi(typo.stderr), /--state must be one of/);
    assert.equal(existsSyncTest(join(root, '.ontology-atlas', 'agent-activity.json')), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-activity — show reports invalid sidecars as invalid activity', async () => {
  const root = withVault([]);
  try {
    mkdirSync(join(root, '.ontology-atlas'), { recursive: true });
    const activityPath = join(root, '.ontology-atlas', 'agent-activity.json');
    writeFileSync(activityPath, '{ nope', 'utf-8');

    const json = await run(['agent-activity', root, '--show', '--json']);
    assert.equal(json.code, 0);
    const data = JSON.parse(json.stdout);
    assert.equal(data.exists, true);
    assert.equal(data.valid, false);
    assert.equal(data.heartbeat, null);
    assert.equal(data.reviewMode, 'none');
    assert.equal(data.reviewTarget.kind, 'none');
    assert.match(data.errorMessage, /invalid activity heartbeat/i);

    const human = await run(['agent-activity', root, '--show']);
    assert.equal(human.code, 0);
    assert.match(stripAnsi(human.stdout), /invalid activity heartbeat/);
    assert.doesNotMatch(stripAnsi(human.stdout), /review target ·/);

    writeFileSync(
      activityPath,
      JSON.stringify({
        agent: 'codex',
        state: 'edting',
        focus: { ontologySlug: 'capabilities/agent-live-activity-contract' },
        plan: [],
        evidence: {},
        updatedAt: '2026-06-06T06:00:00.000Z',
      }),
      'utf-8',
    );

    const invalidShape = await run(['agent-activity', root, '--show', '--json']);
    assert.equal(invalidShape.code, 0);
    const invalidShapeData = JSON.parse(invalidShape.stdout);
    assert.equal(invalidShapeData.valid, false);
    assert.equal(invalidShapeData.heartbeat, null);
    assert.equal(invalidShapeData.reviewMode, 'none');
    assert.equal(invalidShapeData.reviewTarget.kind, 'none');
    assert.match(invalidShapeData.errorMessage, /state is invalid/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-setup — preserves stale configs and writes merge templates', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-agent-stale-'));
  try {
    mkdirSync(join(root, 'ontology'), { recursive: true });
    writeFileSync(
      join(root, '.mcp.json'),
      JSON.stringify({ mcpServers: { other: { command: 'node', args: [] } } }, null, 2),
    );
    mkdirSync(join(root, '.codex'), { recursive: true });
    writeFileSync(join(root, '.codex', 'config.toml'), '[mcp_servers.other]\ncommand = "node"\nargs = []\n');

    const r = await run(['agent-setup', 'ontology', '--root', '.', '--write', '--json'], { cwd: root });
    assert.equal(r.code, 1);
    const data = JSON.parse(r.stdout);
    assert.equal(data.summary.review, 2);
    assert.equal(data.summary.examples, 2);
    assert.ok(data.docs.postChangeSync.some((line) => line.includes('sync docs/ontology before finishing')));
    assert.equal(JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8')).mcpServers.other.command, 'node');
    assert.equal(existsSyncTest(join(root, '.mcp.json.example')), true);
    assert.equal(existsSyncTest(join(root, '.codex', 'config.toml.example')), true);
    assert.equal(existsSyncTest(join(root, 'ontology', '.mcp.json')), true);
    assert.equal(existsSyncTest(join(root, 'ontology', '.codex', 'config.toml')), true);
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

await test('init — rejects invalid OATLAS_MCP_PATH overrides before writing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'cli-init-mcp-path-'));
  try {
    const missingPath = join(root, 'missing-mcp-entry.js');
    const missing = await run(['init', 'ontology'], {
      cwd: root,
      env: { OATLAS_MCP_PATH: missingPath },
    });
    assert.equal(missing.code, 2);
    assert.equal(missing.stdout, '');
    assert.match(stripAnsi(missing.stderr), /OATLAS_MCP_PATH does not exist/);
    assert.equal(existsSyncTest(join(root, 'ontology')), false);

    const directory = await run(['init', 'ontology'], {
      cwd: root,
      env: { OATLAS_MCP_PATH: root },
    });
    assert.equal(directory.code, 2);
    assert.equal(directory.stdout, '');
    assert.match(stripAnsi(directory.stderr), /OATLAS_MCP_PATH is not a file/);
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
    assert.match(clean, /neighbors — elements\/example-element/);
    assert.match(clean, /path — elements\/example-element → project \(1 hop, 1 edge\)/);
    assert.match(clean, /project_scope/);
    assert.match(clean, /destructive dry-runs — rename_concept · merge_concepts · delete_concept preview without write-maintenance/);
    assert.match(clean, /all_paths — elements\/example-element → project/);
    assert.match(clean, /structuredContent — direct 16\/16, write 5\/5 \(batch row-isolation 2\/2, batch no-write metadata 2\/2, destructive dry-run 3\/3\), maintenance 3\/3, graph 13\/13/);
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
    assert.match(clean, /all_paths — core → project/);
    assert.match(clean, /structuredContent — direct 16\/16, write 5\/5 \(batch row-isolation 2\/2, batch no-write metadata 2\/2, destructive dry-run 3\/3\), maintenance 3\/3, graph 13\/13/);
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

await test('mcp-verify — fails an empty vault folder with a populated-vault hint', async () => {
  const root = withVault([]);
  try {
    const r = await run(['mcp-verify', root, '--timeout-ms', '3000']);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /vault total 0 nodes/);
    assert.match(clean, /verify vault has 0 ontology nodes/);
    assert.match(clean, /Point verify at a populated ontology vault/);
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
  assert.match(clean, /tools\/list inventory names, tools\/list schema strictness, and annotation coverage/);
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
  assert.match(clean, /neighbors\/node-to-project path\/all_paths\/project_scope graph-query smoke/);
  assert.match(clean, /tools\/list inventory names, tools\/list schema strictness/);
  assert.match(clean, /annotation coverage \(title\/read\/write\/destructive\/idempotent\/local-only\)/);
  assert.match(clean, /destructive writer dry-runs with every planned response present and no changed\/postWriteMaintenance/);
  assert.match(clean, /patch_concept stale expected_mtime conflict guard rejection with vault_conflict/);
  assert.match(clean, /structuredContent coverage split by direct reads \/ batch row-isolation writes with no write metadata \/ destructive dry-runs \/ maintenance cursor checks \/ graph queries/);
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
  assert.match(
    clean,
    /pnpm dogfood:compile-fix\s+Root checkout dogfood vault compile --fix idempotence gate; changed vaults need pnpm docs-vault:build; success ends with \[dogfood:compile-fix\] docs\/ontology unchanged/,
  );
  assert.match(clean, /pnpm test:dogfood:args\s+Narrow dogfood shortcut argument helper contract/);
  assert.match(clean, /pnpm test:dogfood:script-refs\s+Narrow help\/package-script reference \+ focused filter parser\/wrapper summary contract/);
  assert.match(clean, /pnpm test:dogfood:compile-fix\s+Narrow dogfood compile --fix idempotence runner contract/);
  assert.match(clean, /pnpm test:mcp:registration\s+Narrow source-checkout .mcp.json\/.mcp.json.example\/.codex\/config.toml registration template contract/);
  assert.match(clean, /pnpm dogfood:health\s+Root checkout dogfood vault health gate/);
  assert.match(clean, /pnpm dogfood:brief\s+Root checkout dogfood vault workspace_brief snapshot/);
  assert.match(clean, /pnpm dogfood:growth\s+Root checkout dogfood vault growth_plan JSON snapshot/);
  assert.match(clean, /pnpm dogfood:maintenance\s+Root checkout dogfood vault maintenance_plan JSON snapshot/);
  assert.match(clean, /pnpm dogfood:graph-db\s+Root checkout dogfood vault graph DB pack runtime gate/);
  assert.match(
    clean,
    /pnpm dogfood:status\s+Root checkout dogfood vault human-readable health \+ brief \+ agent handoff \+ maintenance; ends with \[dogfood:status\] health:N · workspace-brief:N · agent-brief:N · maintenance:N and focused hints before pnpm dogfood:verify on failure/,
  );
  assert.match(clean, /pnpm test:dogfood:status\s+Narrow dogfood status shortcut runner contract/);
  assert.match(clean, /pnpm test:dogfood:graph-db\s+Narrow dogfood graph DB pack runner contract/);
  assert.match(clean, /pnpm dogfood:verify\s+Root checkout dogfood vault verify shortcut/);
  assert.match(clean, /pnpm cli:mcp-verify docs\/ontology --timeout-ms 15000\s+Source-checkout dogfood verify with explicit args/);
  assert.match(clean, /pnpm cli:mcp-verify -- --help\s+Source-checkout shortcut for this help from the repo root/);
  assert.match(clean, /pnpm test:mcp:verify\s+MCP verify helper contract without the full integration suite/);
  assert.match(clean, /pnpm test:mcp:verify:first-contact\s+Narrow first-contact initialize-tool-inventory\/initialize-safety-recovery\/unknown-tool\/write-safety\/health-summary\/advisory\/read\/sample-shape helper gates/);
  assert.match(clean, /pnpm test:mcp:verify:timeout/);
  assert.match(clean, /Narrow MCP verify timeout\/startup\/help\/empty-vault diagnostics/);
  assertPnpmScriptsExist(clean, ROOT_PKG.scripts);
});

await test('mcp-verify — rejects invalid timeout values', async () => {
  const r = await run(['mcp-verify', '--timeout-ms', 'nope']);
  assert.equal(r.code, 1);
  assert.match(stripAnsi(r.stderr), /--timeout-ms must be a positive integer/);
  assert.match(stripAnsi(r.stderr), /Received: "nope"/);
  assert.match(stripAnsi(r.stderr), /--timeout-ms N/);
  assert.match(stripAnsi(r.stderr), /OATLAS_VERIFY_TIMEOUT_MS=N/);
  assert.match(stripAnsi(r.stderr), /ontology-atlas mcp-verify --timeout-ms 15000/);

  const partial = await run(['mcp-verify', '--timeout-ms=1000ms']);
  assert.equal(partial.code, 1);
  assert.match(stripAnsi(partial.stderr), /--timeout-ms must be a positive integer/);
  assert.match(stripAnsi(partial.stderr), /Received: "1000ms"/);
  assert.match(stripAnsi(partial.stderr), /--timeout-ms N/);
  assert.match(stripAnsi(partial.stderr), /OATLAS_VERIFY_TIMEOUT_MS=N/);
  assert.match(stripAnsi(partial.stderr), /ontology-atlas mcp-verify --timeout-ms 15000/);

  const explicitVault = await run(['mcp-verify', 'ontology', '--timeout-ms=1000ms']);
  assert.equal(explicitVault.code, 1);
  assert.match(stripAnsi(explicitVault.stderr), /--timeout-ms must be a positive integer/);
  assert.match(stripAnsi(explicitVault.stderr), /Received: "1000ms"/);
  assert.match(stripAnsi(explicitVault.stderr), /ontology-atlas mcp-verify --vault ontology --timeout-ms 15000/);

  const explicitVaultFlag = await run(['mcp-verify', '--vault', 'ontology', '--timeout-ms=1000ms']);
  assert.equal(explicitVaultFlag.code, 1);
  assert.match(stripAnsi(explicitVaultFlag.stderr), /ontology-atlas mcp-verify --vault ontology --timeout-ms 15000/);

  const missing = await run(['mcp-verify', '--timeout-ms']);
  assert.equal(missing.code, 1);
  assert.match(stripAnsi(missing.stderr), /--timeout-ms requires a value/);
  assert.match(stripAnsi(missing.stderr), /Received: undefined/);
  assert.match(stripAnsi(missing.stderr), /ontology-atlas mcp-verify --timeout-ms 15000/);

  const nextFlag = await run(['mcp-verify', '--timeout-ms', '--vault', 'ontology']);
  assert.equal(nextFlag.code, 1);
  assert.match(stripAnsi(nextFlag.stderr), /--timeout-ms requires a value/);
  assert.match(stripAnsi(nextFlag.stderr), /Received: "--vault"/);
  assert.match(stripAnsi(nextFlag.stderr), /ontology-atlas mcp-verify --vault ontology --timeout-ms 15000/);

  const envTimeout = await run(['mcp-verify', 'ontology'], {
    env: { OATLAS_VERIFY_TIMEOUT_MS: '1000ms' },
  });
  assert.equal(envTimeout.code, 1);
  assert.match(stripAnsi(envTimeout.stderr), /OATLAS_VERIFY_TIMEOUT_MS must be a positive integer/);
  assert.match(stripAnsi(envTimeout.stderr), /Received: "1000ms"/);
  assert.match(stripAnsi(envTimeout.stderr), /ontology-atlas mcp-verify --vault ontology --timeout-ms 15000/);
  assert.doesNotMatch(stripAnsi(envTimeout.stderr), /npm run verify -- --timeout-ms 15000/);

  const envKillGrace = await run(['mcp-verify', 'ontology'], {
    env: { OATLAS_VERIFY_KILL_GRACE_MS: '1000ms' },
  });
  assert.equal(envKillGrace.code, 1);
  assert.match(stripAnsi(envKillGrace.stderr), /OATLAS_VERIFY_KILL_GRACE_MS must be a positive integer/);
  assert.match(stripAnsi(envKillGrace.stderr), /Received: "1000ms"/);
  assert.match(stripAnsi(envKillGrace.stderr), /Set OATLAS_VERIFY_KILL_GRACE_MS=N/);

  const envTimeoutOverridden = await run(['mcp-verify', 'ontology', '--timeout-ms', '1000'], {
    env: { OATLAS_VERIFY_TIMEOUT_MS: '1000ms' },
  });
  assert.notEqual(envTimeoutOverridden.code, 1);
  assert.doesNotMatch(stripAnsi(envTimeoutOverridden.stderr), /OATLAS_VERIFY_TIMEOUT_MS must be a positive integer/);

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
    'process.stderr.write(`retry=${process.env.OATLAS_VERIFY_RETRY_EXAMPLE}\\n`); process.exit(1);',
    'utf-8',
  );

  const r = await run(['mcp-verify', vaultWithSpace], {
    env: { OATLAS_MCP_VERIFY_PATH: verifyScript },
  });

  assert.equal(r.code, 1);
  assert.match(stripAnsi(r.stderr), /retry=ontology-atlas mcp-verify --vault '.+vault with space' --timeout-ms 15000/);
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
      OATLAS_MCP_VERIFY_PATH: verifyScript,
      OATLAS_VERIFY_KILL_GRACE_MS: '25',
    },
  });

  assert.equal(r.code, 1);
  assert.ok(Date.now() - started < 1000, 'wrapper should fail closed without hanging the integration suite');
  assert.match(stripAnsi(r.stderr), /MCP verify wrapper timed out after 50ms/);
  assert.match(stripAnsi(r.stderr), /Check OATLAS_MCP_VERIFY_PATH/);
  assert.match(stripAnsi(r.stderr), /increase --timeout-ms \/ OATLAS_VERIFY_TIMEOUT_MS/);
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
    env: { OATLAS_MCP_VERIFY_PATH: verifyScript },
  });

  assert.equal(r.code, 1);
  assert.match(stripAnsi(r.stderr), /verify script signal/);
  assert.match(stripAnsi(r.stderr), /MCP verify script terminated by SIGTERM/);
  assert.match(stripAnsi(r.stderr), /Check OATLAS_MCP_VERIFY_PATH/);
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
    env: { OATLAS_MCP_VERIFY_PATH: join(tmpdir(), 'missing-ontology-atlas-verify-script.mjs') },
  });
  assert.equal(missing.code, 2);
  assert.match(stripAnsi(missing.stderr), /OATLAS_MCP_VERIFY_PATH does not exist/);

  const directory = await run(['mcp-verify', 'docs/ontology'], {
    env: { OATLAS_MCP_VERIFY_PATH: tmpdir() },
  });
  assert.equal(directory.code, 2);
  assert.match(stripAnsi(directory.stderr), /OATLAS_MCP_VERIFY_PATH is not a file/);
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
    const r = await run(['compile', root, '--fix'], { env: { OATLAS_MCP_PATH: fakeMcp } });
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
    const r = await run(['compile', root, '--fix'], { env: { OATLAS_MCP_PATH: fakeMcp } });
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
      "    appendFileSync(process.env.OATLAS_FAKE_MCP_CALLS, `${msg.params.name}\\n`);",
      "    const payload = { graphHash: 'hash', nodeCount: 1, edgeCount: 0, issueCount: 0, unresolvedEdgeCount: 0, canonicalizationActionCount: '1', canonicalizationActions: [{ slug: 'project', keys: ['contains'], frontmatter: { contains: ['domains/graph'] }, expected_mtime: 1 }], summary: { nodes: 1, edges: 0, issues: 0, unresolvedEdges: 0, graphHash: 'hash', resolvedEdges: 0, externalEdges: 0 } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['compile', root, '--fix'], {
      env: { OATLAS_MCP_PATH: fakeMcp, OATLAS_FAKE_MCP_CALLS: callsLog },
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
      "    appendFileSync(process.env.OATLAS_FAKE_MCP_CALLS, `${msg.params.name}\\n`);",
      "    const payload = { graphHash: 'hash', nodeCount: 1, edgeCount: 0, issueCount: 0, unresolvedEdgeCount: 0, canonicalizationActionCount: 1, canonicalizationActions: [{ slug: '', keys: ['domains'], frontmatter: {}, expected_mtime: 1 }], summary: { nodes: 1, edges: 0, issues: 0, unresolvedEdges: 0, graphHash: 'hash', resolvedEdges: 0, externalEdges: 0 } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['compile', root, '--fix'], {
      env: { OATLAS_MCP_PATH: fakeMcp, OATLAS_FAKE_MCP_CALLS: callsLog },
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
      "    appendFileSync(process.env.OATLAS_FAKE_MCP_CALLS, `${msg.params.name}\\n`);",
      "    const payload = { graphHash: 'hash', nodeCount: 1, edgeCount: 0, issueCount: 0, unresolvedEdgeCount: 0, canonicalizationActionCount: 1, canonicalizationActions: [{ slug: 'project', keys: ['capabilities'], frontmatter: { title: 'Changed', capabilities: ['capabilities/a'] }, expected_mtime: 1 }], summary: { nodes: 1, edges: 0, issues: 0, unresolvedEdges: 0, graphHash: 'hash', resolvedEdges: 0, externalEdges: 0 } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['compile', root, '--fix'], {
      env: { OATLAS_MCP_PATH: fakeMcp, OATLAS_FAKE_MCP_CALLS: callsLog },
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
  assert.match(stripAnsi(longHelp.stdout), /ontology-atlas compile \[vault\]/);
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
    const r = await run(['backlinks', 'capabilities/foo', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
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
    const r = await run(['path', 'a', 'b', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /find_path response edges length must match hops length/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('explain — renders direct edges, shortest path, and common neighbors', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'explain',
      'capabilities/bar',
      'capabilities/foo',
      root,
      '--types=relates,domain',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /explain_relation capabilities\/bar — Bar → capabilities\/foo — Foo/);
    assert.match(clean, /verdict direct/);
    assert.match(clean, /domains domains\/auth → domains\/auth · same=true/);
    assert.match(clean, /DIRECT EDGES 1\/1/);
    assert.match(clean, /capabilities\/bar --relates--> capabilities\/foo/);
    assert.match(clean, /SHORTEST PATH 1 hop/);
    assert.match(clean, /COMMON NEIGHBORS 1\/1/);
    assert.match(clean, /domains\/auth — Auth/);
    assert.match(clean, /next relation capabilities\/bar → capabilities\/foo/);
    assert.match(clean, /explanation is evidence, not write approval; run path and preflight before changing graph/);
    assert.match(clean, /ontology-atlas path capabilities\/bar capabilities\/foo \[vault\] --max-hops 5/);
    assert.match(clean, /ontology-atlas match-edges \[vault\] --from capabilities\/bar --to capabilities\/foo --types relates,domain --limit 10/);
    assert.match(clean, /ontology-atlas relation-check capabilities\/bar capabilities\/foo relates \[vault\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('explain --json — exposes raw explain_relation contract', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'explain',
      'capabilities/bar',
      'capabilities/foo',
      root,
      '--max-hops=3',
      '--limit=5',
      '--json',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'explain_relation');
    assert.equal(data.verdict, 'direct');
    assert.equal(data.direct.total, 1);
    assert.equal(data.shortestPath.found, true);
    assert.equal(data.shortestPath.maxHops, 3);
    assert.equal(data.commonNeighbors.total, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('explain --json — unrelated verdict exits non-zero with evidence payload', async () => {
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
    const r = await run(['explain', 'capabilities/a', 'capabilities/b', root, '--json']);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'explain_relation');
    assert.equal(data.verdict, 'unrelated_within_hops');
    assert.equal(data.shortestPath.found, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('explain --json — fails closed on malformed explain_relation payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-explain-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { operation: 'explain_relation', from: 'a', to: 'b', fromNode: { slug: 'a', kind: 'capability', title: 'A' }, toNode: { slug: 'b', kind: 'capability', title: 'B' }, verdict: 'path', domains: { from: null, to: null, sameDomain: false }, direct: { total: 0, edges: [] }, shortestPath: { found: true, direction: 'undirected', maxHops: 5, hopCount: 1, hops: ['a', 'b'], nodes: [{ slug: 'a', kind: 'capability', title: 'A' }, { slug: 'b', kind: 'capability', title: 'B' }], edges: [] }, commonNeighbors: { total: 0, limited: false, rows: [] } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['explain', 'a', 'b', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /explain_relation shortestPath has an invalid path shape/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('all-paths — bounded alternatives with completeness evidence', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'all-paths',
      'capabilities/bar',
      'capabilities/foo',
      root,
      '--max-hops=3',
      '--limit=5',
      '--search-budget=1000',
      '--types=relates',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /all_paths maxHops=3 limit=5 searchBudget=1000/);
    assert.match(clean, /evidence complete/);
    assert.match(clean, /pathsComplete=true/);
    assert.match(clean, /totalPathsExact=true/);
    assert.match(clean, /capabilities\/bar — Bar/);
    assert.match(clean, /capabilities\/foo — Foo/);
    assert.match(clean, /via relates/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('all-paths --json — exposes raw all_paths completeness contract', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'all-paths',
      'capabilities/bar',
      'capabilities/foo',
      root,
      '--max-hops',
      '3',
      '--limit',
      '5',
      '--search-budget',
      '1000',
      '--json',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'all_paths');
    assert.equal(data.found, true);
    assert.equal(data.limit, 5);
    assert.equal(data.searchBudget, 1000);
    assert.equal(data.totalPathsExact, true);
    assert.equal(data.evidence.pathsComplete, true);
    assert.ok(Array.isArray(data.paths));
    assert.ok(data.paths.length >= 1);
    assert.ok(Array.isArray(data.paths[0].nodes));
    assert.ok(Array.isArray(data.paths[0].edges));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('all-paths --plan — blocks expensive enumeration unless forced', async () => {
  const root = withVault([
    {
      slug: 'capabilities/start',
      content: [
        '---',
        'kind: capability',
        'slug: capabilities/start',
        'title: Start',
        `dependencies: [${Array.from({ length: 20 }, (_, index) => `capabilities/mid-${index}`).join(', ')}]`,
        '---',
        '',
        '# Start',
      ].join('\n'),
    },
    {
      slug: 'capabilities/target',
      content: '---\nkind: capability\nslug: capabilities/target\ntitle: Target\n---\n\n# Target\n',
    },
    ...Array.from({ length: 20 }, (_, index) => ({
      slug: `capabilities/mid-${index}`,
      content: `---\nkind: capability\nslug: capabilities/mid-${index}\ntitle: Mid ${index}\ndependencies: [capabilities/target]\n---\n\n# Mid ${index}\n`,
    })),
  ]);
  try {
    const planned = await run([
      'all-paths',
      'capabilities/start',
      'capabilities/target',
      root,
      '--plan',
      '--max-hops=4',
      '--limit=100',
    ]);
    assert.equal(planned.code, 1, `stdout: ${planned.stdout}\nstderr: ${planned.stderr}`);
    const clean = stripAnsi(planned.stdout);
    assert.match(clean, /query_plan narrow/);
    assert.match(clean, /strategy=bounded_path_enumeration/);
    assert.match(clean, /skipped enumeration blocked by query_plan/);
    assert.doesNotMatch(clean, /#1/);

    const forced = await run([
      'all-paths',
      'capabilities/start',
      'capabilities/target',
      root,
      '--plan',
      '--force',
      '--max-hops=4',
      '--limit=100',
    ]);
    assert.equal(forced.code, 0, `stdout: ${forced.stdout}\nstderr: ${forced.stderr}`);
    const forcedClean = stripAnsi(forced.stdout);
    assert.match(forcedClean, /query_plan narrow/);
    assert.match(forcedClean, /all_paths maxHops=4 limit=100/);
    assert.match(forcedClean, /#1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('all-paths --plan --json — returns plan-only skipped payload for expensive traversals', async () => {
  const root = withVault([
    {
      slug: 'capabilities/start',
      content: [
        '---',
        'kind: capability',
        'slug: capabilities/start',
        'title: Start',
        `dependencies: [${Array.from({ length: 20 }, (_, index) => `capabilities/mid-${index}`).join(', ')}]`,
        '---',
        '',
        '# Start',
      ].join('\n'),
    },
    {
      slug: 'capabilities/target',
      content: '---\nkind: capability\nslug: capabilities/target\ntitle: Target\n---\n\n# Target\n',
    },
    ...Array.from({ length: 20 }, (_, index) => ({
      slug: `capabilities/mid-${index}`,
      content: `---\nkind: capability\nslug: capabilities/mid-${index}\ntitle: Mid ${index}\ndependencies: [capabilities/target]\n---\n\n# Mid ${index}\n`,
    })),
  ]);
  try {
    const r = await run([
      'all-paths',
      'capabilities/start',
      'capabilities/target',
      root,
      '--plan',
      '--max-hops=4',
      '--limit=100',
      '--json',
    ]);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.skipped, true);
    assert.equal(data.plan.operation, 'query_plan');
    assert.equal(data.plan.targetOperation, 'all_paths');
    assert.equal(data.plan.execution.shouldRun, false);
    assert.equal(data.result, undefined);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('all-paths --plan — blocks warning-only traversal unless forced', async () => {
  const root = withVault([
    {
      slug: 'capabilities/start',
      content: [
        '---',
        'kind: capability',
        'slug: capabilities/start',
        'title: Start',
        'dependencies: [capabilities/mid-a, capabilities/mid-b, capabilities/mid-c]',
        '---',
        '',
        '# Start',
      ].join('\n'),
    },
    {
      slug: 'capabilities/target',
      content: '---\nkind: capability\nslug: capabilities/target\ntitle: Target\n---\n\n# Target\n',
    },
    ...['a', 'b', 'c'].map((suffix) => ({
      slug: `capabilities/mid-${suffix}`,
      content: `---\nkind: capability\nslug: capabilities/mid-${suffix}\ntitle: Mid ${suffix}\ndependencies: [capabilities/target]\n---\n\n# Mid ${suffix}\n`,
    })),
  ]);
  try {
    const planned = await run([
      'all-paths',
      'capabilities/start',
      'capabilities/target',
      root,
      '--plan',
      '--max-hops=2',
      '--limit=1',
      '--search-budget=1000',
    ]);
    assert.equal(planned.code, 1, `stdout: ${planned.stdout}\nstderr: ${planned.stderr}`);
    const clean = stripAnsi(planned.stdout);
    assert.match(clean, /query_plan review/);
    assert.match(clean, /warnings=1/);
    assert.match(clean, /may be truncated by limit/);
    assert.match(clean, /skipped enumeration blocked by query_plan/);
    assert.doesNotMatch(clean, /#1/);

    const forced = await run([
      'all-paths',
      'capabilities/start',
      'capabilities/target',
      root,
      '--plan',
      '--force',
      '--max-hops=2',
      '--limit=1',
      '--search-budget=1000',
    ]);
    assert.equal(forced.code, 0, `stdout: ${forced.stdout}\nstderr: ${forced.stderr}`);
    const forcedClean = stripAnsi(forced.stdout);
    assert.match(forcedClean, /query_plan review/);
    assert.match(forcedClean, /all_paths maxHops=2 limit=1/);
    assert.match(forcedClean, /#1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('all-paths --json — disconnected nodes exit non-zero with completeness metadata', async () => {
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
    const r = await run(['all-paths', 'capabilities/a', 'capabilities/b', root, '--json']);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'all_paths');
    assert.equal(data.found, false);
    assert.equal(data.totalPaths, 0);
    assert.equal(data.evidence.pathsComplete, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('all-paths --json — fails closed on malformed all_paths payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-all-paths-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { operation: 'all_paths', from: 'a', to: 'b', found: true, direction: 'undirected', maxHops: 2, limit: 10, searchBudget: 1000, expandedStates: 2, exhaustive: true, truncatedByBudget: false, totalPaths: 1, totalPathsExact: true, limited: false, shortestHopCount: 1, byLength: { 1: 1 }, evidence: { status: 'complete', reason: 'complete', totalPathsExact: true, pathsComplete: true, nextStep: 'use', recommendation: 'ok', suggestedQuery: { operation: 'all_paths' } }, paths: [{ hopCount: 1, hops: ['a', 'b'], nodes: [{ slug: 'a', kind: 'capability', title: 'A' }, { slug: 'b', kind: 'capability', title: 'B' }], edges: [], byRelation: {} }] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['all-paths', 'a', 'b', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /all_paths paths\[0\]\.edges length must match hops length/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('relation-check — prints schema preflight and proposed add_relation action', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['relation-check', 'capabilities/foo', 'capabilities/bar', 'relates', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /matches_existing_schema/);
    assert.match(clean, /recommendation/);
    assert.match(clean, /review_inverse/);
    assert.match(clean, /capabilities\/foo --relates--> capabilities\/bar/);
    assert.match(clean, /schema\s+capability --relates--> capability/);
    assert.match(clean, /inverse edges/);
    assert.match(clean, /capabilities\/bar --relates--> capabilities\/foo/);
    assert.match(clean, /proposed add_relation/);
    assert.match(clean, /"from":"capabilities\/foo"/);
    assert.match(clean, /"to":"capabilities\/bar"/);
    assert.match(clean, /"type":"relates"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('relation-check --json — exposes raw MCP relation_check contract', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['relation-check', 'capabilities/foo', 'capabilities/bar', 'relates', root, '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'relation_check');
    assert.equal(data.exists, false);
    assert.equal(data.verdict, 'matches_existing_schema');
    assert.equal(data.recommendation.decision, 'review_inverse');
    assert.equal(data.recommendation.severity, 'warn');
    assert.deepEqual(data.proposedAction, {
      tool: 'add_relation',
      args: { from: 'capabilities/foo', to: 'capabilities/bar', type: 'relates' },
    });
    assert.deepEqual(
      data.inverseEdges.map((edge) => `${edge.from}->${edge.to}:${edge.via}`),
      ['capabilities/bar->capabilities/foo:relates'],
    );
    assert.ok(Array.isArray(data.nearbyPatterns));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('relation-check --json — fails closed on malformed relation_check payloads before output', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-relation-check-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { operation: 'relation_check', from: 'a', to: 'b', relation: 'depends_on', fromKind: 'capability', toKind: 'capability', exists: false, verdict: 'matches_existing_schema', recommendation: { decision: 'safe_to_add', severity: 'info', reason: 'ok' }, matchingEdges: [], inverseEdges: [], schemaPattern: null, nearbyPatterns: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['relation-check', 'a', 'b', 'depends_on', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /relation_check missing edge must include add_relation proposedAction/);
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
      args: ['explain', 'capabilities/foo'],
      pattern: /both <from> and <to> are required/,
    },
    {
      args: ['explain', 'capabilities/foo', 'capabilities/bar', '--vault='],
      pattern: /--vault requires a path/,
    },
    {
      args: ['explain', 'capabilities/foo', 'capabilities/bar', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['explain', 'capabilities/foo', 'capabilities/bar', '--direction=sideways'],
      pattern: /--direction must be one of: incoming, outgoing, both, undirected\. Received: "sideways"\./,
    },
    {
      args: ['explain', 'capabilities/foo', 'capabilities/bar', '--max-hops=21'],
      pattern: /--max-hops must be <= 20/,
    },
    {
      args: ['explain', 'capabilities/foo', 'capabilities/bar', '--limit=101'],
      pattern: /--limit must be <= 100/,
    },
    {
      args: ['explain', 'capabilities/foo', 'capabilities/bar', '--types=depend_on'],
      pattern: /--types items must be one of:[\s\S]*Received: "depend_on"\.[\s\S]*Did you mean "depends_on"\?/,
    },
    {
      args: ['explain', 'capabilities/foo', 'capabilities/bar', '--jsson'],
      pattern: /unknown flag: --jsson\. Did you mean --json\?/,
    },
    {
      args: ['all-paths', 'capabilities/foo', 'capabilities/bar', '--vault='],
      pattern: /--vault requires a path/,
    },
    {
      args: ['all-paths', 'capabilities/foo', 'capabilities/bar', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['all-paths', 'capabilities/foo', 'capabilities/bar', '--max-hops=21'],
      pattern: /--max-hops must be <= 20/,
    },
    {
      args: ['all-paths', 'capabilities/foo', 'capabilities/bar', '--limit=501'],
      pattern: /--limit must be <= 500/,
    },
    {
      args: ['all-paths', 'capabilities/foo', 'capabilities/bar', '--search-budget=50001'],
      pattern: /--search-budget must be <= 50000/,
    },
    {
      args: ['all-paths', 'capabilities/foo', 'capabilities/bar', '--types=depend_on'],
      pattern: /--types items must be one of:[\s\S]*Received: "depend_on"\.[\s\S]*Did you mean "depends_on"\?/,
    },
    {
      args: ['all-paths', 'capabilities/foo', 'capabilities/bar', '--jsson'],
      pattern: /unknown flag: --jsson\. Did you mean --json\?/,
    },
    {
      args: ['reachability'],
      pattern: /slug is required/,
    },
    {
      args: ['reachability', 'capabilities/foo', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['reachability', 'capabilities/foo', '--direction=sideways'],
      pattern: /--direction must be one of: incoming, outgoing, both\. Received: "sideways"\./,
    },
    {
      args: ['reachability', 'capabilities/foo', '--depth=21'],
      pattern: /--depth must be <= 20/,
    },
    {
      args: ['reachability', 'capabilities/foo', '--limit=501'],
      pattern: /--limit must be <= 500/,
    },
    {
      args: ['reachability', 'capabilities/foo', '--types=depend_on'],
      pattern: /--types items must be one of:[\s\S]*Received: "depend_on"\.[\s\S]*Did you mean "depends_on"\?/,
    },
    {
      args: ['reachability', 'capabilities/foo', '--jsson'],
      pattern: /unknown flag: --jsson\. Did you mean --json\?/,
    },
    {
      args: ['relation-check', 'capabilities/foo', 'domains/auth'],
      pattern: /<from>, <to>, and <type> are required/,
    },
    {
      args: ['relation-check', 'capabilities/foo', 'domains/auth', 'depend_on'],
      pattern: /type must be one of:[\s\S]*Received: "depend_on"\.[\s\S]*Did you mean "depends_on"\?/,
    },
    {
      args: ['relation-check', 'capabilities/foo', 'domains/auth', 'domain', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['relation-check', 'capabilities/foo', 'domains/auth', 'domain', '--jsson'],
      pattern: /unknown flag: --jsson\. Did you mean --json\?/,
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
      args: ['match-nodes', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['match-nodes', '--kind=capabilty'],
      pattern: /--kind must be one of: project, domain, capability, element, document, vault-readme\. Received: "capabilty"\. Did you mean "capability"\?/,
    },
    {
      args: ['match-nodes', '--min-degree=2', '--max-degree=1'],
      pattern: /--min-degree must be <= --max-degree/,
    },
    {
      args: ['match-nodes', '--sort=mtime'],
      pattern: /--sort must be one of: degree, inDegree, outDegree, slug\. Received: "mtime"\./,
    },
    {
      args: ['match-nodes', '--slug-contain=auth'],
      pattern: /unknown flag: --slug-contain=auth\. Did you mean --slug-contains\?/,
    },
    {
      args: ['match-edges', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['match-edges', '--from-kind=capabilty'],
      pattern: /--from-kind must be one of: project, domain, capability, element, document, vault-readme\. Received: "capabilty"\. Did you mean "capability"\?/,
    },
    {
      args: ['match-edges', '--to-kind=externl'],
      pattern: /--to-kind must be one of: project, domain, capability, element, document, vault-readme, external, unresolved\. Received: "externl"\. Did you mean "external"\?/,
    },
    {
      args: ['match-edges', '--type=depend_on'],
      pattern: /--type must be one of:[\s\S]*Received: "depend_on"\.[\s\S]*Did you mean "depends_on"\?/,
    },
    {
      args: ['match-edges', '--type=relates', '--types=depends_on'],
      pattern: /pass either --type or --types, not both/,
    },
    {
      args: ['match-edges', '--include-extenal'],
      pattern: /unknown flag: --include-extenal\. Did you mean --include-external\?/,
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
      args: ['agent-brief', 'ontology', '--vault', 'docs/ontology'],
      pattern: /either positional argument or --vault/,
    },
    {
      args: ['agent-brief', '--jsson'],
      pattern: /unknown flag: --jsson\. Did you mean --json\?/,
    },
    {
      args: ['agent-brief', '-json'],
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

await test('graph MCP calls — reject invalid OATLAS_MCP_PATH overrides before spawning node', async () => {
  const missing = await run(['overview', 'docs/ontology'], {
    env: { OATLAS_MCP_PATH: join(tmpdir(), 'missing-ontology-atlas-mcp-entry.js') },
  });
  assert.equal(missing.code, 2);
  assert.match(stripAnsi(missing.stderr), /OATLAS_MCP_PATH does not exist/);
  assert.doesNotMatch(stripAnsi(missing.stderr), /vault overview|MODULE_NOT_FOUND/);

  const directory = await run(['overview', 'docs/ontology'], {
    env: { OATLAS_MCP_PATH: tmpdir() },
  });
  assert.equal(directory.code, 2);
  assert.match(stripAnsi(directory.stderr), /OATLAS_MCP_PATH is not a file/);
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
    const r = await run(['overview', root], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const stderr = stripAnsi(r.stderr);
    assert.match(stderr, /mcp exited code 7 while calling query_ontology/);
    assert.ok(stderr.includes(`vault ${root}`), stderr);
    assert.match(stderr, /Check OATLAS_MCP_PATH/);
    assert.match(stderr, /OATLAS_CLI_MCP_TIMEOUT_MS=N/);
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
    const r = await run(['overview', root], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const stderr = stripAnsi(r.stderr);
    assert.match(stderr, /mcp response missing tools\/call result for query_ontology/);
    assert.ok(stderr.includes(`vault ${root}`), stderr);
    assert.match(stderr, /Check OATLAS_MCP_PATH/);
    assert.match(stderr, /OATLAS_CLI_MCP_TIMEOUT_MS=N/);
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
    const r = await run(['overview', root], { env: { OATLAS_MCP_PATH: fakeMcp } });
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
      args: ['hubs', '--types=dependencies,'],
      pattern: /--types must not contain empty CSV items/,
    },
    {
      args: ['hubs', '--types=depend_on'],
      pattern: /--types items must be one of:[\s\S]*Received: "depend_on"\.[\s\S]*Did you mean "depends_on"\?/,
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
    const r = await run(['orphans', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
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

await test('query — rejects MCP graph operation flags with CLI command guidance', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['query', '--operation', 'growth_plan', root]);
    assert.equal(r.code, 1);
    assert.equal(r.stdout, '');
    const clean = stripAnsi(r.stderr);
    assert.match(clean, /unknown flag: --operation\./);
    assert.match(clean, /query is the typed filter DSL/);
    assert.match(clean, /overview, health, agent-brief, workspace-brief, growth, maintenance, path, explain, all-paths, reachability, relation-check, match-nodes, match-edges, domain-matrix, facets, blast-radius, cycles, or hubs/);
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
    const r = await run(['query', 'kind=capability', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /query_concepts matches\[0\] has an invalid query-result shape/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('match-nodes — graph DB-style node rows with degree filters', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'match-nodes',
      root,
      '--kind=capability',
      '--min-in-degree=1',
      '--sort=inDegree',
      '--limit=5',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /match_nodes 2\/2 node\(s\)/);
    assert.match(clean, /filters .*kind=capability.*minInDegree=1.*sort=inDegree/);
    assert.match(clean, /capabilities\/foo\s+— Foo.*deg 4 in 2 out 2/);
    assert.match(clean, /capabilities\/bar\s+— Bar.*deg 3 in 1 out 2/);
    assert.match(clean, /next focus capabilities\/foo/);
    assert.match(clean, /scan rows are candidates, not proof; cite follow-up detail before onboarding\/refactor decisions/);
    assert.match(clean, /ontology-atlas node capabilities\/foo \[vault\] --limit 12/);
    assert.match(clean, /ontology-atlas match-edges \[vault\] --from capabilities\/foo --include-external --include-unresolved --limit 20/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('match-nodes --plan --json — preserves filters in query_plan and result', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'match-nodes',
      root,
      '--kind=capability',
      '--min-degree=2',
      '--sort=degree',
      '--limit=2',
      '--plan',
      '--json',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.plan.targetOperation, 'match_nodes');
    assert.equal(data.plan.normalized.kind, 'capability');
    assert.equal(data.plan.normalized.minDegree, 2);
    assert.equal(data.plan.estimate.totalMatches, 2);
    assert.equal(data.result.operation, 'match_nodes');
    assert.equal(data.result.totalMatches, 2);
    assert.equal(data.result.followUp.focusSlug, 'capabilities/foo');
    assert.deepEqual(
      data.result.followUp.calls.map((call) => call.arguments.operation),
      ['node_profile', 'match_edges', 'match_edges', 'blast_radius'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('match-edges — graph DB-style edge rows with kind/type filters', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'match-edges',
      root,
      '--from-kind=capability',
      '--type=relates',
      '--limit=5',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /match_edges 1\/1 edge\(s\)/);
    assert.match(clean, /filters .*fromKind=capability.*types=relates/);
    assert.match(clean, /capabilities\/bar --relates--> capabilities\/foo/);
    assert.match(clean, /Bar.*Foo.*\(capability → capability\)/);
    assert.match(clean, /next edge capabilities\/bar --relates--> capabilities\/foo/);
    assert.match(clean, /scan rows are candidates, not proof; explain\/preflight before write\/refactor decisions/);
    assert.match(clean, /ontology-atlas explain capabilities\/bar capabilities\/foo \[vault\] --direction undirected --max-hops 5 --types relates --limit 10/);
    assert.match(clean, /ontology-atlas relation-check capabilities\/bar capabilities\/foo relates \[vault\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('match-edges — renders depends_on filter using public relation name', async () => {
  const root = buildCycleFixture();
  try {
    const r = await run([
      'match-edges',
      root,
      '--type=depends_on',
      '--limit=1',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /filters .*types=depends_on/);
    assert.doesNotMatch(clean, /filters .*types=dependencies/);
    assert.match(clean, /--depends_on-->/);
    assert.doesNotMatch(clean, /--dependencies-->/);
    assert.match(clean, /ontology-atlas explain .* --types depends_on --limit 10/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('match-edges --plan --json — preserves filters in query_plan and result', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'match-edges',
      root,
      '--from-kind=capability',
      '--type=relates',
      '--limit=3',
      '--plan',
      '--json',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.plan.targetOperation, 'match_edges');
    assert.equal(data.plan.normalized.fromKind, 'capability');
    assert.deepEqual(data.plan.normalized.types, ['relates']);
    assert.deepEqual(data.plan.normalized.relationTypes, ['relates']);
    assert.equal(data.plan.estimate.totalMatches, 1);
    assert.equal(data.result.operation, 'match_edges');
    assert.equal(data.result.totalMatches, 1);
    assert.deepEqual(data.result.filters.relationTypes, ['relates']);
    assert.deepEqual(data.result.followUp.focusEdge, {
      from: 'capabilities/bar',
      to: 'capabilities/foo',
      via: 'relates',
      relationType: 'relates',
    });
    assert.deepEqual(
      data.result.followUp.calls.map((call) => call.arguments.operation),
      ['explain_relation', 'path', 'relation_check'],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('domain-matrix — renders cross-domain coupling rows with examples', async () => {
  const root = withVault([
    {
      slug: 'project',
      content:
        '---\nkind: project\nslug: project\ntitle: Project\ndomains: [domains/auth, domains/billing]\n---\n\n# Project\n',
    },
    {
      slug: 'domains/auth',
      content:
        '---\nkind: domain\nslug: domains/auth\ntitle: Auth\ncapabilities: [capabilities/login]\n---\n\n# Auth\n',
    },
    {
      slug: 'domains/billing',
      content:
        '---\nkind: domain\nslug: domains/billing\ntitle: Billing\ncapabilities: [capabilities/invoice]\n---\n\n# Billing\n',
    },
    {
      slug: 'capabilities/login',
      content:
        '---\nkind: capability\nslug: capabilities/login\ntitle: Login\ndomain: domains/auth\ndepends_on: [capabilities/invoice]\n---\n\n# Login\n',
    },
    {
      slug: 'capabilities/invoice',
      content:
        '---\nkind: capability\nslug: capabilities/invoice\ntitle: Invoice\ndomain: domains/billing\n---\n\n# Invoice\n',
    },
  ]);
  try {
    const r = await run(['domain-matrix', root, '--project=project', '--limit=5']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /domain_matrix 2 domain\(s\).*1 cross-domain edge\(s\)/);
    assert.match(clean, /project project/);
    assert.match(clean, /domains\/auth\s+— Auth.*out 1/);
    assert.match(clean, /domains\/billing\s+— Billing.*in 1/);
    assert.match(clean, /domains\/auth → domains\/billing 1 depends_on:1/);
    assert.match(clean, /capabilities\/login --depends_on--> capabilities\/invoice/);
    assert.match(clean, /next coupling domains\/auth → domains\/billing/);
    assert.match(clean, /matrix rows are hotspots, not proof; inspect matching edges before boundary decisions/);
    assert.match(clean, /ontology-atlas match-edges \[vault\] --from capabilities\/login --to capabilities\/invoice --types depends_on --limit 20/);
    assert.match(clean, /ontology-atlas explain capabilities\/login capabilities\/invoice \[vault\] --direction undirected --max-hops 5 --types depends_on --limit 10/);
    assert.doesNotMatch(clean, /dependencies:1/);
    assert.doesNotMatch(clean, /--dependencies-->/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('domain-matrix --json — exposes scoped summary and connection page', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['domain-matrix', root, '--limit=3', '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'domain_matrix');
    assert.equal(data.summary.domains, 1);
    assert.equal(data.connections.total, 0);
    assert.equal(data.connections.limited, false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('domain-matrix --types — narrows semantic coupling before rendering', async () => {
  const root = withVault([
    {
      slug: 'project',
      content:
        '---\nkind: project\nslug: project\ntitle: Project\ndomains: [domains/auth, domains/billing]\n---\n\n# Project\n',
    },
    {
      slug: 'domains/auth',
      content:
        '---\nkind: domain\nslug: domains/auth\ntitle: Auth\ncapabilities: [capabilities/login, capabilities/session]\n---\n\n# Auth\n',
    },
    {
      slug: 'domains/billing',
      content:
        '---\nkind: domain\nslug: domains/billing\ntitle: Billing\ncapabilities: [capabilities/invoice]\n---\n\n# Billing\n',
    },
    {
      slug: 'capabilities/login',
      content:
        '---\nkind: capability\nslug: capabilities/login\ntitle: Login\ndomain: domains/auth\ndepends_on: [capabilities/invoice]\nrelates: [capabilities/session]\n---\n\n# Login\n',
    },
    {
      slug: 'capabilities/session',
      content:
        '---\nkind: capability\nslug: capabilities/session\ntitle: Session\ndomain: domains/auth\n---\n\n# Session\n',
    },
    {
      slug: 'capabilities/invoice',
      content:
        '---\nkind: capability\nslug: capabilities/invoice\ntitle: Invoice\ndomain: domains/billing\n---\n\n# Invoice\n',
    },
  ]);
  try {
    const r = await run(['domain-matrix', root, '--project=project', '--types=depends_on', '--limit=5']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /types depends_on/);
    assert.match(clean, /domain_matrix 2 domain\(s\).*1 cross-domain edge\(s\).*0 self edge\(s\)/);
    assert.match(clean, /domains\/auth → domains\/billing 1 depends_on:1/);
    assert.match(clean, /ontology-atlas match-edges \[vault\] --from capabilities\/login --to capabilities\/invoice --types depends_on --limit 20/);
    assert.doesNotMatch(clean, /relates:1/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('domain-matrix --types — rejects unknown relation types before MCP call', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['domain-matrix', root, '--types=depend_on']);
    assert.equal(r.code, 1);
    assert.match(stripAnsi(r.stderr), /--types items/);
    assert.match(stripAnsi(r.stderr), /Did you mean "depends_on"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('pattern-walk — prints explicit containment traversal evidence', async () => {
  const root = withVault([
    {
      slug: 'project',
      content:
        '---\nkind: project\nslug: project\ntitle: Project\ndomains: [domains/auth]\n---\n\n# Project\n',
    },
    {
      slug: 'domains/auth',
      content:
        '---\nkind: domain\nslug: domains/auth\ntitle: Auth\ncapabilities: [capabilities/login]\n---\n\n# Auth\n',
    },
    {
      slug: 'capabilities/login',
      content:
        '---\nkind: capability\nslug: capabilities/login\ntitle: Login\ndomain: domains/auth\n---\n\n# Login\n',
    },
  ]);
  try {
    const r = await run(['pattern-walk', 'project', root, '--pattern=domains,capabilities', '--limit=10']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /pattern_walk project outgoing domains -> capabilities/);
    assert.match(clean, /2 step\(s\)/);
    assert.match(clean, /step 1 domains/);
    assert.match(clean, /domains\/auth\s+— Auth/);
    assert.match(clean, /step 2 capabilities/);
    assert.match(clean, /capabilities\/login\s+— Login/);
    assert.match(clean, /next containment capabilities\/login/);
    assert.match(clean, /ontology-atlas node capabilities\/login \[vault\] --limit 20/);

    const json = await run(['pattern-walk', 'project', root, '--pattern=domains,capabilities', '--json']);
    assert.equal(json.code, 0, `stdout: ${json.stdout}\nstderr: ${json.stderr}`);
    const data = JSON.parse(json.stdout);
    assert.equal(data.operation, 'pattern_walk');
    assert.deepEqual(data.pattern, ['domains', 'capabilities']);
    assert.equal(data.paths.rows[0].end, 'capabilities/login');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('pattern-walk — rejects unknown pattern relation types before MCP call', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['pattern-walk', 'project', root, '--pattern=domainz']);
    assert.equal(r.code, 1);
    assert.match(stripAnsi(r.stderr), /--pattern items/);
    assert.match(stripAnsi(r.stderr), /Did you mean "domains"/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('project-map — prints domain placement and containment follow-up', async () => {
  const root = withVault([
    {
      slug: 'project',
      content:
        '---\nkind: project\nslug: project\ntitle: Project\ndomains: [domains/auth]\n---\n\n# Project\n',
    },
    {
      slug: 'domains/auth',
      content:
        '---\nkind: domain\nslug: domains/auth\ntitle: Auth\ncapabilities: [capabilities/login]\n---\n\n# Auth\n',
    },
    {
      slug: 'capabilities/login',
      content:
        '---\nkind: capability\nslug: capabilities/login\ntitle: Login\ndomain: domains/auth\nelements: [elements/login-api]\n---\n\n# Login\n',
    },
    {
      slug: 'elements/login-api',
      content:
        '---\nkind: element\nslug: elements/login-api\ntitle: Login API\ndomain: domains/auth\n---\n\n# Login API\n',
    },
  ]);
  try {
    const r = await run(['project-map', 'project', root, '--limit=5', '--item-limit=5']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /project_map project/);
    assert.match(clean, /1 domain\(s\)/);
    assert.match(clean, /domains\/auth\s+— Auth/);
    assert.match(clean, /capability capabilities\/login/);
    assert.match(clean, /element\s+elements\/login-api/);
    assert.match(clean, /next domain domains\/auth/);
    assert.match(clean, /ontology-atlas pattern-walk project \[vault\] --pattern domains,capabilities --limit 20/);

    const json = await run(['project-map', 'project', root, '--json']);
    assert.equal(json.code, 0, `stdout: ${json.stdout}\nstderr: ${json.stderr}`);
    const data = JSON.parse(json.stdout);
    assert.equal(data.operation, 'project_map');
    assert.equal(data.project, 'project');
    assert.equal(data.summary.domains, 1);
    assert.equal(data.domains[0].capabilities.nodes[0].slug, 'capabilities/login');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('reachability — transitive reachable nodes are grouped by layer', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'reachability',
      'capabilities/bar',
      root,
      '--direction=outgoing',
      '--depth=2',
      '--limit=5',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /capabilities\/bar — reachability/);
    assert.match(clean, /2 reachable node\(s\)/);
    assert.match(clean, /by relation/);
    assert.match(clean, /relates\s+1/);
    assert.match(clean, /domain\s+1/);
    assert.match(clean, /d1[\s\S]*capabilities\/foo\s+— Foo/);
    assert.match(clean, /d1[\s\S]*domains\/auth\s+— Auth/);
    assert.match(clean, /shortest paths/);
    assert.match(clean, /next reachable capabilities\/foo/);
    assert.match(clean, /traversal rows are candidates, not proof; inspect the node and bounded paths before writing/);
    assert.match(clean, /ontology-atlas node capabilities\/foo \[vault\] --limit 20/);
    assert.match(clean, /ontology-atlas all-paths capabilities\/bar capabilities\/foo \[vault\] --plan --max-hops 2 --limit 10/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('reachability --plan --json — preserves traversal filters in query_plan and result', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'reachability',
      'capabilities/bar',
      root,
      '--direction=outgoing',
      '--depth=2',
      '--types=relates,domain',
      '--limit=5',
      '--plan',
      '--json',
    ]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.plan.operation, 'query_plan');
    assert.equal(data.plan.targetOperation, 'reachability');
    assert.equal(data.plan.normalized.slug, 'capabilities/bar');
    assert.equal(data.plan.normalized.depth, 2);
    assert.deepEqual(data.plan.normalized.types, ['domain', 'relates']);
    assert.equal(data.result.operation, 'reachability');
    assert.equal(data.result.start, 'capabilities/bar');
    assert.equal(data.result.summary.reachableNodes, 2);
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

await test('overview/hubs/match/reachability/blast-radius --json — fail closed on malformed graph query payloads before output', async () => {
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
      "        : operation === 'match_nodes'",
      "          ? { operation: 'match_nodes', filters: {}, totalMatches: 1, limited: false, nodes: [{ slug: 'capabilities/foo', kind: 'capability', title: 'Foo', degree: '1' }] }",
      "          : operation === 'match_edges'",
      "            ? { operation: 'match_edges', filters: {}, totalMatches: 1, limited: false, edges: [{ from: 'capabilities/foo', to: 'capabilities/bar', via: 'relates', fromNode: { slug: 'capabilities/foo', kind: 'capability' }, toKind: 'capability' }] }",
      "            : operation === 'reachability'",
      "              ? { operation: 'reachability', start: 'capabilities/foo', node: { slug: 'capabilities/foo', kind: 'capability', title: 'Foo' }, direction: 'outgoing', depth: 2, summary: { reachableNodes: '1', traversedEdges: 0, layers: 0, terminalNodes: 0 }, byKind: {}, byRelation: {}, layers: [], paths: { total: 0, limited: false, rows: [] }, terminalNodes: [], edges: { total: 0, limited: false, rows: [] } }",
      "              : { operation: 'blast_radius', center: 'domains/auth', risk: 'low', summary: { affectedNodes: 1, affectedEdges: '0', affectedKinds: 1, affectedDomains: 1, crossDomainEdges: 0 }, byKind: {}, byDomain: {}, nodes: { total: 0, limited: false, rows: [] }, edges: { total: 0, limited: false, rows: [] } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const overview = await run(['overview', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(overview.code, 2, `stdout: ${overview.stdout}\nstderr: ${overview.stderr}`);
    assert.equal(overview.stdout, '');
    assert.match(stripAnsi(overview.stderr), /overview graph\.nodes must be a non-negative integer/);

    const hubs = await run(['hubs', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(hubs.code, 2, `stdout: ${hubs.stdout}\nstderr: ${hubs.stderr}`);
    assert.equal(hubs.stdout, '');
    assert.match(stripAnsi(hubs.stderr), /centrality rankings\.pageRank\[0\] has an invalid ranking shape/);

    const matchNodes = await run(['match-nodes', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(matchNodes.code, 2, `stdout: ${matchNodes.stdout}\nstderr: ${matchNodes.stderr}`);
    assert.equal(matchNodes.stdout, '');
    assert.match(stripAnsi(matchNodes.stderr), /match_nodes nodes\[0\] has an invalid node row shape/);

    const matchEdges = await run(['match-edges', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(matchEdges.code, 2, `stdout: ${matchEdges.stdout}\nstderr: ${matchEdges.stderr}`);
    assert.equal(matchEdges.stdout, '');
    assert.match(stripAnsi(matchEdges.stderr), /match_edges edges\[0\] has an invalid edge row shape/);

    const reachability = await run(['reachability', 'capabilities/foo', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(reachability.code, 2, `stdout: ${reachability.stdout}\nstderr: ${reachability.stderr}`);
    assert.equal(reachability.stdout, '');
    assert.match(stripAnsi(reachability.stderr), /reachability summary\.reachableNodes must be a non-negative integer/);

    const blast = await run(['blast-radius', 'domains/auth', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
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
    assert.match(clean, /next impact capabilities\/bar/);
    assert.match(clean, /impact rows are candidates, not proof; inspect backlinks and node detail before refactor decisions/);
    assert.match(clean, /ontology-atlas node capabilities\/bar \[vault\] --limit 20/);
    assert.match(clean, /ontology-atlas backlinks capabilities\/foo \[vault\]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('blast-radius --plan --json — returns query_plan evidence with result payload', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['blast-radius', 'capabilities/foo', root, '--plan', '--depth=1', '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.plan.operation, 'query_plan');
    assert.equal(data.plan.targetOperation, 'blast_radius');
    assert.equal(data.plan.normalized.targetOperation, 'blast_radius');
    assert.equal(data.plan.execution.shouldRun, true);
    assert.equal(data.result.operation, 'blast_radius');
    assert.equal(data.result.center, 'capabilities/foo');
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
    assert.match(clean, /next hub domains\/auth/);
    assert.match(clean, /ranking rows are hotspots, not proof; inspect the node and impact before onboarding\/refactor decisions/);
    assert.match(clean, /ontology-atlas node domains\/auth \[vault\] --limit 20/);
    assert.match(clean, /ontology-atlas blast-radius domains\/auth \[vault\] --plan --depth 2 --direction both/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('hubs --plan --types — plans PageRank cost before centrality ranking', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['hubs', root, '--plan', '--types=depends_on,relates', '--limit=2', '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.plan.targetOperation, 'centrality');
    assert.equal(data.plan.estimate.strategy, 'page_rank_centrality');
    assert.equal(data.plan.normalized.limit, 2);
    assert.deepEqual(data.plan.normalized.types, ['dependencies', 'relates']);
    assert.equal(data.result.operation, 'centrality');
    assert.equal(data.result.parameters.limit, 2);
    assert.deepEqual(data.result.parameters.types, ['dependencies', 'relates']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('components — scans connected islands without health JSON indirection', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['components', root, '--limit=2', '--node-limit=3']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /graph components/);
    assert.match(clean, /component 1/);
    assert.match(clean, /domains\/auth\s+— Auth/);

    const json = await run(['components', root, '--json', '--limit=1', '--node-limit=2']);
    assert.equal(json.code, 0, `stdout: ${json.stdout}\nstderr: ${json.stderr}`);
    const data = JSON.parse(json.stdout);
    assert.equal(data.operation, 'components');
    assert.equal(data.components.length, 1);
    assert.equal(data.components[0].nodes.length <= 2, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('topological-order — prints prerequisite-first dependency order', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['topological-order', root, '--limit=5', '--types=relates']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /topological order/);
    assert.match(clean, /acyclic/);
    assert.match(clean, /capabilities\/foo|capabilities\/bar/);

    const json = await run(['topological-order', root, '--json', '--limit=3', '--types=relates']);
    assert.equal(json.code, 0, `stdout: ${json.stdout}\nstderr: ${json.stderr}`);
    const data = JSON.parse(json.stdout);
    assert.equal(data.operation, 'topological_order');
    assert.equal(data.acyclic, true);
    assert.equal(data.order.length <= 3, true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('schema — prints relation patterns for traversal and write preflight', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['schema', root, '--limit=3']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /relation schema/);
    assert.match(clean, /domain\s+--capabilities-->\s+capability|capability\s+--domain-->\s+domain/);
    assert.match(clean, /relation-check <from> <to> <type>/);

    const json = await run(['schema', root, '--json', '--limit=2']);
    assert.equal(json.code, 0, `stdout: ${json.stdout}\nstderr: ${json.stderr}`);
    const data = JSON.parse(json.stdout);
    assert.equal(data.operation, 'schema');
    assert.equal(data.patterns.length <= 2, true);
    assert.equal(data.patterns.every((pattern) => Number.isInteger(pattern.count)), true);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('facets — prints dashboard buckets before narrower graph scans', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['facets', root, '--limit=3']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /graph facets/);
    assert.match(clean, /node kinds/);
    assert.match(clean, /relations/);
    assert.match(clean, /top schema patterns/);
    assert.match(clean, /ontology-atlas schema \[vault\] --limit 20/);

    const json = await run(['facets', root, '--json', '--limit=2']);
    assert.equal(json.code, 0, `stdout: ${json.stdout}\nstderr: ${json.stderr}`);
    const data = JSON.parse(json.stdout);
    assert.equal(data.operation, 'facets');
    assert.equal(data.graph.nodes, 3);
    assert.equal(Array.isArray(data.nodes.topByDegree), true);
    assert.equal(Array.isArray(data.edges.topPatterns), true);
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

await test('workspace-brief — prints next action id and kind when they differ', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-workspace-brief-actions.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = {",
      "      operation: 'workspace_brief',",
      "      status: 'needs_attention',",
      "      summary: { nodes: 1, edges: 0, projects: 0, domains: 0 },",
      "      hotspots: [],",
      "      projects: { maps: [] },",
      "      growth: { totalActions: 1, relationRecommendations: 0, danglingReferences: 0, externalElementRefs: 0, externalElementRefsIgnored: 0 },",
      "      nextActions: [{ id: 'components', kind: 'health_check', severity: 'info', count: 6, message: 'Scoped component check.' }],",
      "      health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] },",
      "    };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['workspace-brief', root], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /NEXT ACTIONS/);
    assert.match(clean, /components\/health_check\s+× 6/);
    assert.match(clean, /Scoped component check/);
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

await test('workspace-brief --limit — accepts agent_brief first-contact fallback alias', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['workspace-brief', root, '--json', '--limit=1']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'workspace_brief');
    assert.equal(data.status, 'healthy');
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
  assert.match(clean, /Use pnpm dogfood:status for the cheap human-readable health \+ workspace-brief \+ agent-brief \+ maintenance queue/);
  assert.match(clean, /Fail-severity nextActions or failing health checks exit non-zero for shell gates/);
  assert.match(clean, /project_scope 포함 노드 요약/);
  assert.match(clean, /HEALTH CHECKS id:status:count/);
  assert.match(clean, /GROWTH actions\/relations\/dangling\/external\/ignoredExternal counts/);
  assert.match(clean, /NEXT ACTIONS labels use id\/kind/);
  assert.match(clean, /--dependency-types A,B/);
  assert.match(clean, /--component-types A,B/);
  assert.match(clean, /--limit is a first-contact alias for --node-limit/);
  assert.match(clean, /Tuning flags forward to query_ontology workspace_brief/);
});

await test('agent-brief — prints agent handoff entrypoints and playbooks', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['agent-brief', root]);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(r.stdout, /\x1b\[32mhealthy\x1b\[0m/);
    assert.match(clean, /agent brief/);
    assert.match(clean, /readiness ready 100\/100/);
    assert.match(clean, /HANDOFF PROMPT/);
    assert.match(clean, /\.handoffPrompt/);
    assert.match(clean, /MODE GUIDE/);
    assert.match(clean, /CLI-only\s+validate, workspace-brief, graph scans, graph DB pack/);
    assert.match(clean, /MCP-connected\s+direct read\/write tools/);
    assert.match(clean, /Setup gate\s+config repair commands, JSON readiness/);
    assert.match(clean, /ENTRYPOINTS/);
    assert.match(clean, /capabilities\/foo\s+— Foo|domains\/auth\s+— Auth/);
    assert.match(clean, /FIRST MCP CALLS/);
    assert.match(clean, /query_ontology\(\{"operation":"workspace_brief"/);
    assert.match(clean, /CLI FALLBACKS/);
    assert.match(clean, /ontology-atlas hubs \[vault\] --plan --limit 10 --types depends_on,relates/);
    assert.match(clean, /GRAPH DB QUERY PACK/);
    assert.match(clean, /MATCH \(n:capability\) WHERE degree\(n\) >= 2/);
    assert.match(clean, /path_evidence/);
    assert.match(clean, /query_ontology\(\{"operation":"explain_relation"/);
    assert.match(clean, /PLAYBOOKS/);
    assert.match(clean, /refactor_impact/);
    assert.match(clean, /evidence:/);
    assert.match(clean, /stop if:/);
    assert.match(clean, /Whether an existing path already explains the proposed relation/);
    assert.match(clean, /relation_check returns skip_existing, review_inverse, or review_new_schema/);
    assert.match(clean, /Graph DB-style node scan results that surface high-degree capability starting points/);
    assert.match(clean, /query_plan\(match_nodes\) asks for a narrower kind\/domain\/limit before scanning/);
    assert.match(clean, /TRAVERSAL STRATEGY/);
    assert.match(clean, /plan_before_enumeration/);
    assert.match(clean, /bounded_path_evidence/);
    assert.match(clean, /containment_cross_check/);
    assert.match(clean, /query_plan\.execution\.suggestedQuery/);
    assert.match(clean, /evidence\.pathsComplete is false/);
    assert.match(clean, /WRITE GUARDRAILS/);
    assert.match(clean, /preflight_relation/);
    assert.match(clean, /find_backlinks/);
    assert.match(clean, /RELATION DECISION GUIDE/);
    assert.match(clean, /review_inverse/);
    assert.match(clean, /review_new_schema/);
    assert.match(clean, /RESULT CONTRACTS/);
    assert.match(clean, /all_paths\s+report limit, searchBudget, expandedStates, exhaustive, truncatedByBudget, totalPathsExact, evidence\.status, evidence\.reason, evidence\.pathsComplete/);
    assert.match(clean, /partial evidence/);
    assert.match(clean, /WRITE POLICY/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-brief --json — forwards focused diagnosis tuning flags', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run([
      'agent-brief',
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
    assert.equal(data.operation, 'agent_brief');
    assert.deepEqual(data.docs.workflowGuide, {
      path: 'docs/AGENT-GRAPH-WORKFLOW.md',
      title: 'Agent Graph Workflow',
      description: 'CLI-only use, MCP-connected use, graph DB differences, graph query packs, and verification checks.',
    });
    assert.deepEqual(data.docs.modeComparison.map((mode) => mode.id), [
      'cli_only',
      'mcp_connected',
      'graph_db_pack',
      'setup_gate',
    ]);
    assert.match(data.docs.modeComparison.find((mode) => mode.id === 'mcp_connected').gives, /structured repair fields/);
    assert.match(data.docs.modeComparison.find((mode) => mode.id === 'setup_gate').gives, /JSON readiness/);
    assert.deepEqual(data.docs.graphScanProofChecklist.map((row) => row.id), [
      'report_scan_scope',
      'prove_node_rows',
      'prove_edge_rows',
      'prove_path_completeness',
    ]);
    assert.ok(data.docs.graphScanProofChecklist[0].evidence.includes('totalMatches'));
    assert.ok(data.docs.graphScanProofChecklist[1].evidence.includes('blast_radius'));
    assert.ok(data.docs.graphScanProofChecklist[2].evidence.includes('relation_check'));
    assert.ok(data.docs.graphScanProofChecklist[3].evidence.includes('evidence.pathsComplete'));
    assert.equal(data.readiness.status, 'ready');
    assert.ok(data.cliFallbackCommands.includes('ontology-atlas hubs [vault] --plan --limit 10 --types depends_on,relates'));
    assert.ok(data.writeGuardrails.some((guardrail) => guardrail.id === 'preflight_rename'));
    assert.ok(data.writeGuardrails.some((guardrail) => guardrail.calls.some((call) => call.tool === 'validate_vault')));
    assert.deepEqual(data.relationDecisionGuide.map((row) => row.decision), [
      'skip_existing',
      'review_inverse',
      'safe_to_add',
      'review_new_schema',
    ]);
    assert.deepEqual(data.traversalStrategy.map((row) => row.id), [
      'plan_before_enumeration',
      'bounded_path_evidence',
      'containment_cross_check',
    ]);
    assert.match(data.handoffPrompt, /Traversal strategy/);
    assert.match(data.handoffPrompt, /Graph DB query pack for local markdown graph scans/);
    assert.deepEqual(data.graphDbQueryPack.map((item) => item.id), [
      'graph_facets',
      'node_scan',
      'edge_scan',
      'domain_coupling',
      'path_evidence',
      'business_questions',
    ]);
    assert.deepEqual(data.graphDbQueryPack.flatMap((item) => item.calls).map((call) => call.arguments.operation), [
      'facets',
      'schema',
      'query_plan',
      'match_nodes',
      'query_plan',
      'match_edges',
      'domain_matrix',
      'query_plan',
      'centrality',
      'query_plan',
      'all_paths',
      'explain_relation',
      'query_plan',
      'match_nodes',
      'domain_matrix',
      'query_plan',
      'match_edges',
    ]);
    assert.ok(data.traversalStrategy[1].evidence.some((row) => /evidence\.pathsComplete/.test(row)));
    assert.deepEqual(data.resultContracts[0].operation, 'all_paths');
    assert.deepEqual(data.resultContracts[0].mustReport, [
      'limit',
      'searchBudget',
      'expandedStates',
      'exhaustive',
      'truncatedByBudget',
      'totalPathsExact',
      'evidence.status',
      'evidence.reason',
      'evidence.pathsComplete',
    ]);
    assert.equal(data.resultContracts[1].operation, 'match_nodes');
    assert.ok(data.resultContracts[1].mustReport.includes('followUp.focusSlug'));
    assert.match(data.resultContracts[1].policy, /scan candidates/);
    assert.equal(data.resultContracts[2].operation, 'match_edges');
    assert.ok(data.resultContracts[2].mustReport.includes('followUp.focusEdge'));
    assert.match(data.resultContracts[2].policy, /explain_relation/);
    const components = data.health.checks.find((check) => check.id === 'components');
    assert.equal(components.status, 'info');
    assert.equal(components.count, 3);
    assert.match(components.message, /scoped ontology graph/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-brief --json — emits CLI fallback commands that run directly', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['agent-brief', root, '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.ok(
      data.cliFallbackCommands
        .filter((command) => /ontology-atlas all-paths /.test(command) && / --plan /.test(command))
        .every((command) => / --force /.test(command)),
      'all all-paths --plan fallbacks should include --force so verify-fallbacks can execute warning-only plans directly',
    );
    const commands = data.cliFallbackCommands.map((command) => command.replace('[vault]', root));
    for (const command of commands) {
      const args = command.split(/\s+/).slice(1);
      const result = await run(args);
      assert.equal(result.code, 0, `${command}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-brief --verify-fallbacks — executes generated CLI fallback commands', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['agent-brief', root, '--verify-fallbacks']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /agent fallback check/);
    assert.match(clean, /setup gate ok=true performanceOk=true wall=\d+ms slow=0\/\d+ failed=0/);
    assert.match(clean, /PASS \d+ms ontology-atlas workspace-brief \[vault\] --limit 5/);
    assert.match(clean, /ok \d+\/\d+ fallback command\(s\) passed/);
    assert.match(clean, /timing: wall \d+ms; total \d+ms; slowest \d+ms ontology-atlas /);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-brief --verify-fallbacks --json — emits machine-readable fallback timing report', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['agent-brief', root, '--verify-fallbacks', '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'agent_fallback_check');
    assert.equal(data.ok, true);
    assert.equal(data.performanceOk, true);
    assert.equal(data.failed, 0);
    assert.equal(data.timeoutMs, 15000);
    assert.equal(data.slowThresholdMs, 5000);
    assert.equal(data.concurrency, 4);
    assert.equal(data.total, data.commands.length);
    assert.ok(data.passed > 0);
    assert.ok(Number.isInteger(data.slow));
    assert.ok(data.totalMs >= data.slowest.elapsedMs);
    assert.ok(data.wallMs <= data.totalMs);
    assert.match(data.slowest.command, /^ontology-atlas /);
    assert.ok(data.commands.every((row) => row.status === 'pass'));
    assert.ok(data.commands.every((row) => typeof row.elapsedMs === 'number'));
    assert.ok(data.commands.every((row) => !Object.hasOwn(row, 'outputSample')));
    assert.ok(data.commands.some((row) => row.command === 'ontology-atlas workspace-brief [vault] --limit 5'));
    assert.ok(data.commands.some((row) => row.resolvedCommand.includes(root)));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-brief --verify-fallbacks --json — marks slow-but-passing fallback rows', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['agent-brief', root, '--verify-fallbacks', '--json', '--fallback-slow-ms', '1', '--fallback-concurrency', '2']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'agent_fallback_check');
    assert.equal(data.ok, true);
    assert.equal(data.performanceOk, false);
    assert.equal(data.failed, 0);
    assert.equal(data.slowThresholdMs, 1);
    assert.equal(data.concurrency, 2);
    assert.ok(data.slow > 0);
    assert.ok(data.commands.some((row) => row.status === 'pass' && row.slow === true));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-brief --verify-fallbacks --json — fails closed when fallback command times out', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['agent-brief', root, '--verify-fallbacks', '--json', '--fallback-timeout-ms', '1', '--fallback-concurrency', '1']);
    assert.equal(r.code, 1, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'agent_fallback_check');
    assert.equal(data.ok, false);
    assert.equal(typeof data.performanceOk, 'boolean');
    assert.equal(data.timeoutMs, 1);
    assert.ok(data.failed > 0);
    assert.ok(data.commands.some((row) => row.timedOut === true));
    assert.ok(data.commands.some((row) => /timed out after 1ms/.test(row.error || '')));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-brief --verify-fallbacks — rejects malformed fallback timeout config', async () => {
  const root = await buildGraphFixture();
  try {
    const flag = await run(['agent-brief', root, '--verify-fallbacks', '--fallback-timeout-ms=1000ms']);
    assert.equal(flag.code, 1);
    assert.match(stripAnsi(flag.stderr), /--fallback-timeout-ms must be a positive integer/);
    assert.match(stripAnsi(flag.stderr), /OATLAS_AGENT_FALLBACK_TIMEOUT_MS=N/);

    const slowFlag = await run(['agent-brief', root, '--verify-fallbacks', '--fallback-slow-ms=1000ms']);
    assert.equal(slowFlag.code, 1);
    assert.match(stripAnsi(slowFlag.stderr), /--fallback-slow-ms must be a positive integer/);
    assert.match(stripAnsi(slowFlag.stderr), /OATLAS_AGENT_FALLBACK_SLOW_MS=N/);

    const concurrencyFlag = await run(['agent-brief', root, '--verify-fallbacks', '--fallback-concurrency=fast']);
    assert.equal(concurrencyFlag.code, 1);
    assert.match(stripAnsi(concurrencyFlag.stderr), /--fallback-concurrency must be a positive integer/);
    assert.match(stripAnsi(concurrencyFlag.stderr), /OATLAS_AGENT_FALLBACK_CONCURRENCY=N/);

    const env = await run(['agent-brief', root, '--verify-fallbacks'], {
      env: { OATLAS_AGENT_FALLBACK_TIMEOUT_MS: '1000ms' },
    });
    assert.equal(env.code, 1);
    assert.match(stripAnsi(env.stderr), /OATLAS_AGENT_FALLBACK_TIMEOUT_MS must be a positive integer/);

    const slowEnv = await run(['agent-brief', root, '--verify-fallbacks'], {
      env: { OATLAS_AGENT_FALLBACK_SLOW_MS: '1000ms' },
    });
    assert.equal(slowEnv.code, 1);
    assert.match(stripAnsi(slowEnv.stderr), /OATLAS_AGENT_FALLBACK_SLOW_MS must be a positive integer/);

    const concurrencyEnv = await run(['agent-brief', root, '--verify-fallbacks'], {
      env: { OATLAS_AGENT_FALLBACK_CONCURRENCY: 'fast' },
    });
    assert.equal(concurrencyEnv.code, 1);
    assert.match(stripAnsi(concurrencyEnv.stderr), /OATLAS_AGENT_FALLBACK_CONCURRENCY must be a positive integer/);

    const ignoredWithoutVerify = await run(['agent-brief', root, '--json'], {
      env: { OATLAS_AGENT_FALLBACK_TIMEOUT_MS: '1000ms', OATLAS_AGENT_FALLBACK_SLOW_MS: '1000ms', OATLAS_AGENT_FALLBACK_CONCURRENCY: 'fast' },
    });
    assert.equal(ignoredWithoutVerify.code, 0, `stdout: ${ignoredWithoutVerify.stdout}\nstderr: ${ignoredWithoutVerify.stderr}`);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-brief --prompt — prints only the copyable handoff prompt', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['agent-brief', root, '--prompt']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /^Use the ontology-atlas MCP server/);
    assert.match(clean, /Feature guide: docs\/AGENT-GRAPH-WORKFLOW\.md/);
    assert.match(clean, /Business-to-code ontology lens/);
    assert.match(clean, /Read business\/product domains first, then capabilities, then implementation evidence/);
    assert.match(clean, /do not treat paths, APIs, routes, or commands as the ontology root/);
    assert.ok(
      clean.indexOf('Business-to-code ontology lens') < clean.indexOf('Run these first-contact MCP calls in order:'),
      'business-to-code lens should come before first-contact calls',
    );
    assert.match(clean, /Run these first-contact MCP calls in order:/);
    assert.match(clean, /CLI fallback commands when the MCP connector is unavailable:/);
    assert.match(clean, /Graph DB query pack for local markdown graph scans:/);
    assert.match(clean, /query_ontology \{"operation":"explain_relation"/);
    assert.match(clean, /ontology-atlas hubs \[vault\] --plan --limit 10 --types depends_on,relates/);
    assert.match(clean, /ontology-atlas all-paths/);
    assert.match(clean, /Investigation playbooks:/);
    assert.match(clean, /Traversal strategy:/);
    assert.match(clean, /plan_before_enumeration/);
    assert.match(clean, /Write guardrails:/);
    assert.match(clean, /Result contracts:/);
    assert.match(clean, /totalPathsExact/);
    assert.match(clean, /relation_check/);
    assert.match(clean, /add_relation/);
    assert.doesNotMatch(clean, /agent brief healthy/);
    assert.doesNotMatch(clean, /^ENTRYPOINTS/m);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-brief --graph-db-pack — prints only executable graph DB CLI commands', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['agent-brief', root, '--graph-db-pack']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    const vaultPath = escapeRegExp(root);
    assert.match(clean, /^# ontology-atlas Graph DB CLI pack/);
    assert.match(clean, /# Feature guide: docs\/AGENT-GRAPH-WORKFLOW\.md explains CLI-only use, MCP-connected use, graph DB differences, and verification checks\./);
    assert.match(clean, /# Mode guide:/);
    assert.match(clean, /# - CLI-only: validate, workspace-brief, graph scans, graph DB pack/);
    assert.match(clean, /# - MCP-connected: direct read\/write tools/);
    assert.match(clean, /# - Setup gate: config repair commands, JSON readiness/);
    assert.match(clean, /# Self-check first: Claude Code\/Codex automation can parse ok, performanceOk, failed, timeoutMs, slowThresholdMs, concurrency, wallMs, slow, commands\[\]\.timedOut, commands\[\]\.slow, and slowest\.elapsedMs\./);
    assert.match(clean, new RegExp(`ontology-atlas agent-brief ${vaultPath} --verify-fallbacks --json --fallback-timeout-ms 15000 --fallback-slow-ms 5000 --fallback-concurrency 4`));
    assert.match(clean, /# The selected vault path is already inserted/);
    assert.match(clean, /# Evidence rule: scan rows are candidates, not proof/);
    assert.match(clean, /# Proof checklist: report totalMatches\/limited\/row count, run node_profile or blast_radius for node rows, run explain\/path\/relation-check for edge rows, and report evidence\.pathsComplete for paths\./);
    assert.match(clean, /# intent: MATCH graph RETURN kind\/domain\/degree\/relation facets LIMIT 10/);
    assert.match(clean, /# goal: Read kind, domain, degree, relation, and schema-pattern buckets before choosing a narrower graph query\./);
    assert.match(clean, new RegExp(`# graph_facets[\\s\\S]*ontology-atlas facets ${vaultPath} --limit 10`));
    assert.match(clean, new RegExp(`# graph_facets[\\s\\S]*ontology-atlas schema ${vaultPath} --limit 20`));
    assert.match(clean, /# intent: MATCH \(n:capability\) WHERE degree\(n\) >= 2 RETURN n ORDER BY degree\(n\) DESC LIMIT 10/);
    assert.match(clean, /# goal: Find high-degree capability nodes as onboarding or refactor starting points\./);
    assert.match(clean, new RegExp(`# node_scan[\\s\\S]*ontology-atlas match-nodes ${vaultPath} --plan --kind capability --min-degree 2 --sort degree --limit 10`));
    assert.match(clean, new RegExp(`# edge_scan[\\s\\S]*ontology-atlas match-edges ${vaultPath} --plan --types depends_on --limit 20`));
    assert.match(clean, new RegExp(`# domain_coupling[\\s\\S]*ontology-atlas domain-matrix ${vaultPath} --limit 6 --types depends_on,relates`));
    assert.match(clean, new RegExp(`ontology-atlas hubs ${vaultPath} --plan --limit 10 --types depends_on,relates`));
    assert.match(clean, new RegExp(`# path_evidence[\\s\\S]*ontology-atlas all-paths .* ${vaultPath} --plan --force --max-hops 3 --types depends_on,relates --search-budget 1000 --limit 10`));
    assert.match(clean, new RegExp(`ontology-atlas explain .* ${vaultPath} --direction undirected --max-hops 5 --types depends_on,relates --limit 10`));
    assert.doesNotMatch(clean, /\[vault\]/);
    assert.doesNotMatch(clean, /FIRST MCP CALLS/);
    assert.doesNotMatch(clean, /PLAYBOOKS/);
    for (const command of clean.split('\n').filter((row) => /^ontology-atlas /.test(row))) {
      const result = await run(command.split(/\s+/).slice(1));
      assert.equal(result.code, 0, `${command}\nstdout: ${result.stdout}\nstderr: ${result.stderr}`);
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('agent-brief --help — documents handoff and exit gates', async () => {
  const r = await run(['agent-brief', '--help']);
  assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
  const clean = stripAnsi(r.stdout);
  assert.match(clean, /Claude Code\/Codex handoff/);
  assert.match(clean, /traversal strategy/);
  assert.match(clean, /Use --json for repeatable agent handoff snapshots/);
  assert.match(clean, /use --prompt to print only \.handoffPrompt/);
  assert.match(clean, /Use --graph-db-pack to print only executable CLI graph scan commands/);
  assert.match(clean, /Use --verify-fallbacks to execute the generated CLI fallback commands/);
  assert.match(clean, /--fallback-timeout-ms N/);
  assert.match(clean, /--fallback-slow-ms N/);
  assert.match(clean, /OATLAS_AGENT_FALLBACK_TIMEOUT_MS=N/);
  assert.match(clean, /OATLAS_AGENT_FALLBACK_SLOW_MS=N/);
  assert.match(clean, /Exits non-zero when readiness is not ready/);
  assert.match(clean, /Tuning flags forward to query_ontology agent_brief/);
});

await test('growth --json — exposes growth_plan candidate groups', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['growth', root, '--json', '--limit', '2']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'growth_plan');
    assert.equal(data.summary.externalElementRefs, 1);
    assert.equal(data.summary.totalActions, 1);
    assert.equal(data.externalElementRefs.rows[0].kind, 'materialize_external_element');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('growth — human output summarizes growth candidates and ignored refs', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['growth', root, '--limit=2']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /growth plan/);
    assert.match(clean, /summary: relations:0, external:1, ignoredExternal:0, dangling:0, unassigned:0, emptyDomains:0/);
    assert.match(clean, /external element refs/);
    assert.match(clean, /materialize_external_element/);
    assert.match(clean, /add_concept/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('growth — relation recommendations include preflight follow-up', async () => {
  const root = withVault([
    {
      slug: 'capabilities/foo',
      content:
        '---\nkind: capability\nslug: capabilities/foo\ntitle: Foo\ndomain: domains/auth\n---\n\n# Foo\n',
    },
    {
      slug: 'domains/auth',
      content:
        '---\nkind: domain\nslug: domains/auth\ntitle: Auth\n---\n\n# Auth\n',
    },
  ]);
  try {
    const r = await run(['growth', root, '--limit=2']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /relation recommendations/);
    assert.match(clean, /missing_domain_containment/);
    assert.match(clean, /next growth domains\/auth → capabilities\/foo/);
    assert.match(clean, /growth rows are proposals, not writes; preflight the relation before changing the vault/);
    assert.match(clean, /ontology-atlas relation-check domains\/auth capabilities\/foo capabilities \[vault\]/);
    assert.match(clean, /ontology-atlas path domains\/auth capabilities\/foo \[vault\] --max-hops 5/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('growth --json — fails closed on malformed growth_plan payloads', async () => {
  const root = withVault();
  const fakeMcp = join(root, 'fake-mcp-growth-malformed.mjs');
  writeFileSync(
    fakeMcp,
    [
      "import readline from 'node:readline';",
      "const rl = readline.createInterface({ input: process.stdin });",
      "rl.on('line', (line) => {",
      "  const msg = JSON.parse(line);",
      "  if (msg.id === 1) console.log(JSON.stringify({ jsonrpc: '2.0', id: 1, result: {} }));",
      "  if (msg.id === 2) {",
      "    const payload = { operation: 'growth_plan', summary: { relationRecommendations: 0, externalElementRefs: 1, externalElementRefsIgnored: 0, danglingReferences: 0, unassignedNodes: 0, emptyDomains: 0, totalActions: 1 }, relationRecommendations: { operation: 'recommend_relations', mode: 'domain_containment', totalRecommendations: 0, limited: false, recommendations: [] }, externalElementRefs: { total: 1, limited: false, rows: [] }, danglingReferences: { total: 0, limited: false, rows: [] }, unassignedNodes: { total: 0, limited: false, rows: [] }, emptyDomains: { total: 0, limited: false, rows: [] } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['growth', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /growth_plan externalElementRefs.rows length must equal total when not limited/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('growth — rejects malformed CLI flags before runtime work', async () => {
  const highLimit = await run(['growth', '--limit=501']);
  assert.equal(highLimit.code, 1);
  assert.match(stripAnsi(highLimit.stderr), /--limit must be <= 500/);

  const typo = await run(['growth', '--lmit=1']);
  assert.equal(typo.code, 1);
  assert.match(stripAnsi(typo.stderr), /unknown flag: --lmit=1\. Did you mean --limit\?/);
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
      "    const payload = { operation: 'maintenance_plan', summary: { totalActions: 1, filteredActions: 1, remainingActions: 2, executableActions: 0, reviewActions: 1 }, cursor: { afterActionId: null, found: true, reason: null, startIndex: 0, nextAfterActionId: null, hasMore: false }, byPhase: {}, bySeverity: {}, byKind: {}, nextExecutableAction: null, nextReviewAction: null, actions: [] };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const r = await run(['maintenance', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(r.code, 2, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    assert.equal(r.stdout, '');
    assert.match(stripAnsi(r.stderr), /maintenance_plan summary\.remainingActions must not exceed filteredActions/);
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
    assert.match(clean, /next review: maint_[a-f0-9]+ repair\/break_dependency_cycle · fail · review/);
    assert.match(clean, /next maintenance maint_[a-f0-9]+/);
    assert.match(clean, /queue rows are work items, not proof; narrow the queue before acting/);
    assert.match(clean, /ontology-atlas maintenance \[vault\] --phases repair --severities fail --kinds break_dependency_cycle --limit 5/);

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
  assert.match(clean, /current-page next executable\/review pointers with phase\/kind, severity, and exec\/review detail/);
});

await test('maintenance — rejects malformed CLI flags before runtime work', async () => {
  const missingPhases = await run(['maintenance', '--phases']);
  assert.equal(missingPhases.code, 1);
  assert.match(stripAnsi(missingPhases.stderr), /--phases requires a value/);
  assert.match(stripAnsi(missingPhases.stderr), /ontology-atlas maintenance/);

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

await test('health/agent-brief/workspace-brief --json — fail closed on malformed diagnosis payloads', async () => {
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
      "    let payload;",
      "    if (operation === 'health') payload = { operation: 'health', status: 'healthy', summary: { nodes: 1, edges: 0 }, checks: [{ id: 'compile_issues', status: 'pass' }] };",
      "    else if (operation === 'agent_brief') payload = { operation: 'agent_brief', sideEffect: false, status: 'healthy', readiness: { status: 'ready', score: 100, meaningfulNodes: 3, relationCount: 2, projects: 1, domains: 1, capabilities: 1, elements: 0, unresolvedEdges: 0, externalEdges: 0, growthActions: 0, healthChecks: 1 }, graph: { nodes: 3, edges: 2 }, docs: { workflowGuide: { path: 'docs/AGENT-GRAPH-WORKFLOW.md', title: 'Agent Graph Workflow', description: 'CLI-only use, MCP-connected use, graph DB differences, graph query packs, and verification checks.' }, modeComparison: [{ id: 'cli_only', label: 'CLI-only', when: 'terminal-only inspection.', gives: 'graph DB pack.' }, { id: 'mcp_connected', label: 'MCP-connected', when: 'registered.', gives: 'structured repair fields and write guardrails.' }, { id: 'graph_db_pack', label: 'Graph DB pack', when: 'database-style graph exploration.', gives: 'proof follow-ups.' }, { id: 'setup_gate', label: 'Setup gate', when: 'unclear setup.', gives: 'JSON readiness and restart guidance.' }], graphScanProofChecklist: [{ id: 'report_scan_scope', label: 'Report scan scope', evidence: ['totalMatches', 'limited'] }, { id: 'prove_node_rows', label: 'Prove node rows', evidence: ['node_profile', 'blast_radius'] }, { id: 'prove_edge_rows', label: 'Prove edge rows', evidence: ['explain_relation', 'path', 'relation_check'] }, { id: 'prove_path_completeness', label: 'Prove path completeness', evidence: ['evidence.pathsComplete'] }] }, businessOntologyLens: { policy: 'business-first', readOrder: ['domain', 'capability', 'element'], businessDomains: [], capabilityOutcomes: [], implementationEvidence: [], decisionQuestions: ['Which business/product domain boundary does this code change?', 'What capability claim can a planner, marketer, or leader discuss?', 'Which implementation evidence proves or disproves that capability?'], guidance: ['Read the business outcome first, then business/product domains, capabilities, and implementation evidence.', 'Do not treat paths, APIs, routes, or commands as the ontology root.'] }, handoffPrompt: 'Use the ontology-atlas MCP server. Run these first-contact MCP calls in order. CLI fallback commands when the MCP connector is unavailable. Graph DB query pack. Kind classification contract before writing frontmatter. Do not classify from the label alone. domain: shared vocabulary boundary. capability: user-visible behavior. element: concrete implementation part. unknown: temporary review signal. High-confidence gate. Containment spine. Color contract. source path, symbol, route, command, or MCP tool evidence. why not the nearest adjacent kind. similar_nodes. Investigation playbooks. Traversal strategy. plan_before_enumeration. Write guardrails. Result contracts. totalPathsExact. relation_check before add_relation.', cliFallbackCommands: ['ontology-atlas health [vault]'], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] }, nextActions: [], entrypoints: [], firstCalls: [{ tool: 'query_ontology', arguments: {} }], playbooks: [{ id: 'refactor_impact', goal: 'Impact.', calls: [{ tool: 'query_ontology', arguments: { operation: 'health' } }] }], writePolicy: ['Read first.'] };",
      "    else payload = { operation: 'workspace_brief', status: 'healthy', summary: { nodes: 1, edges: 0 }, nextActions: [{ kind: 'cleanup', severity: 'fatal' }], health: { checks: [{ id: 'compile_issues', status: 'pass', count: 0 }] } };",
      "    console.log(JSON.stringify({ jsonrpc: '2.0', id: 2, result: { content: [{ text: JSON.stringify(payload) }], structuredContent: payload } }));",
      "  }",
      "});",
    ].join('\n'),
    'utf-8',
  );
  try {
    const health = await run(['health', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(health.code, 2, `stdout: ${health.stdout}\nstderr: ${health.stderr}`);
    assert.equal(health.stdout, '');
    assert.match(stripAnsi(health.stderr), /health checks\[0\] has an invalid health-check shape/);

    const agent = await run(['agent-brief', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
    assert.equal(agent.code, 2, `stdout: ${agent.stdout}\nstderr: ${agent.stderr}`);
    assert.equal(agent.stdout, '');
    assert.match(stripAnsi(agent.stderr), /agent_brief firstCalls\[0\] has an invalid tool-call shape/);

    const brief = await run(['workspace-brief', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
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
  assert.match(clean, /--limit is a first-contact alias for --node-limit/);
  assert.match(clean, /Use --json for repeatable automation gates such as pnpm dogfood:health/);
  assert.match(clean, /Failing health checks exit non-zero; use workspace-brief when you also need hotspots and next actions/);
  assert.match(clean, /Use pnpm dogfood:status for the cheap human-readable health \+ workspace-brief \+ agent-brief \+ maintenance queue/);
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

await test('health --limit — accepts agent_brief first-contact fallback alias', async () => {
  const root = await buildGraphFixture();
  try {
    const r = await run(['health', root, '--json', '--limit=1']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'health');
    assert.equal(data.status, 'healthy');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

await test('health/agent-brief/workspace-brief — reject malformed diagnosis tuning flags', async () => {
  const missing = await run(['health', '--component-types']);
  assert.equal(missing.code, 1);
  assert.match(stripAnsi(missing.stderr), /--component-types requires a value/);

  const missingAgent = await run(['agent-brief', '--dependency-types']);
  assert.equal(missingAgent.code, 1);
  assert.match(stripAnsi(missingAgent.stderr), /--dependency-types requires a value/);

  const conflictingAgentOutput = await run(['agent-brief', '--json', '--prompt']);
  assert.equal(conflictingAgentOutput.code, 1);
  assert.match(stripAnsi(conflictingAgentOutput.stderr), /--json and --prompt cannot be used together/);

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
    assert.match(clean, /next cycle capabilities\/a → capabilities\/b/);
    assert.match(clean, /cycle rows are failures, but fix the edge only after inspecting path evidence and maintenance guidance/);
    assert.match(clean, /ontology-atlas path capabilities\/a capabilities\/b \[vault\] --max-hops 8/);
    assert.match(clean, /ontology-atlas match-edges \[vault\] --from capabilities\/a --to capabilities\/b --types depends_on --limit 10/);
    assert.match(clean, /ontology-atlas maintenance \[vault\] --phases repair --severities fail --kinds break_dependency_cycle --limit 3/);
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
    const r = await run(['cycles', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
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
  const root = buildCycleFixture();
  try {
    const r = await run(['node', 'capabilities/a', root, '--types=depends_on', '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.operation, 'node_profile');
    assert.equal(data.edges.incoming.total, 1);
    assert.deepEqual(data.edges.incoming.byRelation, { dependencies: 1 });
    assert.deepEqual(data.edges.incoming.byRelationType, { depends_on: 1 });
    assert.deepEqual(data.edges.outgoing.byRelation, { dependencies: 1 });
    assert.deepEqual(data.edges.outgoing.byRelationType, { depends_on: 1 });
    assert.equal(data.edges.outgoing.edges[0]?.via, 'dependencies');
    assert.equal(data.edges.outgoing.edges[0]?.relationType, 'depends_on');

    const human = await run(['node', 'capabilities/a', root, '--types=depends_on']);
    assert.equal(human.code, 0, `stdout: ${human.stdout}\nstderr: ${human.stderr}`);
    const clean = stripAnsi(human.stdout);
    assert.match(clean, /filters types=depends_on/);
    assert.match(clean, /depends_on/);
    assert.doesNotMatch(clean, /\ndependencies\s+×/);
    assert.match(clean, /capabilities\/b/);
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
    const r = await run(['node', 'capabilities/foo', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
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
    const r = await run(['similar', 'foo', root, '--json'], { env: { OATLAS_MCP_PATH: fakeMcp } });
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

await test('init — fresh starter vault compiles clean (no ambiguous alias / compile issue) [cold-start]', async () => {
  // A freshly scaffolded vault must be CLEAN so the SessionStart hook stays
  // silent on first contact (AGENTS.md: "a clean vault stays silent (no
  // noise)"). Starter files that share a tail slug (e.g. all named example.md)
  // produce an ambiguous-alias compile issue → the hook would nudge the user to
  // "fix before relying on the graph" on a pristine vault. Guard against that.
  const root = mkdtempSync(join(tmpdir(), 'cli-init-clean-'));
  try {
    const init = await run(['init', 'ontology'], { cwd: root });
    assert.equal(init.code, 0, `init failed: ${init.stdout}\n${init.stderr}`);
    const c = await run(['compile', join(root, 'ontology'), '--json']);
    assert.equal(c.code, 0, `compile failed: ${c.stdout}\n${c.stderr}`);
    const parsed = JSON.parse(c.stdout);
    assert.equal(
      parsed.ambiguousAliasCount,
      0,
      `fresh init has ambiguous aliases: ${JSON.stringify(parsed.ambiguousAliases)}`,
    );
    assert.equal(
      parsed.issueCount,
      0,
      `fresh init has compile issues: ${JSON.stringify(parsed.issues)}`,
    );
    assert.equal(parsed.unresolvedEdgeCount, 0, 'fresh init has unresolved edges');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

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
    assert.equal(existsSyncTest(join(vault, 'domains', 'example-domain.md')), false);
    assert.equal(
      existsSyncTest(join(vault, 'capabilities', 'example-capability.md')),
      false,
    );
    assert.equal(existsSyncTest(join(vault, 'elements', 'example-element.md')), false);
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
    const editedDomain = join(vault, 'domains', 'example-domain.md');
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
    assert.equal(existsSyncTest(join(vault, 'capabilities', 'example-capability.md')), false);
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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

// ── index (R+ — long-running project ontology indexing entrypoint) ─────

await test('index --json — analyzes and verifies a repo without mutating the vault', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run(['index', repo, '--vault', vault, '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.mode, 'plan');
    assert.equal(data.apply, false);
    assert.equal(data.rootPath, repo);
    assert.equal(data.analyze.framework, 'fsd');
    assert.equal(data.plan.concepts, 3);
    assert.equal(data.plan.suggestedRelations, 2);
    assert.ok(data.imports.filesScanned >= 2);
    assert.ok(data.plan.importRelations >= 1);
    assert.equal(data.meaningGate.policy, 'business-first');
    assert.equal(data.meaningGate.sourceStructureRole, 'implementation-evidence');
    assert.equal(data.meaningGate.businessOntology.domains, 0);
    assert.equal(data.meaningGate.businessOntology.capabilities, 0);
    assert.equal(data.meaningGate.businessOntology.evidence, 0);
    assert.equal(data.meaningGate.implementationEvidence.elements, 0);
    assert.equal(data.meaningGate.implementationEvidence.reviewRequiredCapabilities, 2);
    assert.match(data.meaningGate.reviewQuestions[0], /business\/product/);
    assert.equal(data.validation.problemFiles, 0);
    assert.equal(existsSyncTest(join(vault, 'bs-app.md')), false);
    assert.equal(existsSyncTest(join(vault, 'capabilities', 'auth.md')), false);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('index — human plan shows business ontology evidence rows before apply', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    mkdirSync(join(repo, 'docs', 'ontology', 'capabilities'), { recursive: true });
    mkdirSync(join(repo, 'docs', 'ontology', 'domains'), { recursive: true });
    for (const slug of ['sales', 'support', 'growth', 'billing-ops', 'quality', 'risk']) {
      writeFileSync(
        join(repo, 'docs', 'ontology', 'domains', `${slug}.md`),
        ['---', 'kind: domain', `title: ${slug}`, '---', ''].join('\n'),
        'utf-8',
      );
    }
    writeFileSync(
      join(repo, 'docs', 'ontology', 'capabilities', 'auth.md'),
      [
        '---',
        'kind: capability',
        'title: Authentication',
        'elements:',
        '  - src/features/auth',
        '---',
        '',
      ].join('\n'),
      'utf-8',
    );

    const r = await run(['index', repo, '--vault', vault, '--skip-imports']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const clean = stripAnsi(r.stdout);
    assert.match(clean, /7 business evidence rows/);
    assert.match(clean, /business evidence/);
    assert.match(clean, /capability\s+capabilities\/auth\s+docs\/ontology\/capabilities\/auth\.md/);
    assert.ok(
      clean.indexOf('capability capabilities/auth') < clean.indexOf('domain domains/'),
      'capability evidence should be visible before domain evidence samples',
    );
    assert.match(clean, /review-required capabilities/);
    assert.match(clean, /review required/);
    assert.match(clean, /capabilities\/billing/);
    assert.match(clean, /src\/features\/billing/);
    assert.match(clean, /no README\/domain evidence for business meaning/);
    assert.equal(existsSyncTest(join(vault, 'capabilities', 'auth.md')), false);
  } finally {
    rmSync(vault, { recursive: true, force: true });
    rmSync(repo, { recursive: true, force: true });
  }
});

await test('index --apply --json — applies the same ontology indexing pipeline as bootstrap', async () => {
  const vault = withVault([]);
  const repo = makeFullRepo();
  try {
    const r = await run(['index', repo, '--vault', vault, '--apply', '--json']);
    assert.equal(r.code, 0, `stdout: ${r.stdout}\nstderr: ${r.stderr}`);
    const data = JSON.parse(r.stdout);
    assert.equal(data.mode, 'apply');
    assert.equal(data.apply.summary.errors, 0);
    assert.equal(existsSyncTest(join(vault, 'bs-app.md')), true);
    assert.equal(existsSyncTest(join(vault, 'capabilities', 'auth.md')), true);
    const authDoc = readFileSync(join(vault, 'capabilities', 'auth.md'), 'utf-8');
    assert.match(authDoc, /dependencies:.*\bbilling\b/s);
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
      env: { OATLAS_MCP_PATH: fakeMcp },
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
