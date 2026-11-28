// The launcher is the command every agent config names, so what it refuses and what it passes through
// are tested by running a copy of it inside a made-up checkout. A copy of the Node executable stands
// in for the compiled program: it runs on every platform and takes `-e <script>` as its arguments.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

const launcherSource = path.join(import.meta.dirname, 'index.js');
const repository = path.resolve(import.meta.dirname, '..', '..');

const TRIPLES = {
  'darwin arm64': 'aarch64-apple-darwin',
  'darwin x64': 'x86_64-apple-darwin',
  'win32 x64': 'x86_64-pc-windows-msvc',
  'linux x64': 'x86_64-unknown-linux-gnu',
  'linux arm64': 'aarch64-unknown-linux-gnu',
};
const programName = `ontology-atlas-mcp-${TRIPLES[`${process.platform} ${process.arch}`]}${
  process.platform === 'win32' ? '.exe' : ''
}`;

const NOT_BUILT = [
  '[ontology-atlas-mcp] The MCP server is now a compiled program, and this checkout has not built it.',
  '[ontology-atlas-mcp] Run `pnpm mcp:build-binary` in the checkout, then restart your agent.',
  '[ontology-atlas-mcp] Your agent config is unchanged and will work after the build.',
  '',
].join('\n');
const STALE = [
  '[ontology-atlas-mcp] The built MCP server is older than this checkout, so it was not started.',
  '[ontology-atlas-mcp] Run `pnpm mcp:build-binary` in the checkout, then restart your agent.',
  '',
].join('\n');

const hour = 3_600_000;

function touch(file, atMs) {
  utimesSync(file, atMs / 1000, atMs / 1000);
}

function write(file, text, atMs) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  touch(file, atMs);
}

/** A checkout holding the launcher and two crates: `mcp-server` names `shared-rules` by path. */
function makeCheckout(t, { builtAtMs = null, sourcesAtMs = Date.now() - 2 * hour } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'atlas-launcher-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(path.join(root, 'mcp', 'src'), { recursive: true });
  copyFileSync(launcherSource, path.join(root, 'mcp', 'src', 'index.js'));
  const workspace = path.join(root, 'src-tauri');
  write(path.join(workspace, 'Cargo.toml'), '[workspace]\n', sourcesAtMs);
  write(path.join(workspace, 'Cargo.lock'), '# lock\n', sourcesAtMs);
  const crates = path.join(workspace, 'crates');
  write(
    path.join(crates, 'mcp-server', 'Cargo.toml'),
    '[dependencies]\nshared-rules = { path = "../shared-rules" }\n',
    sourcesAtMs,
  );
  write(path.join(crates, 'mcp-server', 'src', 'main.rs'), 'fn main() {}\n', sourcesAtMs);
  write(path.join(crates, 'shared-rules', 'Cargo.toml'), '[package]\n', sourcesAtMs);
  write(path.join(crates, 'shared-rules', 'src', 'lib.rs'), '\n', sourcesAtMs);
  write(path.join(crates, 'unrelated-screen', 'src', 'lib.rs'), '\n', sourcesAtMs);
  if (builtAtMs !== null) {
    const program = path.join(workspace, 'binaries', programName);
    mkdirSync(path.dirname(program), { recursive: true });
    copyFileSync(process.execPath, program, constants.COPYFILE_FICLONE);
    touch(program, builtAtMs);
  }
  return { root, workspace, crates, launcher: path.join(root, 'mcp', 'src', 'index.js') };
}

function launch(checkout, args = [], options = {}) {
  return spawnSync(process.execPath, [checkout.launcher, ...args], { encoding: 'utf8', ...options });
}

test('a checkout that has not built the program gets the three lines and exit 1, and no output on stdout', (t) => {
  const result = launch(makeCheckout(t));
  assert.equal(result.status, 1);
  assert.equal(result.stderr, NOT_BUILT);
  assert.equal(result.stdout, '');
});

test('a program older than a crate it is built from is not started', (t) => {
  const checkout = makeCheckout(t, { builtAtMs: Date.now() - hour });
  write(path.join(checkout.crates, 'shared-rules', 'src', 'lib.rs'), 'pub fn changed() {}\n', Date.now());
  const result = launch(checkout, ['-e', 'process.stdout.write("started")']);
  assert.equal(result.status, 1);
  assert.equal(result.stderr, STALE);
  assert.equal(result.stdout, '');
});

test('a newer lockfile or workspace manifest also makes the program stale', (t) => {
  const checkout = makeCheckout(t, { builtAtMs: Date.now() - hour });
  touch(path.join(checkout.workspace, 'Cargo.lock'), Date.now());
  assert.equal(launch(checkout).stderr, STALE);
});

test('a newer test, note or unrelated crate does not make the program stale', (t) => {
  const checkout = makeCheckout(t, { builtAtMs: Date.now() - hour });
  write(path.join(checkout.crates, 'mcp-server', 'tests', 'protocol.rs'), '\n', Date.now());
  write(path.join(checkout.crates, 'mcp-server', 'README.md'), '# notes\n', Date.now());
  write(path.join(checkout.crates, 'unrelated-screen', 'src', 'lib.rs'), 'pub fn screen() {}\n', Date.now());
  const result = launch(checkout, ['-e', 'process.stdout.write("started")']);
  assert.equal(result.status, 0);
  assert.equal(result.stdout, 'started');
});

test('a current program receives the arguments, environment and input, and its exit code is the launcher’s', (t) => {
  const checkout = makeCheckout(t, { builtAtMs: Date.now() - hour });
  const script =
    'let input = ""; process.stdin.on("data", (chunk) => { input += chunk; });' +
    'process.stdin.on("end", () => { process.stdout.write(`${process.env.OATLAS_VAULT}|${input}`); process.exit(7); });';
  const result = launch(checkout, ['-e', script], {
    env: { ...process.env, OATLAS_VAULT: 'the-vault' },
    input: 'hello\n',
  });
  assert.equal(result.status, 7);
  assert.equal(result.stdout, 'the-vault|hello\n');
});

test('the built program of this checkout lists the tools the generated surface record declares', (t) => {
  const program = path.join(repository, 'src-tauri', 'binaries', programName);
  if (!existsSync(program)) {
    t.skip(`${programName} is not built here; run pnpm mcp:build-binary`);
    return;
  }
  const request = (id, method, params) => `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`;
  const result = spawnSync(process.execPath, [launcherSource], {
    encoding: 'utf8',
    input:
      request(1, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'launcher-test', version: '0' } }) +
      request(2, 'tools/list', {}),
    env: { ...process.env, OATLAS_VAULT: path.join(repository, 'samples', 'storefront') },
    timeout: 25_000,
  });
  if (result.stderr.startsWith('[ontology-atlas-mcp] The built MCP server is older')) {
    t.skip('the built program is older than the crates; run pnpm mcp:build-binary');
    return;
  }
  const answer = result.stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line))
    .find((message) => message.id === 2);
  const declared = JSON.parse(readFileSync(path.join(repository, 'docs', '.generated', 'mcp-surface.json'), 'utf8')).mcp.toolCount;
  assert.equal(answer.result.tools.length, declared);
});
