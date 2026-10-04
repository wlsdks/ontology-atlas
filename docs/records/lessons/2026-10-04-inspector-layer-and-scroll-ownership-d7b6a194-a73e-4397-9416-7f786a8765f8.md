---
id: d7b6a194-a73e-4397-9416-7f786a8765f8
date: 2026-10-04
kind: gate-gap
status: reported
harness_area: design-harness
---
**Observed**: The bounded investigation panel reused a selected-node inset and overlapped its still-available toolbar (panel top30.23,toolbar bottom60 at1440px). Its long request used a second vertical scroll region. The design audit compared only surfaces in one stacking context and checked scroll-end reserve, without declaring reading scroll ownership. A new seven-width long-evidence test exposed these gaps and a768/834px source-close visibility failure; short existing cases had passed. A deliberate browser-only restoration of top24 plus nested256px scroll caps failed both geometry and scroll assertions after the repair.
**Cost**: One failed first visual slice at2560px, a15-second locator setup failure, and two external probe configuration failures; setup failures were not counted as defect detection. Total time/token cost unknown.
**Suspected cause**: A token valid for one inspector did not supply the new panel's toolbar clearance or zoom context. The workflow's scope omitted cross-layer reachability and long reading states; it did not mandate these incorrect coordinates or nested scroll caps.
**Proposed change**: skill, declare the reading object, concurrently reachable controls and scroll owner; verify token roles and independent layers. The Codex design-build/design-audit skills now include those checks and preserve the owner's background-only constraint without claiming native proof. Keep the rendered seven-width regression and explicit globalSetup/webServer.cwd for external Playwright probes.
