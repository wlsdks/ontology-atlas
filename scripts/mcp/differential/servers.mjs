// Names for the server programs the harness can start, and the environment each one runs in.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

import { MCP_BINARY_NAME, MCP_BINARY_OUTPUT_DIR, hostTargetTriple } from '../../lib/packaging/mcp-binary.mjs';
import { GIT_ENV } from '../../../tests/differential/support/vault-fixtures.mjs';

export const FIXED_CLOCK_MS = 1_790_000_000_000;
export const UID_SEED = 'differential';
export const LOCALES = Object.freeze(['ko_KR.UTF-8', 'en_US.UTF-8']);

/**
 * @typedef {{ label: string, command: string, args: string[], deterministic: boolean }} ServerSpec
 */

export function splitCommand(text) {
  const parts = [];
  for (const match of text.matchAll(/"([^"]*)"|'([^']*)'|(\S+)/g)) parts.push(match[1] ?? match[2] ?? match[3]);
  return parts;
}

/**
 * `node` the JavaScript server on Node with the pinned inputs; `node:<checkout>` the same from
 * another checkout (the drift mode); `bun` the Bun twin, built on first use; `bun-shipped` the
 * binary `pnpm mcp:build-binary` made (its clock and UIDs are not pinned); `rust` the Rust program
 * (`ATLAS_MCP_RUST` or the cargo release path); `cmd:<command line>` anything else.
 */
export function resolveServer(spec, { repoRoot, workRoot }) {
  const preload = path.join(repoRoot, 'tests', 'differential', 'support', 'deterministic-preload.mjs');
  if (spec === 'node' || spec.startsWith('node:')) {
    const tree = spec === 'node' ? repoRoot : path.resolve(spec.slice('node:'.length));
    return {
      label: spec,
      command: process.execPath,
      args: ['--import', preload, path.join(tree, 'mcp', 'src', 'index.js')],
      deterministic: true,
    };
  }
  if (spec === 'bun') {
    const twin = path.join(workRoot, 'bun-twin');
    if (!existsSync(twin)) {
      const built = spawnSync(
        process.execPath,
        [path.join(repoRoot, 'scripts', 'mcp', 'differential', 'build-bun-twin.mjs'), `--outfile=${twin}`],
        { stdio: 'inherit' },
      );
      if (built.status !== 0 || !existsSync(twin)) throw new Error('the Bun twin did not build');
    }
    return { label: 'bun', command: twin, args: [], deterministic: true };
  }
  if (spec === 'bun-shipped') {
    const triple = hostTargetTriple();
    const binary = path.join(repoRoot, MCP_BINARY_OUTPUT_DIR, `${MCP_BINARY_NAME}-${triple}`);
    if (!existsSync(binary)) throw new Error(`no shipped binary at ${binary}; run pnpm mcp:build-binary`);
    return { label: 'bun-shipped', command: binary, args: [], deterministic: false };
  }
  if (spec === 'rust') {
    const program = process.env.ATLAS_MCP_RUST
      ?? path.join(repoRoot, 'src-tauri', 'target', 'release', 'ontology-atlas-mcp');
    if (!existsSync(program)) throw new Error(`no Rust program at ${program}; set ATLAS_MCP_RUST`);
    return { label: 'rust', command: program, args: [], deterministic: true };
  }
  if (spec.startsWith('cmd:')) {
    const [command, ...args] = splitCommand(spec.slice('cmd:'.length));
    return { label: spec, command, args, deterministic: true };
  }
  throw new Error(`unknown server "${spec}"; use node, node:<checkout>, bun, bun-shipped, rust or cmd:<command>`);
}

/** The whole environment one server process sees; nothing is inherited but the search path. */
export function serverEnvironment({ locale, vaultPath, homeDir, extra = {}, coverageDir, deterministic = true }) {
  return {
    PATH: process.env.PATH,
    HOME: homeDir,
    TMPDIR: homeDir,
    TZ: 'UTC',
    LANG: locale,
    ...GIT_ENV,
    GIT_AUTHOR_DATE: '2026-09-21T14:13:20+00:00',
    GIT_COMMITTER_DATE: '2026-09-21T14:13:20+00:00',
    ...(deterministic
      ? { ATLAS_DIFF_CLOCK_MS: String(FIXED_CLOCK_MS), ATLAS_DIFF_UID_SEED: UID_SEED }
      : {}),
    OATLAS_VAULT: vaultPath,
    ...(coverageDir ? { NODE_V8_COVERAGE: coverageDir } : {}),
    ...extra,
  };
}
