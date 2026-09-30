---
id: 723b0ced-6bfb-46a3-9ef0-f71afe54103b
date: 2026-09-30
kind: tool-efficiency
status: reported
harness_area: contract-diagnostics
---
**Observed**: the existing vault-walk mirror assertion printed thousands of lines from src-tauri/src/lib.rs when the native entry ceiling intentionally disagreed with TS. The updated assertion extracts the native number and compares that value; the same mismatch now reports only the differing limit.
**Cost**: one deliberately failing probe produced about 25,000 output tokens before truncation.
**Suspected cause**: matching a regular expression against an entire source file makes the assertion diagnostic print the whole source on failure.
**Proposed change**: gate; compare extracted contract values when a mismatch would otherwise dump an entire source file.
