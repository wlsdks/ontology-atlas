// Cross-runtime bridge. Keep the MCP package self-contained while the browser
// side infers the project source root with the byte-identical implementation.
//
// Pure only — the filesystem half (`mcp/src/project-source-discovery.mjs`)
// must never reach the web bundle. In the app the candidate comes free from a
// single `inspect_project_source` call on the vault root: that Tauri command
// already climbs to the enclosing git repository, so its `rootPath`/`kind` is
// the `enclosing_git_repository` candidate.
export * from "../../../mcp/src/project-source-inference.mjs";
