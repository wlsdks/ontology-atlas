import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the vault schema. `AGENTS.md` already names
// `mcp/src/schema.mjs` as the single source; the CLI now executes that file
// instead of carrying a byte-identical twin.
/** @type {typeof import('../../../mcp/src/schema.mjs')} */
const schema = await loadMcpModule('schema.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const CREATED_BY_AGENT_PREFIX = schema.CREATED_BY_AGENT_PREFIX;
export const CREATED_BY_HUMAN = schema.CREATED_BY_HUMAN;
export const CREATED_BY_KEY = schema.CREATED_BY_KEY;
export const VAULT_KINDS = schema.VAULT_KINDS;
export const agentCreatedBy = schema.agentCreatedBy;
export const buildFrontmatter = schema.buildFrontmatter;
export const defaultBody = schema.defaultBody;
export const flatSlugIssue = schema.flatSlugIssue;
export const folderForKind = schema.folderForKind;
export const inspectMergedUids = schema.inspectMergedUids;
export const missingExpectedFields = schema.missingExpectedFields;
export const nodeUidIssue = schema.nodeUidIssue;
