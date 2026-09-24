---
id: "d7935a01-45de-4cb8-8a52-e4b5a2f1b54d"
date: "2026-09-24"
task: "PERF-LIBRARY-PREPASS"
status: "done(local implementation and runtime proof; landing pending)"
parents: []
worktree: "main-3"
---
Flow and Islands no longer settle discarded force footprints during initialization or synchronization. Force preparation remains enabled when that picture is entered. Layout-only and overview-only changes now synchronize the selected picture.

Validated locally: 39 focused tests; 22 static-export browser cases for pan, zoom, cards, islands, keyboard and reduced motion; production build; all checks:changed recommendations. The new work-count gate failed against the original initialization and a separately restored sync defect, then passed after restoration.

An isolated alternating benchmark at 1,192 marks measured Islands mount 239.04 to 3.97 ms and sync 243.37 to 4.20 ms (median of three); final coordinates/radii matched in all 20 size/layout/lifecycle comparisons. The actual browser probe measured a single last-sync observation of 270.3 to 17.2 ms with all 1,192 node records equal. This is not a whole-app or native-WKWebView speed claim.

Computer Use identified the controlled Chromium PID/window and captured the baseline, Flow transition and returned Islands state. Evidence: /Users/jinan/scratch/library-prepass-20260924/. The Library capability and source ownership were read; no capability, relation, write authority or acceptance meaning changed, so no ontology write is proposed. PR landing is separate and pending at this observation.
