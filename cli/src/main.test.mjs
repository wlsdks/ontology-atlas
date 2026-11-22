import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { after, before, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');

function runPackage(args, cwd) {
  const result = spawnSync(process.execPath, [PACKAGE_DIR, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NO_COLOR: '1', OATLAS_MCP_PATH: '' },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

describe('node <checkout>/cli', () => {
  let temp;
  before(() => {
    temp = mkdtempSync(join(tmpdir(), 'oatlas-init-entry-'));
  });
  after(() => rmSync(temp, { recursive: true, force: true }));

  it('init scaffolds the vault and wires the checkout MCP server beside it', () => {
    const { status, stdout, stderr } = runPackage(['init', 'ontology'], temp);
    assert.equal(status, 0, stderr);
    const vault = join(temp, 'ontology');
    for (const file of ['project.md', 'AGENTS.md', 'CLAUDE.md', '.mcp.json', join('.codex', 'config.toml')]) {
      assert.equal(existsSync(join(vault, file)), true, `${file} is scaffolded`);
    }
    const server = JSON.parse(readFileSync(join(temp, '.mcp.json'), 'utf-8')).mcpServers['ontology-atlas'];
    assert.equal(server.args[0], join(PACKAGE_DIR, '..', 'mcp', 'src', 'index.js'));
    assert.equal(server.env.OATLAS_VAULT, './ontology');
    assert.match(stdout, /\/atlas-grow/);
  });

  it('a second init into a filled folder preserves every file it finds', () => {
    const project = join(temp, 'ontology', 'project.md');
    const before = readFileSync(project, 'utf-8');
    const { status, stdout } = runPackage(['init', 'ontology'], temp);
    assert.equal(status, 0);
    assert.match(stdout, /existing file\(s\) preserved/);
    assert.equal(readFileSync(project, 'utf-8'), before);
  });

  it('help prints the init usage and every other command is refused by name', () => {
    assert.match(runPackage(['--help'], temp).stdout, /init/);
    const unknown = runPackage(['validate'], temp);
    assert.equal(unknown.status, 1);
    assert.match(unknown.stderr, /The only command is init/);
    const typo = runPackage(['inti'], temp);
    assert.equal(typo.status, 1);
    assert.match(typo.stderr, /Did you mean init\?/);
  });
});
