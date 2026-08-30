import { existsSync } from 'node:fs';
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

/** Resolved module namespaces, keyed by file name. */
const cache = new Map();

async function importMcpModule(fileName) {
  const sourceCheckout = resolve(here, '../../../mcp/src', fileName);
  const modulePath = existsSync(sourceCheckout)
    ? sourceCheckout
    : createRequire(import.meta.url).resolve(`ontology-atlas-mcp/src/${fileName}`);
  return import(pathToFileURL(modulePath).href);
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
