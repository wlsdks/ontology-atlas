---
id: 4bafc803-ebf1-4788-9ebc-51e1e86bc2d4
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: ci-gates
---
**Observed**: #2087 added one comment-bytes raise record and `source-shape.contract.test.ts` failed with `wide-folders.tests-contract: 2 > 1`, `tests/contract/ratchet-raises/: 31 files`. Main held exactly 30 records, so the first change to add a raise also had to add a `wide-folders.tests-contract` raise for the folder that holds raises.
**Cost**: one failed check-plan run and one extra record.
**Suspected cause**: raise records are one file each in one folder (`RAISES_DIR`), while the source-shape contract caps every folder a change touches at 30 direct files, so the ratchet's own ledger trips it.
**Proposed change**: gate | exempt `tests/contract/ratchet-raises/` from the wide-folders count, or read raise records from per-gate subfolders.
