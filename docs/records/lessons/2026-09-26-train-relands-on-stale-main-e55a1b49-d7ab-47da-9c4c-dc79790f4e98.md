---
id: e55a1b49-d7ab-47da-9c4c-dc79790f4e98
date: 2026-09-26
kind: mistake
status: reported
harness_area: landing
---
**Observed**: `pnpm pr:land 1898` merged train #1899, then logged "#1898: main does not provably contain 645457ad6; left open and queued", built train #1900 and merged it too; main carries 0c816164a, an empty second commit.
**Cost**: one wasted CI run and a noise commit; with a bigger batch every component could land twice.
**Suspected cause**: containment was judged on the first fetch after the merge API answered, before origin/main showed the squash commit, and an unproven component was re-queued.
**Proposed change**: script: fetch until origin/main is the merge commit the API returned, and never re-queue a component a merged train carried.
