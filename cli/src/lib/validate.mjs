import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the vault frontmatter validator. `tests/contract/
// validate-vault-document.contract.test.ts` still forces `src/shared/lib` (the
// runtime and UI fast path) to agree with it on issue codes; the CLI arm of that
// contract is now guaranteed by execution rather than by a fixture matrix.
const validate = await loadMcpModule('validate.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const suppressParentedExpectedFieldIssues = validate.suppressParentedExpectedFieldIssues;
export const validateVaultDocument = validate.validateVaultDocument;
