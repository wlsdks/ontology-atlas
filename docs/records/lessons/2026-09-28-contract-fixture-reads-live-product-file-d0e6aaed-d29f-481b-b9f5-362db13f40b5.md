---
id: d0e6aaed-d29f-481b-b9f5-362db13f40b5
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: gates
---
**Observed**: on `design/screens-round`, moving the Git setup doors off the hand-written `PRIMARY_ACTION_CLASS` constant (`src/widgets/atlas-git-panel/ui/AtlasGitPanel.tsx`) onto `<Button>`/`buttonVariants` turned `tests/contract/brand-fill-ink-license.contract.test.ts` red: its test that literal scanning also reads className constants failed with "cannot read that constant's ink: expected false to be true" (the assertion message is Korean in the source). The detector was fine; the test read that product file as its fixture, and the file no longer held a brand-fill constant with an ink. The fix was to point the fixture at `src/shared/ui/button.tsx`, whose `primary` variant is the pairing by design.
**Cost**: one `pnpm checks:changed -- --run` round, about 11 minutes: `pnpm test:contracts` (27s) runs after the 19-spec Playwright batch (516s).
**Suspected cause**: a contract fixture that reads a live product file breaks when the product is improved, and its message names the detector, not the fixture.
**Proposed change**: gate — keep fixtures for detector behaviour as planted strings or read the primitive that owns the pattern, and name the fixture file in the failure message.
