import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the wiki page contract (`docs/ONTOLOGY-ATLAS-SPEC.md` §11); the CLI executes that file,
// and `tests/contract/wiki-page-schema.contract.test.ts` holds the web TypeScript twin to its problem codes.
/** @type {typeof import('../../../mcp/src/wiki-schema.mjs')} */
const wiki = await loadMcpModule('wiki-schema.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const WIKI_DIR = wiki.WIKI_DIR;
export const isWikiFurnitureSlug = wiki.isWikiFurnitureSlug;
export const validateWikiPage = wiki.validateWikiPage;
export const validateWikiFolder = wiki.validateWikiFolder;
