// Cross-runtime bridge. `wiki-schema.mjs` needs a TypeScript twin because the MCP
// package ships separately from the web bundle and the validator is consumed inside a
// React render; the report *grouping* is a pure function over the verdict it returns, so
// it needs no twin and gets none — the Library, `wiki-validate` and `validate_wiki`
// execute the same file. `docs/DECISIONS.md` 2026-09-11 makes a disagreement between the
// app's report and `wiki-validate` a falsifier, and one file cannot drift from itself.
export * from "../../../mcp/src/wiki-report.mjs";
