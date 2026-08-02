// Cross-runtime bridge. The MCP package owns the pure implementation so its
// installed tarball stays self-contained; web code imports through this path.
export * from "../../../mcp/src/meaning-assessment.mjs";
