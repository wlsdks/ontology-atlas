---
id: d6be7bcd-3bd1-42e1-81c9-1400ef624cd0
date: 2026-09-29
kind: mistake
status: reported
harness_area: e2e
---
**Observed**: The new guard in `tests/e2e/map-panel-text-edges.spec.ts` for the phone INDEX sheet asserted `expect(page.getByTestId("topology-phone-brand")).toBeHidden()`. Run against the pre-change static export, where that test id did not exist yet, it passed; the five other new guards failed there as intended. Playwright's `toBeHidden()` also passes for a locator that matches nothing.
**Cost**: one extra red-baseline round of about three minutes; without that round the guard would have shipped unable to fail.
**Suspected cause**: a hidden or absence assertion carries no proof the subject was found, and running a new e2e guard only on the fixed build shows green whether or not it can go red.
**Proposed change**: rule: in `.claude/rules/testing.md`, pair every `toBeHidden()` or `toHaveCount(0)` in a new guard with a presence check on the same locator (`toHaveCount(1)` or a visible state first), and run new guards once against the baseline export before landing so each is seen failing.
