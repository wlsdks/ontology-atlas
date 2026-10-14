import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the architectureRecord:v1 boundary, so source checkouts
// and the two-package install share one build/validate/write implementation
// (the same pattern as vault-sidecar.mjs).
const record = await loadMcpModule('architecture-record.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const buildArchitectureRecord = record.buildArchitectureRecord;
export const writeArchitectureRecord = record.writeArchitectureRecord;
