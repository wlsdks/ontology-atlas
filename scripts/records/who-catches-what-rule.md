# Who catches what: the classification rule

This rule decides, for each `fix` change, whether it corrected lines an earlier
merged change wrote (a late find) and what caught the fault. It was written and
committed before the details of any fix were opened; only the subjects of the
five newest changes in the window were seen, while counting the window. It is
not edited afterwards. If it proves wrong, the report says where.

Spec: `docs/specs/2026-11-27-when-people-cannot-keep-up.md`, acceptance
criterion 2. Script: `scripts/records/who-catches-what.mjs`.

## Which changes

- A change is one first-parent commit of `main`. Its pull request number comes
  from its subject: `Merge #N: ...` or a trailing `(#N)`.
- The window is the 200 first-parent commits ending at `bf6670e469`, the commit
  the spec measured.
- A fix is a change whose subject, after a leading `Merge #N: ` is removed,
  starts with `fix:` or `fix(`.

## (a) Late find

1. The fix's diff is `git diff -U0 -M <first parent> <fix>`.
2. Paths that are never counted: `src/entities/docs-vault/data/`,
   `public/docs-vault/`, `docs/.generated/`, `docs/records/`, `pnpm-lock.yaml`,
   `Cargo.lock`, `package-lock.json`.
3. The corrected lines are the first non-empty tier of:
   1. **code**: removed lines in files that are neither tests nor documents. A
      test is a path under `tests/` or `e2e/`, or a file name containing
      `.test.`, `.spec.` or `_test.`. A document is a `.md` file or a path
      under `docs/`.
   2. **tests or documents**: removed lines in tests or documents.
   3. **insertion point**: when the fix removes nothing, the old line directly
      above each insertion, code files first, then the rest.
4. Each corrected line is blamed at the first parent with
   `git blame -w --first-parent`. The answer is the change on `main` that last
   wrote the line.
5. The introducing change is the one that last wrote the most corrected lines.
   A tie goes to the most recent.
6. Late find is **yes** when tier 1 or 2 names an introducing change, **yes, by
   insertion point** when only tier 3 does, and **not traced** otherwise. Tier 3
   is reported apart: an insertion point says where the missing code belonged,
   not who left it out.
7. The age is the fix's commit time minus the introducing change's commit time;
   on first-parent commits these are the merge times. The rule also records
   whether the introducing change lies inside the window, and whether a stable
   release tag (`vX.Y.Z` with no suffix) was created between the two.

## (b) What caught it

**Evidence read**, and nothing else:

- The pull request body, cut at the first heading whose text starts with
  `Test plan`, `Testing`, `Verification` or `Checks`. That section says how the
  fix was checked, not how the fault was found.
- The body of the pull request's oldest commit: for a merge, the oldest commit
  of `<first parent>..<second parent>`; otherwise the fix commit itself. Later
  commits in a pull request usually answer review of the fix itself.
- Pull request comments and review bodies, except those that open with an HTML
  comment (`<!--`): those are written by scripts such as the landing queue.
- Each issue the pull request closes: its title, body and author.
- The `Checks` workflow's `push` runs on `main`.

Runs on the introducing pull request are not read: a pull request merges only
when its run is green, so a failure there was fixed before the merge and cannot
have caught a fault that merged.

**Classes.** The first class whose evidence is present wins, in this order:
user, person, gate, agent, luck, unknown. The order names whoever reported the
fault first. An outside report or the owner starts a chain; an agent that then
finds the cause did not catch it. All patterns ignore case. "Same sentence"
means no `.` or line break between the two parts.

- **user**: a closed issue whose author is not `wlsdks`, or text matching
  `\b(a|an|one|outside|external) (user|tester|contributor|customer)s? (reported|reports|hit|hits|ran into|saw|filed|opened)\b`,
  `\b(user|bug|outside|external) report\b`, or
  `\breported (by|from) (a|an) (user|tester|contributor)\b`.
- **person**: text that names the owner as the one who reported it:
  `\bowner(?:'s)?\b` followed in the same sentence, within 80 characters, by
  one of `reported|report|noticed|found|saw|asked|flagged|pointed out|spotted|caught|showed|sent|screenshot|complained|said|wrote|observed|hit|ran into`;
  or `\b(reported|noticed|found|flagged|spotted|asked) by the owner\b`; or
  `translated from Korean`, the marker this repository puts on the owner's
  quoted words.
- **gate**: either
  - text where a check word
    (`CI|Checks|check|checks|gate|gates|pre-push|pre-commit|hook|hooks|lint|eslint|typecheck|tsc|test|tests|contract|contracts|lane|lanes|job|jobs|workflow|build|e2e|clippy|spec|specs`)
    and a failure word
    (`failed|fails|failing|failure|went red|turned red|is red|was red|broke|broken|breaks|caught|flagged|refused|rejected|blocked|tripped|timed out`)
    stand in the same sentence, check first within 60 characters or failure
    first within 30, unless the 25 characters after the failure word start with
    `without`, `before`, `on the old`, `against the old` or `if`: that is a
    new test described, not a check that caught anything; or
  - `main` was red before the fix and green after it: the `Checks` push run on
    the fix's first parent concluded `failure` and the one on the fix concluded
    `success`.
- **agent**: text where a looking word
  (`review|reviews|reviewed|reviewer|reviewers|code-reviewer|audit|audits|audited|QA|dogfood|dogfooding|field trial|field-trial|probe|probes|sweep|inspection|inspected|walk|walkthrough|census|survey|measured|measurement|measuring`)
  is followed in the same sentence, within 60 characters, by a finding word
  (`found|finds|caught|flagged|noticed|surfaced|spotted|reported|showed|finding|findings|turned up|revealed`);
  or a finding word (`found|caught|flagged|noticed|surfaced|spotted|revealed`)
  is followed within 40 characters by `in`, `during`, `by` or `from`, then an
  optional `a`, `an` or `the`, an optional `independent`, `security` or `code`,
  and a looking word. Also agent: a luck sentence (below) that names a pull
  request `#N` whose change shares a file with the fix, because that other work
  was in the same place.
- **luck**: found while doing something unrelated, with no check, report or
  looking activity pointing at it. Text where
  `found|noticed|spotted|discovered|came across|turned up|saw` is followed in
  the same sentence, within 40 characters, by `while`, `during`, `in passing`
  or `along the way`; or the words `incidentally`, `by chance`, `happened to`,
  `in passing`, `along the way` or `by accident`.
- **unknown**: none of the above.

Every change here is written by an agent, so who noticed cannot separate agent
from luck. What separates them is the activity: looking for faults, or work in
the same files, is agent; anything else is luck.

## The hand-checked sample

Twenty fixes, drawn by a seeded shuffle of the fixes in window order
(mulberry32, seed `20261127`, Fisher-Yates), first twenty taken. Each is read in
full by hand, and the script's late find and class are marked right or wrong.
