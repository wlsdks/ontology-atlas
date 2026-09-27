---
id: 713780f2-999c-4329-80de-c7b2cee16dad
date: 2026-09-27
---
## 2026-09-27 — Release candidates are retired; every release is a plain vX.Y.Z tag

**Why**: owner, 2026-09-27: "there is no RC any more". All 19 `-rc.N` tags precede v1.0.0 (the last on 2026-08-30) and the 15 releases since shipped plain, yet admission still accepted a suffix, and the workflow, download verifier, release facts and hosted updater kept pre-release branches and an `--allow-prerelease` flag.
**Prior**: overturns the `-rc.N` allowance of the 2026-09-01 versioning baseline in the `docs/CHANGELOG.md` header, and the updater clause of 2026-09-11 "The README loses half its words and keeps every fact the ledger put in its body"; keeps the staged draft and the `release` approval.
**Decision**: `desktop:release-tag` and `desktop:release-source` refuse a pre-release or build suffix; the workflow drafts and publishes plain releases only; `desktop:verify-download`, `download:release-facts` and the hosted updater refuse or skip a GitHub pre-release, and no flag re-enables one.
**Dissent**: the 2026-09-01 allowance, that a public soak reaches testers a staged draft cannot; accepted because no release since v1.0.0 used it and the approver installs the staged draft before publishing.
**Falsifier**: a plain release needs a fix within 48 hours for a regression that only a wider pre-release audience would have caught.
**Owner**: Stark
