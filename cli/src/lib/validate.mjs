import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the vault frontmatter validator. `tests/contract/
// validate-vault-document.contract.test.ts` still forces `src/shared/lib` (the
// runtime and UI fast path) to agree with it on issue codes; the CLI arm of that
// contract is now guaranteed by execution rather than by a fixture matrix.
/** @type {typeof import('../../../mcp/src/validate.mjs')} */
const validate = await loadMcpModule('validate.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const suppressParentedExpectedFieldIssues = validate.suppressParentedExpectedFieldIssues;
export const validateVaultDocument = validate.validateVaultDocument;
export const suppressLibraryKindIssues = validate.suppressLibraryKindIssues;

/*
 * The one meaning finding that cannot live in the per-document validator: it
 * asks the filesystem whether a cited `path:` is a directory, and that question
 * only has an answer relative to a repository root. `validate` runs it as a
 * whole-vault pass, the same way `validate_vault` does on the MCP side, so both
 * report it from one implementation.
 */
/** @type {typeof import('../../../mcp/src/meaning-findings.mjs')} */
const meaningFindings = await loadMcpModule('meaning-findings.mjs');
export const folderOnlyEvidenceFinding = meaningFindings.folderOnlyEvidenceFinding;
