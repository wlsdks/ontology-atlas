import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the wiki page contract (`docs/ONTOLOGY-ATLAS-SPEC.md` §11); the CLI executes that file,
// and `tests/contract/library/wiki-page-schema.contract.test.ts` holds the web TypeScript twin to its problem codes.
/** @type {typeof import('../../../../mcp/src/library/wiki-schema.mjs')} */
const wiki = await loadMcpModule('library/wiki-schema.mjs');
/** @type {typeof import('../../../../mcp/src/library/wiki-folder.mjs')} */
const folder = await loadMcpModule('library/wiki-folder.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const WIKI_DIR = wiki.WIKI_DIR;
export const buildWikiNodeIndex = wiki.buildWikiNodeIndex;
export const isWikiFurnitureSlug = wiki.isWikiFurnitureSlug;
export const validateWikiPage = wiki.validateWikiPage;
export const validateWikiFolder = folder.validateWikiFolder;
