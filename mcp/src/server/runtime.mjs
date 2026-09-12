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
import {
  existsSync,
  realpathSync,
} from 'node:fs';
import {
  isAbsolute,
  relative,
  resolve,
  sep,
} from 'node:path';

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

// Thin wrapper over analyze_repo_structure. Zero side effects — it never touches
// vault frontmatter. Only the exact writePlan returned after reviewPlan plus
// independent qualification is a truth entry point for the batch writer.
/**
 * Is this a place we may scan — **it must be inside the vault or its repository.**
 *
 * **Why** (review 2026-08-16, confirmed by measurement): `analyze_repo_structure`,
 * `infer_imports`, `index_project`, and `validate_vault` took a `rootPath` (or
 * `repoRoot`), called `resolve()` on it, and **checked no boundary at all**. So
 * this call succeeded as written:
 *
 * ```
 * analyze_repo_structure {"rootPath":"/etc"}  → ok, returns the directory structure
 * ```
 *
 * Worse, all four are **read tools**, so `OATLAS_READ_ONLY` does not stop them.
 * That mode is recommended when whoever registered the server is not the vault's
 * owner — and it left them unable to write but **able to scan the entire disk**.
 *
 * This collides head-on with what the product promises its users: *"files on the
 * user's disk such as passwords or credentials are never scanned automatically"*
 * (`.claude/rules/local-first.md`), *"we do not scan the user's disk
 * automatically"* (the trust charter). A tool call steered by one line of prompt
 * would break that promise.
 *
 * So only the vault, or that vault's repository, is allowed. Real paths are
 * resolved before comparison to close the symlink escape — the same grammar
 * `absorb_document` already uses.
 */
function assertScanRootAllowed(target, argName = 'rootPath') {
  const canonical = existsSync(target) ? realpathSync(target) : resolve(target);
  const roots = [];
  for (const root of [VAULT_ROOT, REPO_ROOT]) {
    try {
      roots.push(existsSync(root) ? realpathSync(root) : resolve(root));
    } catch {
      roots.push(resolve(root));
    }
  }
  const inside = roots.some((root) => {
    if (canonical === root) return true;
    const rel = relative(root, canonical);
    return rel !== '' && rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
  });
  if (inside) return canonical;
  throw new Error(
    `${argName} must be inside the vault (${roots[0]}) or its repository (${roots[1]}). ` +
      'This server only reads the folder it was opened for.',
  );
}

export {
  assertScanRootAllowed,
  VAULT_ROOT,
  REPO_ROOT,
  REPO_ROOT_IS_GROUNDED,
  VAULT_RESOLUTION,
  REPO_RESOLUTION,
  COMPILED_ONTOLOGY_CACHE,
};
