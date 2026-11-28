/**
 * Where the Rust MCP program is built, where the app bundle and the launcher look for it, and what
 * a build says when the toolchain is not the pinned one. `build-mcp-binary.mjs` and the bundle and
 * image builders share these; the launcher `mcp/src/index.js` repeats the sidecar path rule because
 * it imports nothing, and `rust-mcp-program.test.mjs` holds the two equal.
 */
import path from 'node:path';

import { MCP_BINARY_NAME, MCP_BINARY_OUTPUT_DIR } from '../lib/packaging/mcp-binary.mjs';

export const CARGO_PACKAGE = 'mcp-server';
/** The Cargo binary is named apart from the sidecar: Tauri's build copies the sidecar to `target/<profile>/ontology-atlas-mcp`. */
export const CARGO_BINARY = 'ontology-atlas-mcp-rust';

/** Node's platform and architecture, as one word each, to the Rust target the program is built for. */
const TRIPLE_BY_HOST = Object.freeze({
  'darwin arm64': 'aarch64-apple-darwin',
  'darwin x64': 'x86_64-apple-darwin',
  'win32 x64': 'x86_64-pc-windows-msvc',
  'linux x64': 'x86_64-unknown-linux-gnu',
  'linux arm64': 'aarch64-unknown-linux-gnu',
});

export const PROGRAM_TARGET_TRIPLES = Object.freeze([
  ...Object.values(TRIPLE_BY_HOST),
  'x86_64-unknown-linux-musl',
  'aarch64-unknown-linux-musl',
]);

export function hostProgramTriple(platform = process.platform, arch = process.arch) {
  return TRIPLE_BY_HOST[`${platform} ${arch}`] ?? null;
}

const executableSuffix = (triple) => (triple.includes('-windows-') ? '.exe' : '');

/** Cargo's output: `target/release` for the host, `target/<triple>/release` for another target. */
export function cargoProgramPath(root, triple, hostTriple = hostProgramTriple()) {
  const release = triple === hostTriple ? ['release'] : [triple, 'release'];
  return path.join(root, 'src-tauri', 'target', ...release, `${CARGO_BINARY}${executableSuffix(triple)}`);
}

/** The file Tauri's `externalBin` looks for and the launcher starts. */
export function sidecarPath(root, triple) {
  return path.join(root, MCP_BINARY_OUTPUT_DIR, `${MCP_BINARY_NAME}-${triple}${executableSuffix(triple)}`);
}

/** The channel `rust-toolchain.toml` pins, such as `1.100.0`. */
export function pinnedToolchain(toolchainFile) {
  const channel = /^\s*channel\s*=\s*"([^"]+)"/m.exec(toolchainFile)?.[1];
  if (!channel) throw new Error('rust-toolchain.toml names no channel');
  return channel;
}

/** What `rustc --version` reports, such as `1.100.0`; null when the output is not a version line. */
export function reportedToolchain(rustcVersionOutput) {
  return /^rustc (\d+\.\d+\.\d+)/.exec(String(rustcVersionOutput).trim())?.[1] ?? null;
}

/** The line a build prints when the compiler is not the one Atlas is tested with; null when it is. */
export function toolchainNotice(pinned, found) {
  if (found === pinned) return null;
  return `Built with Rust ${found ?? '(unknown)'}. Atlas is tested with Rust ${pinned}; install it with rustup to build the tested program.`;
}
