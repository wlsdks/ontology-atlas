---
uid: 8550b674-11ae-447c-bafb-d6fb1f7d8969
slug: capabilities/evidence-drift
kind: capability
title: Evidence Drift
display_ko: 근거 드리프트
display_en: Evidence Drift
domain: domains/graph-modeling
elements: []
path: mcp/src/evidence-verdict.mjs
created_by: "agent:claude"
relates: [capabilities/summary-freshness]
relation_notes: { capabilities/summary-freshness: "Two clocks, two questions: summary freshness compares a node's prose with its own containment list, while this compares a node's document with the code it cites. Neither blocks anything and neither rewrites meaning." }
---

## Definition

Says, for one concept, whether the meaning a person recorded still stands on the code it cites. One bounded Git walk dates every path the concept names and the concept document itself, and a single rule turns those dates into one of four words: current, stale, missing, unknown. It is read-only and advisory; it never rewrites a document and never claims the meaning is wrong, only that the ground under it moved.

## Behaviour Contract

1. **One rule, both surfaces.** `mcp/src/evidence-verdict.mjs` holds the verdict and its priority, and the analysis screen reaches it through `src/shared/lib/evidence-verdict.mjs`. They disagreed for a day, so `tests/contract/evidence-drift-parity.contract.test.ts` runs one fixture through the screen's resolver and the server's and compares.
2. **The priority is total.** A cited path that is gone outranks a file that moved; a moved file outranks anything undated; a folder that moved is never stale, because a folder changes on almost any commit, so it lands in unknown with its own reason.
3. **Unknown is a real answer.** A browser cannot read the code beside a vault, a vault may sit outside Git, and a path may have no commit in the walk window. Each of those says so rather than reporting the concept as current.
4. **Bounded by construction.** One `git log --name-only` walk over at most 3000 commits and 512 paths answers every concept; rows are sorted by slug so two runtimes report one order.

## Evidence

- The rule: mcp/src/evidence-verdict.mjs#judgeEvidence
- The server's answer: mcp/src/tools/validate-vault.mjs, returned as `validate_vault.evidenceDrift`
- The walk, in Node: mcp/src/git-tools.mjs#collectPathLastChanges
- The walk, in the installed app: src-tauri/src/git.rs#git_paths_last_change
- The screen's resolver: src/views/ontology-insights/lib/brief/evidence-states.ts#resolveEvidenceStates
- Parity gate: tests/contract/evidence-drift-parity.contract.test.ts

## Includes

- A per-concept verdict wherever Git can be read, and the named rows behind a count: the concept, the exact path, the date it changed and the date its document last changed.
- The same four words for a person and for an agent, so a handoff does not change the fact.

## Excludes

- Judging whether the recorded meaning is *correct*; that is reading work a person or an agent does after this points at the file.
- Rewriting a document, proposing a sentence, or writing anything to the vault.
- A score, a grade, or a percentage of health.
