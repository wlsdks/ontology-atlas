import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the sidecar boundary. The CLI keeps only this re-export
// so source checkouts and the published two-package install use the same code.
const sidecar = await loadMcpModule('vault-sidecar.mjs');

export const SidecarPathError = sidecar.SidecarPathError;
export const appendVaultSidecarLine = sidecar.appendVaultSidecarLine;
export const createVaultSidecarTextExclusive = sidecar.createVaultSidecarTextExclusive;
export const readVaultSidecarText = sidecar.readVaultSidecarText;
export const removeVaultSidecarFile = sidecar.removeVaultSidecarFile;
export const replaceVaultSidecarText = sidecar.replaceVaultSidecarText;
