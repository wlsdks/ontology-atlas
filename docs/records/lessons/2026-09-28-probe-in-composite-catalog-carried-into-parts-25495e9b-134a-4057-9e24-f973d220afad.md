---
id: 25495e9b-134a-4057-9e24-f973d220afad
date: 2026-09-28
kind: tool-efficiency
status: reported
harness_area: messages
---
**Observed**: probing the new node-word ratchet, I planted a word into the composed `messages/ko.json` and `messages/en.json`, saw the gate go red, then ran `node scripts/build-messages.mjs` to restore them. The builder treats a composite that differs from its recorded digest as a hand edit and carries it into the parts (`carryHandEdit`, scripts/build-messages.mjs:195-212), so the plant landed in `messages/ko/fullDetailA1.json` and `messages/en/fullDetailA1.json` and the next run stayed red.
**Cost**: two extra test runs and a manual revert of two authored files; caught only because the restored run stayed red.
**Suspected cause**: the composite looks like a disposable build product (it is gitignored), but the builder's default mode adopts edits made to it.
**Proposed change**: skill: `/gate-probe` step 2 gains one line: plant catalog probes in `messages/<locale>/<Namespace>.json`, never in the composed `messages/<locale>.json`, which `pnpm messages:build` carries back into the parts.
