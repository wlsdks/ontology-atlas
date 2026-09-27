---
id: 79adce85-b301-4a9f-9369-dd94a665ffe7
date: 2026-09-27
kind: mistake
status: reported
harness_area: fs-walks
---
**Observed**: #2026's first commit replaced #2012's whole-walk visited set with an ancestors-only check, following lesson 76760f52. Review showed that the walk then re-enters a real folder once per link route. A 14-level lattice with two links per level took 4,427 ms against 12 ms on main and hit the 20,000-entry budget; with one loop link added it returned 4,999 skip rows (1.2 MB); thirty domains linking one 300-file references folder lost three real nodes to the budget. 76760f52's proposed ancestors-only walk fits agent-files, whose output is one line per path, but not a walk whose rows are keyed by real path.
**Cost**: one review round and a second commit on #2026.
**Suspected cause**: the cycle guard was chosen without asking what the rows are keyed by. When rows are keyed by real path, a second route to a folder already walked adds nothing and can return silently; when rows are paths, that route must be walked.
**Proposed change**: script: a shared walk helper that takes the row key (walked path or real path) and uses ancestors-only or ancestors plus a silent whole-walk set accordingly, with a two-links-per-level lattice fixture in each walk's tests.
