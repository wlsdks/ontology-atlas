---
id: 788709cc-8ae0-4667-912a-16c280b973b7
date: 2026-09-27
kind: tool-efficiency
status: reported
harness_area: e2e
---
**Observed**: a throwaway Playwright capture harness (`output/consent-capture/capture.spec.ts` and its config), placed in the ignored `output/` folder as the capture-during-landing memory advises, was type-checked: `pnpm checks:changed -- --run` stopped at step 28 of 31 with `output/consent-capture/capture.spec.ts(42,25): error TS2345` from `pnpm typecheck`, and the three checks after it did not run.
**Cost**: one full `checks:changed -- --run` repeated, about 12 minutes of wall clock.
**Suspected cause**: `tsc --noEmit` includes every `.ts` under the repository root, and `output/` is ignored by Git but not excluded from the TypeScript project.
**Proposed change**: script — exclude `output/**` from `tsconfig.json`, or have `checks:changed` refuse to start while `output/` holds a `.ts` file; until then, keep capture harnesses in the session scratchpad.
