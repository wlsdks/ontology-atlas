---
id: ecf3c946-8fe1-4408-8089-95b0caa5d427
date: 2026-09-13
---
## 2026-09-13 — A rail press in the installed app is a route change, not a new document

**Why**: B1 survived #1583: every rail navigation blanked the whole window, rail included, 33-67 ms on six documents and **100-300 ms** on 104, and #1583 exposed 1-2 frames of the pre-vault screen, download button and all, inside the installed app. A probe build named the cause: a press logged `TypeError: Load failed tauri://localhost/ko/git/` and reported `navType=navigate` at `now=58` ms. `connect-src` refused the App Router's fetch of the arriving route's payload, so **every press was a document load**: the blank was the app re-booting and reading the folder again, the forbidden screen its own pre-hydration HTML.
**Prior**: **overturns the diagnosis** of 2026-09-13 #1583 while keeping its change; its WebKit table (rail ink 0.9808 Chromium, 0.0000 WebKit) carries the pane capture on its own. 2026-09-02's route crossfade stands, now measured on the engine it never was.
**Decision**: `connect-src` gains `'self'` and nothing else, so the app reads its own route payloads. The crossfade is **not** gated by engine or surface: 26 crossings after the fix, nine destinations cold and warm on the dogfood vault and four on the fixture, gave **0 blank frames**, rail ink never 0, animations filling their declared 180 ms. The boundary's route-change arm stays removed: with no document load there is no pre-vault render to cover. `scripts/lib/desktop-csp.mjs` owns the list; `desktop:check` and a contract test read it, both probed red.
**Dissent**: stop running the transition in the app at all, since a fade that unpaints a real vault for 300 ms is worse than none. Written, then reverted: the transition was never what blanked. `ipc:` alone was a real instinct, narrowed: `'self'` is the app's own bundle.
**Falsifier**: a blank frame on a rail crossing in the app; a press that loads a document; a pre-vault marker reaching a frame; a remote origin in `connect-src`; or Safari-on-web blanking, unmeasured because Playwright's WebKit is no proxy for WKWebView.
**Owner**: jinan
