import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The MCP package owns the architectureRecord:v1 boundary. The CLI keeps only
// this resolver so source checkouts and the two-package install use the same
// build/validate/write code (the same pattern as vault-sidecar.mjs).
const here = dirname(fileURLToPath(import.meta.url));
const sourceCheckout = resolve(here, '../../../mcp/src/architecture-record.mjs');
const modulePath = existsSync(sourceCheckout)
  ? sourceCheckout
  : createRequire(import.meta.url).resolve('ontology-atlas-mcp/src/architecture-record.mjs');
const record = await import(pathToFileURL(modulePath).href);

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const buildArchitectureRecord = record.buildArchitectureRecord;
export const writeArchitectureRecord = record.writeArchitectureRecord;
