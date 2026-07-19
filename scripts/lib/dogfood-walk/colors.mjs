// ANSI color codes shared by the dogfood walk summaries and CLI report output.
// Split out of scripts/dogfood-mcp-walk.mjs (structural decomposition, logic unchanged).
export const COLORS = {
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  cyan: "\x1b[36m",
  yellow: "\x1b[33m",
  green: "\x1b[32m",
  reset: "\x1b[0m",
};
