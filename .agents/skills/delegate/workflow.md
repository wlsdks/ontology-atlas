# Delegate to parallel agents

Concurrency is not the risk; uncoordinated shared state is.

## 1. Do not delegate small or entangled work

Keep work local when it needs a handful of tool calls, merely rechecks your own
result, or edits the same files. Delegate exhaustive inventories,
environment-isolated work, and reviews whose value is independence.

## 2. Generate the brief

```bash
pnpm conflicts:scan
pnpm brief:new -- --slug=<branch> --owns=<path,...> [--read=<path,...>] [--port] [--path=train|integration] [--budget=<text>]
```

`brief:new` fills the eight mandatory lines: the free port and its Playwright
environment (or no server), owned and read-only files, no stash, no
`git add -A` and no worktree deletion, scratch in the session scratchpad, the
focused checks for the owned paths, primary sources, the landing rule, and the
budget. Under its `## Task` add only what a script cannot know: the decisions
already made, the acceptance command, and what to report. Choose `--owns` so no
file is in two slices and none is changed by an open pull request.

## 3. Ownership a script cannot assign

- **Ratchet baselines:** only one agent edits a ratchet file. Two branches
  lowering one literal cannot be combined arithmetically; the merging owner
  recounts after integration and lowers it once.
- **Design values:** the slice that declares `design-contract` owns
  `control-class.ts`, the ramps in `app/styles/` and the design-system rules.
  An implementation agent that cannot express a needed value reports the gap;
  it does not add a parallel value.
- **Approval:** the author of a change does not approve it.

## 4. One procedure, many slices

For a sweep, rename or translation across areas, write the procedure once in a
scratchpad brief and give each agent that file plus its slice id:

- a manifest built by a script from `git ls-files` maps every path to exactly
  one slice;
- one pilot slice runs first; its review becomes amendments at the top of the
  brief before the fan-out;
- every slice reports each owned path's outcome (changed, nothing to do, or
  skipped with a reason), so coverage is counted, not trusted.

After the slices return, `/land` reviews and lands them.
