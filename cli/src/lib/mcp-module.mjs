import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * One resolution rule for every MCP module the CLI reuses.
 *
 * The CLI and the MCP server ship as two packages and run as two entry points,
 * but that never meant the code had to exist twice. `cli/package.json` declares
 * `ontology-atlas-mcp` as a dependency, and `mcp/package.json` ships the modules
 * in its `files` list, so the CLI can resolve the canonical module at runtime:
 * the monorepo source checkout first, then the installed package. Both shapes
 * therefore execute the *same* file rather than two copies a contract test has
 * to keep in step.
 *
 * Before this helper the same eight-line resolver was written out three times
 * (`vault-sidecar.mjs`, `architecture-record.mjs`, `activity-log.mjs`), each with
 * its own spelling of the fallback. One rule is now stated once.
 */
const here = dirname(fileURLToPath(import.meta.url));
const sourceCheckoutMcpSource = resolve(here, '../../../mcp/src');
const sourceCheckoutMcpRoot = dirname(sourceCheckoutMcpSource);

export const SOURCE_CHECKOUT_MCP_INSTALL_COMMAND =
  'pnpm --dir mcp install --frozen-lockfile';

/**
 * Reports runtime dependencies declared by `mcp/package.json` that Node cannot
 * resolve from that package. The probe follows Node's resolver instead of only
 * checking for `mcp/node_modules`: a valid hoisted installation is valid too.
 *
 * A missing source checkout is not an error here. Installed CLI packages do not
 * ship the repository's sibling `mcp/` folder and resolve
 * `ontology-atlas-mcp` through the ordinary package fallback instead.
 *
 * @param {string} mcpRoot absolute source-checkout MCP package root
 * @returns {string[]}
 */
export function findMissingSourceCheckoutMcpDependencies(mcpRoot = sourceCheckoutMcpRoot) {
  const packagePath = resolve(mcpRoot, 'package.json');
  if (!existsSync(packagePath)) return [];

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
  const dependencies = Object.keys(packageJson.dependencies ?? {}).sort();
  const requireFromMcp = createRequire(packagePath);
  return dependencies.filter((dependency) => {
    try {
      requireFromMcp.resolve(dependency);
      return false;
    } catch {
      return true;
    }
  });
}

function makeSourceCheckoutMcpDependencyError(missing) {
  const error = new Error(
    `Source-checkout MCP dependencies are missing (${missing.join(', ')}). ` +
      `Run: ${SOURCE_CHECKOUT_MCP_INSTALL_COMMAND}`,
  );
  error.code = 'OATLAS_MCP_SOURCE_DEPENDENCIES_MISSING';
  return error;
}

/**
 * Fails with the one source-checkout recovery path owned by the repository.
 * This diagnoses only; it never mutates dependencies or a lockfile.
 *
 * @param {string} mcpRoot absolute source-checkout MCP package root
 */
export function assertSourceCheckoutMcpDependencies(mcpRoot = sourceCheckoutMcpRoot) {
  const missing = findMissingSourceCheckoutMcpDependencies(mcpRoot);
  if (missing.length === 0) return;
  throw makeSourceCheckoutMcpDependencyError(missing);
}

/**
 * Converts only the known source-checkout loader failure into the repository's
 * dependency recovery. Installed packages and unrelated process exits retain
 * their original diagnostics.
 *
 * @param {string} stderr child-process stderr
 * @param {{ entry?: string, mcpRoot?: string }} options process context
 * @returns {Error | null}
 */
export function sourceCheckoutMcpDependencyError(
  stderr,
  { entry, mcpRoot = sourceCheckoutMcpRoot } = {},
) {
  if (typeof entry !== 'string' || resolve(entry) !== resolve(mcpRoot, 'src/index.js')) {
    return null;
  }
  const stderrText = String(stderr ?? '');
  if (!stderrText.includes('ERR_MODULE_NOT_FOUND')) return null;

  const missing = findMissingSourceCheckoutMcpDependencies(mcpRoot);
  if (missing.length === 0 || !missing.some((dependency) => stderrText.includes(dependency))) {
    return null;
  }
  return makeSourceCheckoutMcpDependencyError(missing);
}

/** Resolved module namespaces, keyed by file name. */
const cache = new Map();

async function importMcpModule(fileName) {
  const sourceCheckout = resolve(sourceCheckoutMcpSource, fileName);
  const modulePath = existsSync(sourceCheckout)
    ? sourceCheckout
    : createRequire(import.meta.url).resolve(`ontology-atlas-mcp/src/${fileName}`);
  try {
    return await import(pathToFileURL(modulePath).href);
  } catch (error) {
    // Keep pure MCP modules usable after the root install. Only replace an
    // actual loader failure, when the sibling source package is selected, with
    // the repository-owned recovery command.
    if (modulePath === sourceCheckout && error?.code === 'ERR_MODULE_NOT_FOUND') {
      assertSourceCheckoutMcpDependencies(sourceCheckoutMcpRoot);
    }
    throw error;
  }
}

/**
 * Imports one `mcp/src/<fileName>` module, from the source checkout when this is
 * a monorepo run and from the installed `ontology-atlas-mcp` package otherwise.
 *
 * The in-flight promise is cached rather than the resolved namespace, so a batch
 * caller (`import` walking many files) never re-resolves and two concurrent
 * callers share one resolution.
 *
 * @param {string} fileName file name inside `mcp/src`, e.g. `'schema.mjs'`
 * @returns {Promise<Record<string, unknown>>}
 */
export async function loadMcpModule(fileName) {
  if (!cache.has(fileName)) cache.set(fileName, importMcpModule(fileName));
  return cache.get(fileName);
}
