import { existsSync, readFileSync } from 'node:fs';
import { findPackageJSON } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Whether this checkout's MCP package has its runtime dependencies installed at the pinned versions.
 * Scripts that spawn `mcp/src/index.js` check it first, so a missing install reads as one recovery
 * command instead of a loader stack trace.
 */
const sourceCheckoutMcpRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

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
 * Runtime dependencies of `mcp/package.json` that Node cannot resolve, or exact pins at another version,
 * using Node's resolver so hoisted and pnpm-linked installs count. No source checkout is not an error.
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
 * Turns only the known source-checkout loader failure into the dependency recovery message; other exits
 * keep their diagnostics.
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
