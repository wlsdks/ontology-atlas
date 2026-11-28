import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';

import {
  cargoProgramPath,
  pinnedToolchain,
  reportedToolchain,
  sidecarPath,
  toolchainNotice,
} from './rust-mcp-program.mjs';

const root = path.resolve(import.meta.dirname, '..', '..');

test('a build with another compiler than the pinned one prints the line the spec gives', () => {
  const pinned = pinnedToolchain(readFileSync(path.join(root, 'rust-toolchain.toml'), 'utf8'));
  assert.equal(toolchainNotice(pinned, pinned), null);
  assert.equal(
    toolchainNotice('1.100.0', reportedToolchain('rustc 1.99.1 (abcdef 2026-10-01)\n')),
    'Built with Rust 1.99.1. Atlas is tested with Rust 1.100.0; install it with rustup to build the tested program.',
  );
  assert.match(toolchainNotice('1.100.0', reportedToolchain('not rust')), /^Built with Rust \(unknown\)\./);
});

test('the Windows program is an .exe in both places and a cross build lands under its target folder', () => {
  const windows = 'x86_64-pc-windows-msvc';
  assert.ok(sidecarPath(root, windows).endsWith('ontology-atlas-mcp-x86_64-pc-windows-msvc.exe'));
  assert.ok(
    cargoProgramPath(root, windows, 'aarch64-apple-darwin').endsWith(
      path.join('target', windows, 'release', 'ontology-atlas-mcp-rust.exe'),
    ),
  );
  assert.ok(
    cargoProgramPath(root, 'aarch64-apple-darwin', 'aarch64-apple-darwin').endsWith(
      path.join('target', 'release', 'ontology-atlas-mcp-rust'),
    ),
  );
});

test('the launcher looks for the same file name the build places', () => {
  const launcher = readFileSync(path.join(root, 'mcp', 'src', 'index.js'), 'utf8');
  for (const [host, triple] of [
    ['darwin arm64', 'aarch64-apple-darwin'],
    ['darwin x64', 'x86_64-apple-darwin'],
    ['win32 x64', 'x86_64-pc-windows-msvc'],
    ['linux x64', 'x86_64-unknown-linux-gnu'],
    ['linux arm64', 'aarch64-unknown-linux-gnu'],
  ]) {
    assert.ok(launcher.includes(`'${host}': '${triple}'`), `${host} maps to ${triple} in index.js`);
  }
  assert.ok(launcher.includes('`${PROGRAM}-${triple}${'), 'the file name is the program name, a dash and the target');
  assert.ok(launcher.includes("'.exe'"), 'a Windows program carries .exe');
  assert.equal(path.basename(sidecarPath(root, 'aarch64-apple-darwin')), 'ontology-atlas-mcp-aarch64-apple-darwin');
});
