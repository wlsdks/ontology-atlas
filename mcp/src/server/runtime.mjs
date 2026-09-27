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
import { shareArtifact } from '../ontology-engine.mjs';
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

// The stdio transport adds an error (and, while backpressured, a drain) listener
// per in-flight response. 128 covers the verifier's bounded first-contact burst
// while a real runaway still trips Node's leak detector.
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
 * Whether there is evidence that this repo root belongs to this vault. Without it
 * the root is only the process's start directory, and comparing code paths
 * against it reports drift from an unrelated repository.
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
// Every call shares the cached artifact and none modifies it, so the query engine
// indexes it once (`shareArtifact`).
const COMPILED_ONTOLOGY_CACHE = createCompiledOntologyCache({
  loadDocs: () => loadVaultDocs(VAULT_ROOT),
  compile: (docs, options) => shareArtifact(compileOntology(docs, options)),
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
 * Whether a scan root lies inside the vault or its repository, compared as real
 * paths so a symlink cannot escape. The scanning tools are read tools that
 * `OATLAS_READ_ONLY` does not stop, so without this one prompted call could scan
 * any directory on the user's disk (`.claude/rules/local-first.md`).
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
