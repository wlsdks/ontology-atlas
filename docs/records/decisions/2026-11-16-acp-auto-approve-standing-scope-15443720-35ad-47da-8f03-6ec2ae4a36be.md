---
id: 15443720-35ad-47da-8f03-6ec2ae4a36be
date: 2026-11-16
---
## 2026-11-16 — A person can turn on auto-approve for one conversation; vault edits and additive ontology writes then pass without a card

**Why**: The owner reported that approving every write makes the in-app agent tiresome enough not to use.
**Prior**: 2026-08-21 (92) "ACP writes proceed only after a human confirms the change proposal" stands as the default and is narrowed: the person may confirm once per conversation. 2026-09-29 (unattended rounds refuse Atlas writes) stands: a round never gets auto-approve. 2026-09-17 (rounds approved once) is the precedent. 2026-09-03 (Codex pinned to read-only) stands: the adapter keeps asking and the app answers.
**Decision**: The composer's Approval choice is "Ask every time" (default of every conversation, never persisted) or "Auto-approve". While on, inside an active turn, the app answers `allow_once` for (a) an `edit` of a file that resolves inside the opened folder through no dot-prefixed component, is not an agent instruction file and is named by one consistent path argument, and (b) Atlas `add_concept(s)`, `add_relation(s)`, `replace_relation`, `reclassify_concept`, `rename_concept` without overwrite and `patch_concept` that clears nothing. Everything else shows the card. Each auto-approved request leaves a transcript line; an Atlas write's receipt is marked auto-approved. Adapter automatic modes stay hidden.
**Dissent**: The card is the only point where a person sees the typed change before it lands; a mistaken or prompt-injected agent can now rewrite many nodes, shrink a relation list or edit a file that runs later, and a Git diff is review after the fact (security lens). Opposite: shell commands still ask, so the complaint may stand.
**Falsifier**: An auto-approved request that reached outside the folder, a dot path or an instruction file; an `allow_always` or mode-raising option chosen by the app; a delete, merge, overwrite, commit or `finalize_project_meaning` passing without a card; a receipt or screen saying a person approved what nobody pressed; or the owner still finding the cards too frequent after a week.
**Owner**: the repository owner.
