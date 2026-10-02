---
id: e77cbcbd-e9ce-44e1-bbac-693b32853bbf
date: 2026-10-02
kind: gate-gap
status: reported
harness_area: e2e
---
**Observed**: bundle #2373 landed two specs that passed every local run and then failed train run 37020926649 and blocked the landing trains. `vault-progressive-open.spec.ts:108` raced the stub's 120 ms reads against the runner's CPU. With `Emulation.setCPUThrottlingRate` at 4x and 6x on the static export it failed 10 of 10 (read 2000/2000 before the first frame). Unthrottled it passed 3 of 3. It also judged the time-based opening rise per frame and read its marks while the arrival glide was still moving. `cjk-font-fallback.spec.ts:20` set `lang="ja"` after `document.fonts.ready`, but `LocaleHtmlLang` writes `en` back when hydration ends. In the Playwright 1.62 Linux image at 6x the probe read `ja:WenQuanYi`, then `en:Pretendard Variable`. On macOS at 6x, with the read forced after boot, it failed 5 of 5. This recurs with 2673aefc (motion judged on a fast Mac), and the pnpm-link mount failure recurs with 7c0a8fd4.
**Cost**: one red train that blocked every landing train, plus about three hours to reproduce and fix both specs.
**Suspected cause**: changed e2e specs run only at the author's machine speed. A wait or a sampled frame that holds only because the page is fast passes there and fails on a 2-vCPU runner with two workers.
**Proposed change**: script: when `pnpm checks:changed -- --run` runs a changed e2e spec, it also runs that spec once with CDP CPU throttling at 6x on the static export, so a speed-dependent spec fails before landing.
