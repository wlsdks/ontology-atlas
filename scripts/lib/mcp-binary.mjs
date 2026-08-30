/**
 * The name, path, and compile-argument contract for the bundled MCP binary.
 *
 * The app **carries the MCP server inside its own bundle** — a user must be able to
 * attach an agent with no node, no npx, and no source checkout. Tauri's `externalBin`
 * looks for a `<name>-<rust-target-triple>` file and bakes it to
 * `Contents/MacOS/<name>`. That name contract is defined here and nowhere else.
 *
 * Why `Contents/MacOS`: Apple requires executables to live in the executable
 * directory rather than `Contents/Resources` (an executable inside Resources is
 * flagged during notarisation). `externalBin` writes to that location.
 */

/** The binary name used inside the bundle and in config files. */
const MCP_BINARY_NAME = 'ontology-atlas-mcp';

/** Where compile output lands (gitignored — build output). */
export const MCP_BINARY_OUTPUT_DIR = 'src-tauri/binaries';

/** The MCP server entry — the compile input. */
export const MCP_SERVER_ENTRY = 'mcp/src/index.js';

/**
 * Rust target triple → bun `--target` value. Supporting one would suffice, but an
 * explicit mapping removes guesswork when x64 is added.
 */
const BUN_TARGET_BY_TRIPLE = Object.freeze({
  'aarch64-apple-darwin': 'bun-darwin-arm64',
  'x86_64-apple-darwin': 'bun-darwin-x64',
  'x86_64-pc-windows-msvc': 'bun-windows-x64',
});

export const SUPPORTED_TARGET_TRIPLES = Object.freeze(Object.keys(BUN_TARGET_BY_TRIPLE));

/** node's platform and architecture → Rust target triple. */
export function hostTargetTriple(platform = process.platform, arch = process.arch) {
  if (platform === 'darwin' && arch === 'arm64') return 'aarch64-apple-darwin';
  if (platform === 'darwin' && arch === 'x64') return 'x86_64-apple-darwin';
  if (platform === 'win32' && arch === 'x64') return 'x86_64-pc-windows-msvc';
  return null;
}

export function bunTargetForTriple(triple) {
  return BUN_TARGET_BY_TRIPLE[triple] ?? null;
}

/** The filename `externalBin` actually looks for. */
export function binaryFileNameForTriple(triple) {
  const extension = triple.includes('-windows-') ? '.exe' : '';
  return `${MCP_BINARY_NAME}-${triple}${extension}`;
}

/** bun compile arguments — the script and the tests read the same array. */
export function bunCompileArgs({ triple, entry = MCP_SERVER_ENTRY, outfile }) {
  const bunTarget = bunTargetForTriple(triple);
  if (!bunTarget) {
    throw new Error(
      `Unsupported target triple: ${triple}. Supported: ${SUPPORTED_TARGET_TRIPLES.join(', ')}`,
    );
  }
  return ['build', '--compile', '--minify', `--target=${bunTarget}`, entry, '--outfile', outfile];
}
