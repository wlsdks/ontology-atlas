---
id: a488ba0b-3c7d-47c4-937a-5c82d3a66b41
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: source-search
---
**Observed**: The read-only reviewer searched minified Next polyfill files with a broad polyfill alternative in rg. The result produced32,196 underlying tokens and truncation. The reviewer corrected it to rg -o matching only findLast/findLastIndex; no repository files were changed by that search.
**Cost**: One oversized search response,32,196 underlying tokens reported by the reviewer; no CI round.
**Suspected cause**: A broad match selected entire minified single-line files while the question required only two exact API names.
**Proposed change**: none. Use rg -o for exact symbols or a bounded max-column view when inspecting minified output; an entire matching line is not needed for a symbol-presence question.
