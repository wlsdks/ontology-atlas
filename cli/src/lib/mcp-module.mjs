import { existsSync, readFileSync } from 'node:fs';
import { createRequire, findPackageJSON } from 'node:module';
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

const EXACT_SEMVER = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

function isExactMcpDependencyVersion(value) {
  return typeof value === 'string' && EXACT_SEMVER.test(value);
}

function readInstalledPackage(packagePath, dependency) {
  try {
    const installedPackagePath = findPackageJSON(
      dependency,
      pathToFileURL(packagePath),
    );
    if (!installedPackagePath) return { found: false, version: null };
    const packageJson = JSON.parse(readFileSync(installedPackagePath, 'utf-8'));
    if (packageJson.name !== dependency) return { found: false, version: null };
    return {
      found: true,
      version: typeof packageJson.version === 'string' ? packageJson.version : null,
    };
  } catch {
    return { found: false, version: null };
  }
}

function inspectSourceCheckoutMcpDependencies(mcpRoot) {
  const packagePath = resolve(mcpRoot, 'package.json');
  if (!existsSync(packagePath)) return [];

  const packageJson = JSON.parse(readFileSync(packagePath, 'utf-8'));
  const dependencies = Object.entries(packageJson.dependencies ?? {}).sort(([left], [right]) =>
    left.localeCompare(right, 'en'),
  );
  if (dependencies.length === 0) {
    return [{ dependency: 'mcp/package.json', status: 'idle' }];
  }
  return dependencies.flatMap(([dependency, declaredVersion]) => {
    if (!isExactMcpDependencyVersion(declaredVersion)) {
      return [{ dependency, status: 'unpinned', declaredVersion }];
    }
    const installed = readInstalledPackage(packagePath, dependency);
    if (!installed.found) {
      return [{ dependency, status: 'missing', declaredVersion }];
    }

    const installedVersion = installed.version;
    return installedVersion === declaredVersion
      ? []
      : [{ dependency, status: 'stale', declaredVersion, installedVersion }];
  });
}

/**
 * Reports runtime dependencies declared by `mcp/package.json` that Node cannot
 * resolve from that package, plus exact-pinned dependencies whose installed
 * version differs. The probe follows Node's resolver instead of only checking
 * for `mcp/node_modules`: a valid hoisted or pnpm-linked installation is valid too.
 *
 * A missing source checkout is not an error here. Installed CLI packages do not
 * ship the repository's sibling `mcp/` folder and resolve
 * `ontology-atlas-mcp` through the ordinary package fallback instead.
 *
 * @param {string} mcpRoot absolute source-checkout MCP package root
 * @returns {string[]}
 */
export function findMissingSourceCheckoutMcpDependencies(mcpRoot = sourceCheckoutMcpRoot) {
  return inspectSourceCheckoutMcpDependencies(mcpRoot).map(({ dependency }) => dependency);
}

function makeSourceCheckoutMcpDependencyError(issues) {
  const idle = issues.find(({ status }) => status === 'idle');
  if (idle) {
    const error = new Error(
      'Source-checkout MCP dependency preflight has no runtime dependencies to inspect. ' +
        'Declare exact versions in mcp/package.json.',
    );
    error.code = 'OATLAS_MCP_SOURCE_DEPENDENCIES_MISSING';
    return error;
  }
  const unpinned = issues.filter(({ status }) => status === 'unpinned');
  if (unpinned.length > 0) {
    const details = unpinned.map(
      ({ dependency, declaredVersion }) =>
        `${dependency} declares ${JSON.stringify(declaredVersion)}`,
    );
    const error = new Error(
      `Source-checkout MCP dependencies are not exactly pinned (${details.join(', ')}). ` +
        `Pin them in mcp/package.json, then run: ${SOURCE_CHECKOUT_MCP_INSTALL_COMMAND}`,
    );
    error.code = 'OATLAS_MCP_SOURCE_DEPENDENCIES_MISSING';
    return error;
  }
  const hasStaleDependency = issues.some(({ status }) => status === 'stale');
  const details = hasStaleDependency
    ? issues.map(({ dependency, status, declaredVersion, installedVersion }) =>
        status === 'stale'
          ? `${dependency} expected ${declaredVersion}, found ${installedVersion ?? 'unknown'}`
          : `${dependency} not installed`,
      )
    : issues.map(({ dependency }) => dependency);
  const error = new Error(
    `Source-checkout MCP dependencies are ${hasStaleDependency ? 'missing or stale' : 'missing'} ` +
      `(${details.join(', ')}). ` +
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
  const issues = inspectSourceCheckoutMcpDependencies(mcpRoot);
  if (issues.length === 0) return;
  throw makeSourceCheckoutMcpDependencyError(issues);
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

  const issues = inspectSourceCheckoutMcpDependencies(mcpRoot);
  if (
    issues.length === 0 ||
    !issues.some(({ dependency }) => stderrText.includes(dependency))
  ) {
    return null;
  }
  return makeSourceCheckoutMcpDependencyError(issues);
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
