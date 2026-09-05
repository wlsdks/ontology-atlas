import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the wiki page contract, exactly as it owns the vault schema and
// the frontmatter validator. `docs/ONTOLOGY-ATLAS-SPEC.md` §11 is its public statement;
// `tests/contract/wiki-page-schema.contract.test.ts` forces the web bundle's TypeScript
// twin to agree with it on problem codes. The CLI executes the canonical file rather
// than carrying a copy, so its arm of that agreement is guaranteed by execution.
/** @type {typeof import('../../../mcp/src/wiki-schema.mjs')} */
const wiki = await loadMcpModule('wiki-schema.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const WIKI_DIR = wiki.WIKI_DIR;
export const isWikiTemplateSlug = wiki.isWikiTemplateSlug;
export const validateWikiPage = wiki.validateWikiPage;
