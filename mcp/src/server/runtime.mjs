/**
 * Process-level facts every tool handler needs: the vault and repository roots,
 * how each was resolved, the stdio listener budget, and the per-session compiled
 * ontology cache.
 *
 * It is imported before anything else so the vault-root guard still fails fast —
 * a throw at import time leaks a stack trace to stderr before the stdio transport
 * attaches, which a client reads as a silent crash.
 */
import { createCompiledOntologyCache } from '../compiled-cache.mjs';
import { discoverGitRepositoryRoot } from '../git-tools.mjs';
import { compileOntology } from '../ontology-compiler.mjs';
import {
  ensureVaultRoot,
  loadVaultDocs,
} from '../vault.mjs';
import { resolve } from 'node:path';

// The v2 stdio transport attaches one temporary error listener (and, while
// backpressured, one drain listener) per in-flight response. Atlas' installed
// verifier deliberately sends a bounded first-contact burst that can exceed
// Node's default and the old 50-listener ceiling. 128 keeps that supported
// burst warning-free without making the emitter unlimited, so a real runaway
// still trips Node's leak detector.
const STDIO_MAX_LISTENERS = 128;
process.stdout.setMaxListeners(Math.max(process.stdout.getMaxListeners(), STDIO_MAX_LISTENERS));
process.stderr.setMaxListeners(Math.max(process.stderr.getMaxListeners(), STDIO_MAX_LISTENERS));

const VAULT_ROOT = resolve(process.env.OATLAS_VAULT || process.cwd());
const VAULT_GIT_ROOT = discoverGitRepositoryRoot(VAULT_ROOT);
const DISCOVERED_REPO_ROOT =
  VAULT_GIT_ROOT ??
  discoverGitRepositoryRoot(process.cwd());
const REPO_ROOT = resolve(
  process.env.OATLAS_REPO_ROOT ||
  DISCOVERED_REPO_ROOT ||
  process.cwd(),
);
/**
 * **Is there evidence that this repo root belongs to this vault?**
 *
 * Without it, `REPO_ROOT` is a guess. When the vault is not inside a git
 * repository and nobody said otherwise, all that remains is "the directory the
 * server process happened to start in", which has no reason to be the code the
 * vault describes. While this flag did not exist, `health` compared another
 * vault's code paths against *our* repository and reported `warn:13` — on the
 * same vault `validate` was clean (measured 2026-08-01). An ungrounded
 * comparison must say it did not look, not produce a number.
 */
const REPO_ROOT_IS_GROUNDED = Boolean(
  process.env.OATLAS_REPO_ROOT || VAULT_GIT_ROOT,
);
const VAULT_RESOLUTION = process.env.OATLAS_VAULT ? 'OATLAS_VAULT' : 'process.cwd';
const REPO_RESOLUTION = process.env.OATLAS_REPO_ROOT
  ? 'OATLAS_REPO_ROOT'
  : DISCOVERED_REPO_ROOT
    ? 'git.rev-parse'
    : 'process.cwd';
// SERVER_VERSION is embedded as a constant so the server stays compilable (see server-version.mjs).
const COMPILED_ONTOLOGY_CACHE = createCompiledOntologyCache({
  loadDocs: () => loadVaultDocs(VAULT_ROOT),
  compile: (docs, options) => compileOntology(docs, options),
});

// A throw at import time leaks a stack trace to stderr before the stdio
// transport attaches, which clients (Claude Code and friends) see as a silent
// crash. A one-line message plus a non-zero exit surfaces it in the server log.
try {
  ensureVaultRoot(VAULT_ROOT);
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  process.stderr.write(`[ontology-atlas-mcp] vault root validation failed: ${msg}\n`);
  process.stderr.write(
    `[ontology-atlas-mcp] Point the OATLAS_VAULT environment variable at a markdown vault directory. (currently: ${VAULT_ROOT})\n`,
  );
  process.exit(1);
}

export {
  STDIO_MAX_LISTENERS,
  VAULT_ROOT,
  VAULT_GIT_ROOT,
  DISCOVERED_REPO_ROOT,
  REPO_ROOT,
  REPO_ROOT_IS_GROUNDED,
  VAULT_RESOLUTION,
  REPO_RESOLUTION,
  COMPILED_ONTOLOGY_CACHE,
};
