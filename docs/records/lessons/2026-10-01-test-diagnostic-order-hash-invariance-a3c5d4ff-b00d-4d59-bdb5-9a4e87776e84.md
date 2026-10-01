---
id: a3c5d4ff-b00d-4d59-bdb5-9a4e87776e84
date: 2026-10-01
kind: process
status: reported
harness_area: performance
---
**Observed**: Existing graphHash regressions covered mtime, identity and relation canonicalization, but not document enumeration order. The new permutation regression failed before this fix because diagnostics followed input order. Canonical issue ordering made Node and Bun return the same complete artifact for the 10,000-file fixture. Evidence: `compiler-order-red.log`, `compiler-order-node.log`, `compiler-order-bun.log`, and `compiler-order-stdio.jsonl` under `/Users/jinan/scratch/atlas-scale-100k/`.
**Cost**: The enumeration-order invariant remained uncovered until cross-runtime qualification; elapsed investigation time was not measured separately.
**Suspected cause**: Testing isolated hash fields without testing that the same document set yields the same ordered diagnostics.
**Proposed change**: none; keep enumeration-permutation regressions and cross-runtime artifact comparisons alongside field-specific hash tests. Diagnostic content changes must still change graphHash.
