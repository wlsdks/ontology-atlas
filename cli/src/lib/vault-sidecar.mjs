import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The MCP package owns the sidecar boundary. The CLI keeps only this resolver
// so source checkouts and the published two-package install use the same code.
const here = dirname(fileURLToPath(import.meta.url));
const sourceCheckout = resolve(here, '../../../mcp/src/vault-sidecar.mjs');
const modulePath = existsSync(sourceCheckout)
  ? sourceCheckout
  : createRequire(import.meta.url).resolve('ontology-atlas-mcp/src/vault-sidecar.mjs');
const sidecar = await import(pathToFileURL(modulePath).href);

export const SidecarPathError = sidecar.SidecarPathError;
export const appendVaultSidecarLine = sidecar.appendVaultSidecarLine;
export const createVaultSidecarTextExclusive = sidecar.createVaultSidecarTextExclusive;
export const readVaultSidecarText = sidecar.readVaultSidecarText;
export const removeVaultSidecarFile = sidecar.removeVaultSidecarFile;
export const replaceVaultSidecarText = sidecar.replaceVaultSidecarText;
