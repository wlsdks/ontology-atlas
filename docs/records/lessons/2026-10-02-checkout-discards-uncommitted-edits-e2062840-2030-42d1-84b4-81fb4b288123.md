---
id: e2062840-2030-42d1-84b4-81fb4b288123
date: 2026-10-02
kind: mistake
status: reported
harness_area: git
---
**Observed**: On `design/acp-permission-card`, a token-scanner script meant to strip comments from `src/widgets/acp-chat-panel/ui/AcpPermissionCard.test.tsx` lost sync and removed only 17 of 27 comments. To undo it I ran `git checkout src/widgets/acp-chat-panel/ui/AcpPermissionCard.test.tsx`, which restored the merge-base file and discarded every uncommitted edit in it (6 new tests and 6 rewritten assertions), not just the script's output. The edits were re-applied from the session's own record; a parser-based strip (`ts.createSourceFile` plus `getLeadingCommentRanges` per token) then removed all 27.
**Cost**: about 10 minutes and a full re-application of a test file; no CI round.
**Suspected cause**: no checkpoint existed between the hand edits and the mutating script, and `git checkout <file>` was used as an undo for the script when it is an undo for every change since HEAD.
**Proposed change**: rule — before a script rewrites a tracked file that already has uncommitted edits, copy it to scratch or make a WIP commit, run the script on a scratch copy, and restore from that copy; `git checkout <file>` is never the undo for a script.
