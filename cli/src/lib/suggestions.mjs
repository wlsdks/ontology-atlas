import { loadMcpModule } from './mcp-module.mjs';

// The MCP package owns did-you-mean suggestion wording, so a typo gets the same
// sentence from `atlas add` and from `add_concept`.
const suggestions = await loadMcpModule('suggestions.mjs');

/* Only what the CLI actually consumes; the MCP module keeps the full surface. */
export const formatAllowedValueError = suggestions.formatAllowedValueError;
