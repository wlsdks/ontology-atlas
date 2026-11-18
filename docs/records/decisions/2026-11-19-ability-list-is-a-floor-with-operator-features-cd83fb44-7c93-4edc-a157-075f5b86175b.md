---
id: cd83fb44-7c93-4edc-a157-075f5b86175b
date: 2026-11-19
---
## 2026-11-19 — The survey's ability list is a floor under the builder's own, and it reaches operator features

**Why**: Stage D regrade (4/13/0/1 of 18): go-server must-have coverage fell from 13 to 9 of 14 because its list held only 2 executables, 3 example routes and 9 dispatcher cases, and the door prompt said "every ability it lists", so metrics, configuration, JWT and signed streams vanished. py lost `apply_inverse_transform` (three same-name declarations) and `register_backend` (a subpackage export).
**Prior**: Narrows `6ae3d739` (breadth counts abilities): placement against the list stands; what the list holds, how an exclusion counts and how finalize lists them change. `888605dd`, `c8e10093`, `0f78a22b` and the 1,940-character card stand.
**Decision**: The survey also lists subcommands, flag groups and lone behaviour switches, configuration settings that turn a feature on, background workers and schedulers, library exports resolved through their re-exporting module and public subpackages (three or more from one module as one `api` row), and README or docs headings a folder, file or declared type also names; every row carries `evidence` `path:Lline`, at most 120 shared equally between kinds, with what each kind leaves out counted. The abilities section sits outside the map's 24 KB unit budget, so it never pushes a unit out. The door prompt asks the agent to list every ability for a user, operator or other system from the outlines and docs, with the survey's list as the floor under it. A node places an ability by its `path:` with its name, by its title, or by a code-form name in its body (`name`, `--flag`, its `path:Lline`), never by a word in passing. One exclusion line excludes one ability, by its `path:Lline` or exact name with a reason of at least three words; a line naming several excludes none. Finalize lists every unplaced ability.
**Dissent**: a longer floor costs builder turns and can invite one-word mentions that place an ability without explaining it; heading matching by name can pair a heading with the wrong folder.
**Falsifier**: in the stage E replays must-have coverage does not recover in go while every listed ability is placed, or builds pass the floor by naming flags in a single bucket node.
**Owner**: Stark
