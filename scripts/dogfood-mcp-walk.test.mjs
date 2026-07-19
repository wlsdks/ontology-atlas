#!/usr/bin/env node
// Entry point for the dogfood MCP walk test suite. The tests themselves are
// decomposed by seam under scripts/lib/dogfood-walk/*.test.mjs (fixtures,
// gate evaluator, summaries/formatters) — this file just registers them so
// `node --test scripts/dogfood-mcp-walk.test.mjs` (and --test-name-pattern
// filters over it, see package.json's test:mcp:dogfood* scripts) still see
// every test, unchanged. node:test collects describe/it registrations that
// happen anywhere during module evaluation, so importing the split files for
// their side effects here is equivalent to the tests living inline.
import "./lib/dogfood-walk/gate-evaluator.test.mjs";
import "./lib/dogfood-walk/summaries.test.mjs";
