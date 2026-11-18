import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the frontmatter validator; the CLI executes it, and
// `tests/contract/vault-format/validate-vault-document.contract.test.ts` holds `src/shared/lib` to its issue codes.
/** @type {typeof import('../../../../mcp/src/validate.mjs')} */
const validate = await loadMcpModule('validate.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const suppressParentedExpectedFieldIssues = validate.suppressParentedExpectedFieldIssues;
export const validateVaultDocument = validate.validateVaultDocument;
export const suppressLibraryKindIssues = validate.suppressLibraryKindIssues;
export const rawSourceKindIssues = validate.rawSourceKindIssues;

/*
 * The folder-evidence finding needs a repository root, so `validate` runs it over the whole vault, as
 * `validate_vault` does, from this one implementation.
 */
/** @type {typeof import('../../../../mcp/src/meaning/meaning-findings.mjs')} */
const meaningFindings = await loadMcpModule('meaning/meaning-findings.mjs');
export const folderOnlyEvidenceFinding = meaningFindings.folderOnlyEvidenceFinding;
export const dependencyWitnessFinding = meaningFindings.dependencyWitnessFinding;
export const starterExampleFindings = meaningFindings.starterExampleFindings;

/*
 * The five build-depth warnings (`relation-note-on-unread`, `rule-without-read-lines`, `dependency-both-ways`,
 * `path-without-code`, `path-shared`) come from the module `validate_vault` runs, so the two tools never describe one vault two ways.
 */
/** @type {typeof import('../../../../mcp/src/construction/build-depth.mjs')} */
const buildDepth = await loadMcpModule('construction/build-depth.mjs');
export const buildDepthFindings = buildDepth.buildDepthFindings;
export const repositorySurvey = buildDepth.repositorySurvey;
