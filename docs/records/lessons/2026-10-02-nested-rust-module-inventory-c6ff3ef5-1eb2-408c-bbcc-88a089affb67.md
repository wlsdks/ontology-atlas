---
id: c6ff3ef5-1eb2-408c-bbcc-88a089affb67
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: security
---
**Observed**: Integrating the outbound inventory gate into native cancellation produced three ENOENT failures for src-tauri/src/llm/tests.rs. The actual cancellation test is nested under an inline cfg(test) module in llm.rs. Rust tests passed, but the inventory assumed every parent module lived in a same-named .rs file.
**Cost**: One failed contract-suite run during local integration; no CI round.
**Suspected cause**: A filesystem parent is not always a Rust module file. Inline test ancestors and directory mod.rs owners were omitted from the scanner's ownership model.
**Proposed change**: gate. Follow .rs and mod.rs owners and inline cfg(test) ancestors, retaining unresolved files in the production scan. Keep a fixture with test-only, production, misleadingly named and unresolved modules. Three planted classifier defects failed; restored inventory passed with a nonempty real-source scan.
