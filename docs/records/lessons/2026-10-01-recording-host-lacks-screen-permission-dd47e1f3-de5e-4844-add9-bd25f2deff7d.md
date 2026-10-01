---
id: dd47e1f3-de5e-4844-add9-bd25f2deff7d
date: 2026-10-01
kind: tool-efficiency
status: reported
harness_area: motion-verify
---
**Observed**: #2222's review asked for `/motion-verify` recordings. From this agent's host, `screencapture -x` returned an all-black 3024×1964 image (luminance extrema 0, 0) and `screencapture -R 100,100,400,300` failed with "could not create image from rect", inside and outside the sandbox: the host app has no macOS Screen Recording permission. The skill's first step records with `screencapture -v` and never checks this.
**Cost**: about 25 minutes: a recording driver, failed captures, and a Playwright page-video detour whose frames repeat the first frame between real ones, so it gave no stall statistics.
**Suspected cause**: the precondition says the surface must be visible on a real monitor but not how to tell that the capturing process can read the screen, and a black capture looks like a dark map.
**Proposed change**: skill: in motion-verify's preconditions, take one `screencapture -x` still first and report the proof as deferred when every pixel is 0; say that Playwright's page video cannot stand in for stall statistics.
