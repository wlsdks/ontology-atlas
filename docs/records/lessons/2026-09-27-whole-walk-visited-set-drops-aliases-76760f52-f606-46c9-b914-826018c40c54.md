---
id: 76760f52-f606-46c9-b914-826018c40c54
date: 2026-09-27
kind: mistake
status: reported
harness_area: fs-walks
---
**Observed**: the first commit of #2017 kept one visited set per scan folder in `walkFiles` (`cli/src/commands/agent-files.mjs`). Independent review showed it drops real files on loop-free trees: `a-review -> review` hid a stale `.agents` skill copy (exit 0 instead of 1), and `alpha/references -> ../beta/references` invented a `skill-copy-file-missing`. Its bare catches also turned EACCES into "in sync". The same whole-walk set landed with #2012 (8c9292f19): with `docs/ontology/alias -> domains`, `detectExistingOntologyEvidence` returns `alias/ops` and no longer `domains/ops`, which the walk before #2012 returned. Both old-versus-new comparisons had passed because no fixture held a loop-free alias link.
**Cost**: one review round and a second commit on #2017; one landed evidence change from #2012 still open.
**Suspected cause**: the cycle guard remembered every real folder walked, which also deduplicates loop-free aliases, instead of only the real folders on the current path; the equivalence fixtures covered loops and escapes but not aliases.
**Proposed change**: script: one shared ancestors-only walk for path-producing walks (skip ENOENT, ELOOP and ENOTDIR; rethrow the rest), used by the agent-files and docs/ontology walks, with a loop-free alias fixture in each walk's tests.
