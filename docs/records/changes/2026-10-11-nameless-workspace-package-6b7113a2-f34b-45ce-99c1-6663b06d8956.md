---
id: 6b7113a2-f34b-45ce-99c1-6663b06d8956
date: 2026-10-11
category: Fixed
---
Repository analysis and import inference in the MCP server no longer stop with an error when a declared workspace package has no `name` in its `package.json`; that package is now named after its folder, and two such packages in same-named folders are told apart by their full paths.
