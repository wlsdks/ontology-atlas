---
uid: e36aaa84-c19c-4001-bd51-b53803c86d3c
slug: elements/git-evidence-dating
kind: element
title: Git evidence dating
display_en: Git evidence dating
display_ko: Git 근거 시점 확인
domain: domains/code-evidence
path: mcp/src/evidence-drift.mjs
created_by: "agent:claude-code"
dependencies: [elements/evidence-verdict-rule]
relation_notes: { elements/evidence-verdict-rule: "You asked me to turn imports I actually witnessed into dependencies: the scan shows evidence-drift.mjs importing evidence-verdict.mjs so the dates and the verdict cannot disagree." }
---

Dates every cited file and every concept document from Git in one walk, so each concept can be told whether its evidence moved after the meaning was last written.

## Includes
- One bounded Git walk producing a last-changed time per cited path and per document.
- An explicit unknown when no time could be read, rather than a default of current.

## Excludes
- Judging the verdict itself, which is stated by a separate shared rule.
- Working at all where the vault is not inside a readable Git repository.

## Uncertainty
- Read from the module header, which cites a 2026-09-13 probe claiming this one fact cut a reader's missed impacts by 75 percent; that measurement was not reproduced here. In this vault the check reports `checked: false` on every run, because the vault folder sits outside a Git repository.