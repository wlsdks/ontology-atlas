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

const temp = mkdtempSync(join(tmpdir(), 'omot-clean-onboarding-'));
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
assert.match(init.stdout, /codex mcp add oh-my-ontology/);
assert.match(init.stdout, /\.codex\/config\.toml/);
assert.match(init.stdout, new RegExp(`${expectedToolCount} tools`));
assert.match(init.stdout, expectedToolSplitRe);
assert.match(init.stdout, /oh-my-ontology analyze \. --vault \.\/ontology/);
assert.match(init.stdout, /oh-my-ontology bootstrap \. --vault \.\/ontology/);
assert.doesNotMatch(init.stdout, /\/path\/to\/your\/repo/);

const mcpConfig = JSON.parse(readFileSync(join(project, '.mcp.json'), 'utf-8'));
const server = mcpConfig.mcpServers['oh-my-ontology'];
assert.equal(server.command, 'node');
assert.ok(server.args[0].endsWith('/mcp/src/index.js'));
assert.equal(server.env.OMOT_VAULT, './ontology');

const codexConfig = readFileSync(join(project, '.codex', 'config.toml'), 'utf-8');
assert.match(codexConfig, /\[mcp_servers\.oh-my-ontology\]/);
assert.match(codexConfig, /command = "node"/);
assert.match(codexConfig, /OMOT_VAULT = "\.\/ontology"/);

const vaultCodexConfig = readFileSync(join(project, 'ontology', '.codex', 'config.toml'), 'utf-8');
assert.match(vaultCodexConfig, /OMOT_VAULT = "\."/);

run('node', [VERIFY], {
  cwd: ROOT,
  env: { ...process.env, OMOT_VAULT: join(project, 'ontology') },
});

const bootstrap = run(
  'node',
  [CLI, 'bootstrap', '.', '--vault', './ontology', '--skip-imports'],
  { cwd: project },
);
assert.match(bootstrap.stdout, /starters.*4.*removed/);
assert.equal(existsSync(join(project, 'ontology', 'project.md')), false);
assert.equal(
  existsSync(join(project, 'ontology', 'domains', 'example.md')),
  false,
);
assert.equal(
  existsSync(join(project, 'ontology', 'capabilities', 'example.md')),
  false,
);
assert.equal(
  existsSync(join(project, 'ontology', 'elements', 'example.md')),
  false,
);
assert.equal(existsSync(join(project, 'ontology', 'clean-onboarding-app.md')), true);
assert.equal(existsSync(join(project, 'ontology', 'domains', 'capture.md')), true);
assert.equal(
  existsSync(join(project, 'ontology', 'capabilities', 'capture.md')),
  true,
);
run('node', [CLI, 'validate', join(project, 'ontology')], { cwd: project });

if (hasCommand('claude')) {
  const claude = run('claude', ['mcp', 'list'], {
    cwd: project,
    env: { ...process.env, HOME: fakeHome },
  });
  assert.match(claude.stdout, /oh-my-ontology: .*Connected/);
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
      'oh-my-ontology',
      '--env',
      `OMOT_VAULT=${join(project, 'ontology')}`,
      '--',
      server.command,
      ...server.args,
    ],
    {
      cwd: project,
      env: { ...process.env, CODEX_HOME: fakeCodexHome },
    },
  );
  const get = run('codex', ['mcp', 'get', 'oh-my-ontology'], {
    cwd: project,
    env: { ...process.env, CODEX_HOME: fakeCodexHome },
  });
  assert.match(get.stdout, /oh-my-ontology/);
  assert.match(get.stdout, /transport: stdio/);
} else {
  console.log('skip codex clean check: codex command not found');
}

console.log(`clean onboarding smoke passed: ${project}`);
