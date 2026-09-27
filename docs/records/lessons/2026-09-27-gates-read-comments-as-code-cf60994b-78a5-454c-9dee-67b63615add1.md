---
id: cf60994b-78a5-454c-9dee-67b63615add1
date: 2026-09-27
kind: gate-gap
status: reported
harness_area: gates
---
**Observed**: on `fix/gates-read-code-not-comments`, `tests/contract/unused-token-ratchet.contract.test.ts` passed at 0 while six tokens were named only in comments (`--color-shadow-a22`, `--control-row-h`, `--git-evidence-min`, `--git-step-h`, `--topology-motion-camera-duration`, `--vault-layer-col-min`; the oldest lost its consumer in #848, 2026-08-03). `undeclared-token-ref` accepted `var(--probe-ghost)` declared only by a commented `setProperty`, and flagged a `var()` inside a comment. `test-title-language` missed 156 Hangul assertion messages built with `+`, a conditional or `.join()`. `control-class` and `page-frame` contracts pinned comment prose: rewording a comment turned them red, and breaking the docs body width in code left `page-frame` green.
**Cost**: dead tokens and their `docs/DESIGN-SYSTEM.md` rows survived up to eight weeks; 156 messages stayed outside the language ratchet; review time unknown.
**Suspected cause**: the gates matched raw source text, so a comment counted as code, and the message extractor read only a bare literal.
**Proposed change**: gate, done on this branch (code read through `blankComments`, assembled messages evaluated). skill: one line in `/gate-probe` step 2, that a gate searching source text also plants its subject in a comment only and requires it not to count.
