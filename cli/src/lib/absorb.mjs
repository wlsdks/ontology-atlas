import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns absorption: section splitting, classification, the
// injection scan, and the slim pointer. `absorb_document` and `atlas absorb` are
// two entry points into one implementation.
const absorb = await loadMcpModule('absorb.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const buildAbsorptionPlan = absorb.buildAbsorptionPlan;
export const buildSlimPointer = absorb.buildSlimPointer;
