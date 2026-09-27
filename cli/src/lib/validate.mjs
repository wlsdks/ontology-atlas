import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the frontmatter validator; the CLI executes it, and
// `tests/contract/validate-vault-document.contract.test.ts` holds `src/shared/lib` to its issue codes.
/** @type {typeof import('../../../mcp/src/validate.mjs')} */
const validate = await loadMcpModule('validate.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const suppressParentedExpectedFieldIssues = validate.suppressParentedExpectedFieldIssues;
export const validateVaultDocument = validate.validateVaultDocument;
export const suppressLibraryKindIssues = validate.suppressLibraryKindIssues;

/*
 * The folder-evidence finding needs a repository root, so `validate` runs it over the whole vault, as
 * `validate_vault` does, from this one implementation.
 */
/** @type {typeof import('../../../mcp/src/meaning-findings.mjs')} */
const meaningFindings = await loadMcpModule('meaning-findings.mjs');
export const folderOnlyEvidenceFinding = meaningFindings.folderOnlyEvidenceFinding;
export const dependencyWitnessFinding = meaningFindings.dependencyWitnessFinding;
export const createDependencyWitnessReads = meaningFindings.createDependencyWitnessReads;
export const starterExampleFindings = meaningFindings.starterExampleFindings;
