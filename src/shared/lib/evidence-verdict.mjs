// Cross-runtime bridge, the same shape `wiki-report.mjs` uses. The verdict rule belongs to
// the MCP package because the server answers `validate_vault` with it, and the analysis
// brief renders the same four words in a React tree. One file cannot drift from itself;
// `tests/contract/evidence-drift-parity.contract.test.ts` pins the two surfaces to it.
export * from "../../../mcp/src/evidence-verdict.mjs";
