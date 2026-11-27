# source-scan

Files under a source root, read for what they say about the meaning recorded beside them. The
crate runs `git` only through `hardened-git` and reads files only through `confined-files`
(clippy refuses `std::fs` and `std::process` here), and depends on neither `tauri` nor an async
runtime, so the app and the MCP server link the same code.

| File | Owns |
|---|---|
| `src/path_dating.rs` | When a cited path last changed: a file by its newest commit, a concept document by the first commit that left it with its present bytes |
| `src/evidence_texts.rs` | A cited file at a commit and in the working tree, as text, under one read budget; hidden and credential names are never read |

Start with `date_paths` and `read_evidence_pairs`. The app's `git_paths_last_change`,
`git_bound_evidence_dates` and `git_evidence_text_pairs` call them, and the MCP server's
`validate_vault` will. Imports, outlines, declarations and evidence search join as their tools
are ported.
