#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { parseMcpToolMetadataFromDescription } from '../cli/src/lib/mcp-metadata.mjs';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const CLI = join(ROOT, 'cli', 'src', 'index.mjs');
const VERIFY = join(ROOT, 'mcp', 'scripts', 'verify.mjs');
const MCP_PKG = JSON.parse(readFileSync(join(ROOT, 'mcp', 'package.json'), 'utf-8'));
const mcpToolMetadata = parseMcpToolMetadataFromDescription(MCP_PKG.description);
const expectedToolCount = mcpToolMetadata?.toolCount;
const expectedToolSplitRe = mcpToolMetadata?.splitPattern;

assert.ok(mcpToolMetadata, 'mcp/package.json description must include the current tool count and split');

function run(cmd, args, options = {}) {
  const result = spawnSync(cmd, args, {
    cwd: options.cwd,
    env: options.env,
    encoding: 'utf-8',
  });
  if (options.allowFailure) return result;
  assert.equal(
    result.status,
    0,
    `${cmd} ${args.join(' ')} failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
  return result;
}

function hasCommand(command) {
  return spawnSync('sh', ['-lc', `command -v ${command}`], {
    encoding: 'utf-8',
  }).status === 0;
}

function stripAnsi(value) {
  return value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '');
}

const temp = mkdtempSync(join(tmpdir(), 'ontology-atlas-clean-onboarding-'));
const fakeHome = join(temp, 'home');
const fakeCodexHome = join(temp, 'codex-home');
const project = join(temp, 'project');
mkdirSync(fakeHome, { recursive: true });
mkdirSync(fakeCodexHome, { recursive: true });
mkdirSync(join(project, 'src', 'features', 'capture'), { recursive: true });
writeFileSync(
  join(project, 'package.json'),
  JSON.stringify({ name: 'clean-onboarding-app', type: 'module' }, null, 2),
);
writeFileSync(
  join(project, 'README.md'),
  '# Clean Onboarding App\n\n## Capture\n\nCapture short notes.\n',
);

const init = run('node', [CLI, 'init', 'ontology'], { cwd: project });
const initOutput = stripAnsi(init.stdout);
assert.match(initOutput, /codex mcp add ontology-atlas/);
assert.match(initOutput, /\.codex\/config\.toml/);
assert.match(initOutput, new RegExp(`${expectedToolCount} tools`));
assert.match(initOutput, expectedToolSplitRe);
assert.match(initOutput, /analyze \. --vault \.\/ontology/);
assert.match(initOutput, /bootstrap \. --vault \.\/ontology/);
assert.doesNotMatch(initOutput, /\/path\/to\/your\/repo/);

const mcpConfig = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf-8'));
const server = mcpConfig.mcpServers['ontology-atlas'];
assert.equal(server.command, 'node');
assert.ok(server.args[0].endsWith('/mcp/src/index.js'));
assert.equal(server.env.OATLAS_VAULT, './ontology');

const codexConfig = readFileSync(join(project, '.codex', 'config.toml'), 'utf-8');
assert.match(codexConfig, /\[mcp_servers\.ontology-atlas\]/);
assert.match(codexConfig, /command = "node"/);
assert.match(codexConfig, /OATLAS_VAULT = "\.\/ontology"/);

const vaultCodexConfig = readFileSync(join(project, 'ontology', '.codex', 'config.toml'), 'utf-8');
assert.match(vaultCodexConfig, /OATLAS_VAULT = "\."/);

run('node', [VERIFY], {
  cwd: ROOT,
  env: { ...process.env, OATLAS_VAULT: join(project, 'ontology') },
});

const bootstrap = run(
  'node',
  [CLI, 'bootstrap', '.', '--vault', './ontology', '--skip-imports', '--json'],
  { cwd: project, allowFailure: true },
);
assert.equal(bootstrap.status, 3);
const bootstrapJson = JSON.parse(bootstrap.stdout);
assert.equal(bootstrapJson.mode, 'review');
assert.equal(bootstrapJson.writeEligible, false);
assert.equal(bootstrapJson.reason, 'approval_required');
assert.equal(bootstrapJson.next.writes, 0);
assert.equal(bootstrapJson.guard.qualification, 'constructionQualification:v1');
assert.equal(existsSync(join(project, 'ontology', 'project.md')), true);
assert.equal(existsSync(join(project, 'ontology', 'domains', 'example-domain.md')), true);
assert.equal(existsSync(join(project, 'ontology', 'capabilities', 'example-capability.md')), true);
assert.equal(existsSync(join(project, 'ontology', 'elements', 'example-element.md')), true);
assert.equal(existsSync(join(project, 'ontology', 'clean-onboarding-app.md')), false);
assert.equal(existsSync(join(project, 'ontology', 'domains', 'capture.md')), false);
assert.equal(existsSync(join(project, 'ontology', 'capabilities', 'capture.md')), false);
run('node', [CLI, 'validate', join(project, 'ontology')], { cwd: project });

if (hasCommand('claude')) {
  const claude = run('claude', ['mcp', 'list'], {
    cwd: project,
    env: { ...process.env, HOME: fakeHome },
  });
  // Current Claude Code may require an explicit first-run trust approval for a
  // project-local MCP server. Seeing the registered server in that state still
  // proves clean onboarding wrote a discoverable configuration; the user must
  // complete the client-owned approval before tool calls can connect.
  assert.match(claude.stdout, /ontology-atlas: .*(Connected|Pending approval)/);
} else {
  console.log('skip claude clean check: claude command not found');
}

if (hasCommand('codex')) {
  const before = run('codex', ['mcp', 'list'], {
    cwd: project,
    env: { ...process.env, CODEX_HOME: fakeCodexHome },
  });
  assert.match(before.stdout, /No MCP servers configured yet/);

  run(
    'codex',
    [
      'mcp',
      'add',
      'ontology-atlas',
      '--env',
      `OATLAS_VAULT=${join(project, 'ontology')}`,
      '--',
      server.command,
      ...server.args,
    ],
    {
      cwd: project,
      env: { ...process.env, CODEX_HOME: fakeCodexHome },
    },
  );
  const get = run('codex', ['mcp', 'get', 'ontology-atlas'], {
    cwd: project,
    env: { ...process.env, CODEX_HOME: fakeCodexHome },
  });
  assert.match(get.stdout, /ontology-atlas/);
  assert.match(get.stdout, /transport: stdio/);
} else {
  console.log('skip codex clean check: codex command not found');
}

console.log(`clean onboarding smoke passed: ${project}`);
