---
id: 618f7666-2558-4669-b48b-72f1909094df
date: 2026-10-03
kind: process
status: reported
harness_area: release
---
**Observed**: for v1.5.0 (2026-10-02), the release workflow's staging step failed with HTTP 403 creating the draft release with `GITHUB_TOKEN`, because a workflow change (#2405/#2407 heap fixes) landed on `main` after the tag was cut, and the release named the tagged commit as `target_commitish` while its `.github/workflows` files differed from the default branch. Staging was then done by hand (`gh run download`, `build-updater-manifest`, `gh release create --draft --verify-tag`, `gh release upload`). #2420 removed `target_commitish`.
**Cost**: about 1.5 hours of manual staging and verification.
**Suspected cause**: GitHub refuses a `GITHUB_TOKEN` release create or update that targets a commit whose workflow files differ from the default branch's.
**Proposed change**: skill, the release skill states: do not land workflow changes between tagging and publishing; if one must land, re-tag at the new main head (the admission check already requires tag = main head).
