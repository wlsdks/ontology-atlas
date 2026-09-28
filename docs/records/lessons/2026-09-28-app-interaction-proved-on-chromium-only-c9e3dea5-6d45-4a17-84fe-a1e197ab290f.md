---
id: c9e3dea5-6d45-4a17-84fe-a1e197ab290f
date: 2026-09-28
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: #2058 fixed a scroll-up fight in the ACP transcript and proved it only on Chromium (`PLAYWRIGHT_STATIC=1 ... pnpm checks:changed -- --run`, CI's engine). The independent review ran the same spec on Playwright WebKit, the engine family of the app's WKWebView, and test 1 failed: one wheel notch moved the view 13 px down, and PageUp drifted 659 px. WebKit applies a passive wheel off the main thread, so the follower's queued write overwrote it; Chromium never showed the race.
**Cost**: one review round and a second fix pass (a non-passive wheel takeover, a resume rule, three mutant builds), roughly a day of wall time.
**Suspected cause**: CI installs Chromium only and no rule says when a change must also be run on WebKit, so an interaction fix for an app-only surface was accepted on the engine the app does not use.
**Proposed change**: rule: `.claude/rules/testing.md`, "Verify web and app separately", gains a row: a scroll, wheel, touch or focus change on an app surface runs its spec on Playwright WebKit locally and records the result, since CI runs Chromium only.
