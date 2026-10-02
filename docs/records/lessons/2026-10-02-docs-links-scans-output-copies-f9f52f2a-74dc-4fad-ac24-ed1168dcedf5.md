---
id: f9f52f2a-74dc-4fad-ac24-ed1168dcedf5
date: 2026-10-02
kind: tool-efficiency
status: reported
harness_area: e2e
---
**Observed**: a recurrence of lesson 788709cc-8ae0-4667-912a-16c280b973b7. To A/B two static exports I kept copies in the ignored `output/` folder (`output/baseline-out`, `output/profile-out`); `pnpm checks:changed -- --run` then stopped at `pnpm docs:links` with dozens of broken links inside those copies' `docs-vault/` pages (for example `output/profile-out/docs-vault/ARCHITECTURE.md:950  link → ../AGENTS.md`), and the checks after it did not run.
**Cost**: one `checks:changed -- --run` repeated, about 4 minutes, plus stopping and restarting the two static servers that served those copies.
**Suspected cause**: `docs:links`, like `tsc` in the earlier lesson, walks the working tree and does not honour `.gitignore`, so anything kept under `output/` is checked as if it were authored.
**Proposed change**: script — make the repository scanners (`docs:links`, `tsc`) skip `output/**`; until then, keep build copies and harnesses in the session scratchpad and serve them with `--dir=<absolute path>`.
