# Field-trial baseline

Measured runs, newest first. **Append, never rewrite** — the previous row is
what the next run is compared against.

The repository under test is deliberately not named here (`.claude/rules/forbidden.md`
— no third-party brands in this repo's files). Describe it by its shape instead,
which is all a comparison needs.

Rows older than the last two runs live in
[BASELINE-HISTORY.md](BASELINE-HISTORY.md); read it only when a comparison needs
a measurement the rows below do not carry.

## Summary

| Date | Target shape | Build (turns · cost · wall · nodes) | Sealed handoff (six questions) | Cited facts verified / invented |
|---|---|---|---|---|
| 2026-09-23 | MIT Rust CLI benchmarking tool, 66 files | 2 · $6.69 · 443 s · 18 | 5 answered, q4 refused honestly; after one `nextReads` deepening turn q4 partial | all cited paths present, 0 invented; deepening turn added 1 invented default |
| 2026-09-22 rerun | Apache-2.0 Go CLI framework, 66 files | 2 · $4.55 · 340 s · 16 | the two earlier misses (q4, q5) answered with exact lines | cited lines exact in the clone |
| 2026-09-22 | Apache-2.0 Go CLI framework, 66 files | 2 · $7.25 · 520 s · 22 | 3 full, 1 partial, 2 refused with reason | one line off by one, 0 invented |
| 2026-09-22 | MIT Python HTTP client library, 125 files | 2 · $6.43 · 499 s · 24 | 6/6 with slug and path citations | 0 invented |
| 2026-09-21 after card | MIT Node.js CLI argument parser, 216 files | 2 · $5.18 · 173 s · 20 | 5/6, q4 refused with the recorded reason | 12/12, 0 invented |
| 2026-09-21 before card | same | 3 · $10.06 · 312 s · 16 | 5/6, q4 partial | 14/14, 0 invented |

---

## 2026-09-22 — two more unfamiliar repositories through the shipped replay, and what they taught the product

**Subjects**: an MIT Python HTTP client library (125 files) and an Apache-2.0
Go command-line framework (66 files), each through `scripts/acp-replay.sh`
with an Opus builder and `scripts/sealed-reader.sh` with a Sonnet reader on six
questions sealed before any vault existed.

### Construction

| measurement | Python library | Go framework |
|---|---:|---:|
| person turns | 2 | 2 |
| builder cost / wall | $6.43 / 499 s | $7.25 / 520 s |
| nodes | 24 (4 domains, 12 capabilities, 7 elements) | 22 (5 domains, 7 capabilities, 9 elements) |
| write-door findings | 0 | 0 |
| nodes stating an unknown | 24/24 | 22/22 |
| finalize receipt | written | written |

### Persisted-vault-only handoff

- Python: **6/6** answered with slug and path citations; every node's
  Uncertainty line states how much of the file was read ("first 60 of 406
  lines"). Five line counts exact, import claims true, class lists true.
  Invented: 0.
- Go: 3 full, 1 partial, 2 "the vault does not say" with the reason recorded.
  The two missed behaviours (help templates, misspelling suggestions) live at
  lines 781 and 863 of a 2,072-line file the builder read only at its head.
  `type Command struct` cited as line 53, actual 54. Invented: 0.

### What the runs exposed, and what changed because of them

1. Both vaults carried the three starter example nodes untouched and
   unmentioned. The replay had run `init` where the app's door creates an empty
   folder (the script now mirrors the door; `--starter` reproduces the other
   door), and the product gained `starter-example-node`: silent on a fresh `init`,
   one warning per starter kind once a real node of that kind exists (verified
   on an `init` vault plus one real domain), 0 on the dogfood vault.
2. Head-only reads. The bounded source reader gained `mode: 'outline'`, which
   lists a file's declarations with line numbers so the next lines read is
   exact; a 928-line synthetic Go file yields its method at line 921.
3. Recorded unknowns had no next step. `growth_plan` now reads Uncertainty
   sections into `nextReads`: on the dogfood vault, 0 write candidates against
   96 reads.
4. Declared dependencies with no witness in the citing file: `dependency-
   unwitnessed`, 15 on the dogfood vault; a product-driven repair turn
   re-pointed two paths, removed one relation with a stated reason and gave the
   rest a witness in `why`; the check then had to learn to read the file a
   `why` names, editor-style paths included, and the last two were re-typed as a
   relation and re-targeted through `replace_relation`. Dogfood: 0.

### The rerun (after the mechanisms shipped)

Go framework again, fresh shallow clone, same six sealed questions, same
reader. Build: 2 turns, $4.55, 340 s, 16 nodes (5 domains, 11 capabilities);
the builder's own words: "I read its outline and the `Command` struct, not
every method body." Two capabilities the first run lacked now exist:
did-you-mean suggestions and help-and-usage rendering. Reader: q4 answered
with `SuggestionsFor` at command.go:863 and `findSuggestions` at :781 (both
exact in the clone) and the edit-distance helper at cobra.go:192; q5 answered
with `Help`, `UsageTemplate`, `HelpTemplate` in command.go (lines cited and
checked). 10 turns, $0.29. Pass condition, stated before the run, met.

### The third repository (2026-09-23): a Rust command-line benchmarking tool

The falsifier asked for a third unknown repository. An MIT Rust CLI (66
files, 37 of them Rust, module tree under `src/`), same replay, same reader,
six questions sealed before the clone. Build: 2 turns, $6.69, 443 s, 18 nodes (4 domains,
9 capabilities, 5 elements), finalize written with `impact` left partial on
purpose ("no runtime call graph was traced"). The replay's own summary line
called the build "stopped short" because the final answer never used the word
finalize; the receipt on disk says otherwise, so that heuristic is wrong and
the receipt is the record.

Reader (Sonnet, 11 turns, $0.28): q1, q2, q3, q5, q6 answered with slug and
path citations, every cited path present in the clone, invented 0. q4 (what
happens on a non-zero exit) answered "the vault does not say" and named the
two facts it could find (exit code is collected; a failure has a warning
wording). The truth sits at `src/cli.rs:227` (`--ignore-failure`),
`src/options.rs:421-433` (the failure action is chosen) and
`src/benchmark/mod.rs:67`; the execution node's own Uncertainty line says
lines 141-220 of `run` were read and the rest was not, so the miss is declared,
not hidden. **Corrected 2026-09-23:** this row first said the builder cited
`src/options.rs` without outlining it. It did outline it: the configuration
node's own Uncertainty line reads "`Options::from_cli_arguments` runs from line
276 to line 470 and was read only in outline", and the answer sits at 421-433,
inside that declared span. The loss was downstream. `growth_plan.nextReads`
filed that sentence under `other` with no file and no range, because it knew
neither "read only in outline" nor "from line A to line B", so the exact next
read the builder had written down never reached a queue. The same parser
handed back "only lines 141-220 were read" as the next read (the lines already
read) and filed "lines 138-414 of src/cli.rs" under `src/error.rs`, the file
named earlier in the sentence. All three are fixed in the round after this
one; on this vault the unrecognised lines fell from 7 of 19 to 1 and the
options span now heads the queue.

**The deepening turn (2026-09-23, after the parser fix).** The same builder
session was resumed once with a prompt naming no file: take `growth_plan`'s
`nextReads`, work the first six rows, patch each node, adds none. 26 agent
turns, $8.78, 225 s; six outline reads; validate clean. It read
`src/options.rs:276-470`, `src/cli.rs:138-414`, the rest of
`src/benchmark/mod.rs`, `scheduler.rs` and `tokenize.rs`, and rewrote each
Uncertainty line to what is still unread. The same sealed reader (14 turns,
$0.37) then answered q4 instead of refusing it: the tolerated exit codes are
chosen in `src/options.rs` (true), a failing setup/prepare/conclude/cleanup
command stops the benchmark (true, `src/benchmark/mod.rs:86-134`), and the
wording lives in `src/output/warnings.rs` (true). It also said a failing
benchmarked command "is still counted" by default, which is **false**: the
default is `RaiseError` (`src/options.rs:257`) and `executor.rs:86-112`
aborts; only a tolerated code is counted and warned about. `executor.rs` was
still unread and the node said so; the reader stitched the default together
from neighbouring facts. Grade: q4 partial with one invented default, up from
an honest refusal. One product defect surfaced on the way: the builder first
tried `read_source` on a code file and was refused, because that tool opens
only the vault's `sources/` documents; it found the analyzer's source reader
by itself, and a less persistent agent would have stopped there.

The vault validated clean under the witness rule that shipped in this round.
Under the tightened rule (an import, not a word) it carries 2 unwitnessed
edges out of 12: execution → timer (the timer is used from `executor.rs`, not
from the cited `mod.rs`) and export → terminal formatting (used from
`markup.rs`). Both `why`s are beliefs about the right module with the witness
one file away. The dogfood vault showed 7 such edges under the same rule; the
old rule had passed all 9 on the strength of a word or a folder name.

### What this row does not show

Same limits as the row below: one run per arm, one builder model, the
coordinating agent as grader, the permission card replaced by an allow-list.
The first two scratch vaults and reader transcripts were discarded when the
session was resumed; their numbers were recorded before the loss and cannot be
re-derived from those artifacts. The rerun's clone is a later revision than
the first run's, and only the Go arm was rerun.

---

## 2026-09-21 — the app's ACP first-run door, reproduced headless, before and after the construction card

**Subject**: an unfamiliar MIT Node.js command-line argument-parsing library
(216 files, one entry file, six implementation files, hand-written type
declarations). Not a cold CLI bootstrap: this row reproduces the desktop app's
"Build a first ontology for my code" door without the app — `claude -p` with
the vault MCP attached at `<project>/atlas`, the session's exact appended
handoff as `--append-system-prompt`, the exact first-run prompt as turn one,
then "go ahead" resumed as turn two. Builder: Opus. Reader: Sonnet with the
Atlas read tools only and six questions sealed before any vault existed, plus a
seventh asked afterwards: which claims does the vault itself mark as unchecked.

### Construction

| measurement | before (main) | after (final committed card) |
|---|---:|---:|
| person turns until nodes existed | **3** (turn 2 dead-ended at `canWrite:false`, $3.23, empty vault) | **2** |
| builder cost / wall | $10.06 / 312 s | $5.18 / 173 s |
| nodes written | 16 (1 project, 3 domains, 8 capabilities, 4 elements) | 20 (1 project, 4 domains, 9 capabilities, 6 elements) |
| validate / path drift | 0 problems, 12/12 files | 0 problems, all `path:` entries files, slugs under kind folders |
| finalize receipt | not written (builder believed it gated) | written; `impact` honestly `partial` (static imports only) |
| write-door findings on the result | project `Excludes` carried 3 evidence-limit bullets | 0 |
| nodes stating an unknown (`## Uncertainty`) | 16/16 | **20/20** (an intermediate card without the clause produced 0/12) |

Two intermediate runs on the branch drove the last two card clauses: one wrote
19 nodes flat at the vault root (nothing warned; now `slug-outside-kind-folder`),
one read the Atlas MCP source outside the vault to learn the competency layout
(now a guide topic and the finalize refusal), and one, after both fixes, dropped
every per-node unknown (now clause 3 requires `## Uncertainty`).

### Persisted-vault-only handoff

- Before: 5 of 6 answered with slug and path citations; q4 (where the
  unknown-option error is raised) honestly partial. 29 turns, 135 s, $0.42.
- After: 5 of 6 answered with citations and line ranges; q4 again "the vault
  does not say", and this time the vault says why — each error node's
  Uncertainty line records that the throwing call sites were not read. The
  seventh question returned a per-node list for all 20 nodes (which lines were
  read of 2,790, that no code was executed, that the source reader refused the
  README so headings were corroborated by name only). 15 turns, 71 s, $0.37.

### Accuracy

Every cited fact was grepped in the clone: before **14/14**, after **12/12**
including the recorded line numbers (`node:child_process` import at line 2, the
executable-handler fields at lines 43–44, the lazily created help option at
lines 79–87). Invented claims: 0 in either arm.

### What this row does not show

One repository, one builder model, one run per arm; the grader was the
coordinating agent, not an independent one; the app's permission card was
replaced by an allow-list, so "the person approves every write" was assumed.
Node counts vary between runs of the same arm (12, 19, 20) under "prefer few,
well-evidenced concepts"; that is builder variance, not a measured effect.
The bounded source reader refused the README, so the project's own statement
of purpose reached the builder only through the package manifest.
