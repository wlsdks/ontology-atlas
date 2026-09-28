---
id: 7b23f578-b505-43de-9368-a5666795ab73
date: 2026-09-28
kind: mistake
status: reported
harness_area: e2e
---
**Observed**: `tests/e2e/route-cycle-leak.spec.ts` (#2088) failed 1 of 2 runs for the coordinator and 1 of 4 for me against `pnpm dev`, timing out at the Automations stop with the Library still on screen. Its Ontology stop counted as arrived once `#library-workspace-tabpanel-ontology` showed and the DOM was quiet for 8 frames, but the docs view (`DocsVaultPage.tsx` default selection, `scheduleStateSync` → `replaceDocsVaultUrlState`) writes `?slug=` after hydration. A history write within a few milliseconds before a click cancels that click's navigation: logging `history.pushState/replaceState` showed `replaceState …&slug=atlas-fixture` at 984 ms, the rail push at 989 ms, then Next restoring the Library URL at 1,010 ms (`lost-click.mjs` in the session scratchpad; with the click 225 ms after opening the tab, both runs on the static export ended on the Library). Waiting for the stop's own URL (`?slug=` for the Ontology stop, the destination path for rail stops) before clicking on: 8 of 8 on dev, 3 of 3 on the static export.
**Cost**: a failed checks:changed and an investigation round for the coordinator, about 40 minutes for me.
**Suspected cause**: DOM quiet is not arrival for a view that writes URL state after hydration; the page is still about to issue a navigation.
**Proposed change**: skill, one line in the e2e settle guidance: a stop whose view writes the address after mounting is ready when that address appears, and a sweep asserts each destination's URL before its next click.
