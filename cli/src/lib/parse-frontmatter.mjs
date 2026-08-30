import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns the frontmatter parser and writer (`mcp/src/parser.mjs`).
// The CLI keeps this file name so its own importers do not move, but the code
// behind it is the canonical module rather than a copy.
const parser = await loadMcpModule('parser.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const buildMarkdown = parser.buildMarkdown;
export const parseFrontmatter = parser.parseFrontmatter;
