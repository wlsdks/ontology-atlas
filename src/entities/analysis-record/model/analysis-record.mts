/**
 * One authority for analysis Markdown, and it lives with the MCP server: the Node 24
 * readers there run it through native type stripping, and the package contract check
 * requires everything the server reaches to sit inside `mcp/`. The web reads the same
 * module through this re-export, the way `src/shared/lib/project-source-mint.mjs` reads
 * the receipt minting. Keep the module free of React, path aliases and filesystem
 * imports; an analysis is a diagnostic record, not a kind.
 */
export * from '../../../../mcp/src/analysis-record.mts';
