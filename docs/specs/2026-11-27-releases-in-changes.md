---
title: Releases in Changes
doc_type: spec
status: draft
area: git
date: 2026-11-27
decisions: []
---

# Releases in Changes

The owner asked on 2026-11-27 (translated): "It would be better if releases could be managed too.
A feature to gather versioned things in one place; there seems to be nothing like that now. If the
source has releases, Atlas should see them by itself (tag-based, probably) and let me browse them
gathered together." No capture of him looking for a release exists; criterion 1 makes one.

## Person and moment

A developer who already runs coding agents and tags releases `vX.Y.Z`, sometimes `-beta.N` first.
Two moments, read from his words and this repository's history, not from a capture. **Before
tagging**: what would go out if I tagged now? **Looking back**: what did v2.4.0 hold, and what
moved between v2.3.0 and v2.5.0? Today he leaves for a hosted releases page, `git tag` and
`git log a..b`. Next, someone learning a codebase version by version; then someone with tags and
no agent. Also in view: no tags, lightweight and annotated tags, a monorepo tagging `pkg@1.2.3`.

## Today

- **No surface lists tags.** Across `src-tauri/src`, `mcp/src`, `src` and `cli` the only
  `for-each-ref` reads `refs/replace` (`mcp/src/git/git-tools.mjs:675`) and the only `show-ref`
  resolves branch names (`src-tauri/src/git/base_line.rs:53`); searched 2026-11-27.
- **Changes reads by dates only**: its commands take two epochs
  (`src-tauri/src/git/briefing.rs:503-509`) and its periods are day, week, month, year and custom
  (`src/views/change-briefing/ui/ChangeBriefingPage.tsx:43`). It makes no network request
  (`docs/features/change-briefing.md:24`) and counts first-parent changes of the branch work
  merges into (`docs/features/change-briefing.md:95-99`).
- **A read is bounded** at 2,000 changes, 8 MiB, 20,000 paths and 30 s
  (`src-tauri/src/git/briefing.rs:22-24`, `src-tauri/src/git/briefing.rs:145`), resolves its root
  in Rust (`src-tauri/src/git/briefing.rs:178-260`) and takes only 40- or 64-hex revisions from
  the page (`src-tauri/src/git/briefing.rs:308-310`).
- **Changed files already map to concepts**: a capability's `path:` and its elements' paths
  (`src/shared/lib/git/evidence-states.ts:116-145`) are matched against changed paths
  (`src/views/change-briefing/model/briefing-model.ts:51-88`). The anchors are today's, not
  history's (`docs/features/change-briefing.md:130-133`); a repository picked alone gets none
  (`src/views/change-briefing/ui/ChangeBriefingPage.tsx:106`).
- **That mapping is thin here.** 9 of this repository's last 12 patch releases touch no recorded
  capability. Minor releases touch more: v2.2.0 to v2.3.0, 15 capabilities in 22 of 84 changes;
  v2.3.0 to v2.4.0, 16 in 13 of 58; v2.4.0 to v2.5.0, 30 in 12 of 64 (`release-reach.py` in the
  session scratchpad, 2026-11-27, `origin/main` at 901e6c398c). Decision 4ee43750 recorded the
  same share for one day: a quarter of its changes.
- **This repository's tags**: 72 (46 lightweight, 26 annotated, 19 named `-rc.N`), none sharing a
  commit, all on the first-parent line of `origin/main`, which holds 6,302 changes. The largest
  release holds 310; 4,301 precede the first tag; 2 are unreleased; v2.7.1 to v2.7.12 were tagged
  in four days (Git, 2026-11-27).
- **Measured cost**: on a generated repository of 5,000 tags and 30,000 commits, names and dates
  read in 0.13 s and one first-parent walk carrying tags and titles in 0.22 s and 2.4 MB. Every
  path of this repository's history is 19 MB of output.
- **Elsewhere**: the MCP Git tools read the vault path only
  (`mcp/src/server/tool-definitions/git.mjs:11`); a browser shows a card and no history
  (`messages/en/gitBriefing.json:5`); project-bound reads are unavailable on Windows
  (`docs/features/change-briefing.md:154`); the vault's 97 concepts (`list_concepts` census,
  2026-11-27) include none describing Changes; a beta and its final release are the same bytes
  (decision 6a7d0dc1).
- **Unknown**: the tags of the owner's other repositories; where he last looked for a release;
  whether one MCP call maps a path to a concept; whether a tag read works on Windows.

## Problem and alternatives

Changes can say what was merged on a day and cannot say what a version holds, so both moments end
outside Atlas, on a page that lists titles and never names what the product does.

**The asks, ranked by value against cost.** (1) What is unreleased and what each release held:
both moments, one new read, the digest reused. (2) Any span between two releases: nearly free on
(1). (3) The concepts whose files changed: the reason to do this in Atlas, with the thin coverage
above. (4) Managing as writing (notes, a tag, a push): outward-facing, each its own decision. The
first slice is (1) to (3), which share one read; (4) is Later 3 and 7.

### Patterns that already solved this

From general knowledge; none was re-read at its source in this session, so every row is an
assumption until a builder relies on it. Only principles are borrowed; nothing is copied.

| Pattern | Principle and why it worked | How it fails | What Atlas borrows |
|---|---|---|---|
| Hosted release pages (GitHub, GitLab) | A release is a tag plus a note its author wrote, newest first; any two tags compare; the host drafts a note from pull request titles since the previous tag. The tag is an anchor every clone already has. | Needs the host and a network; a tag without a note is a bare name; the draft is a title list. | The tag as anchor, newest first, the previous tag as the default start, any earlier one selectable. |
| Keep a Changelog | A hand-kept file: newest first, Unreleased on top, entries under a few fixed kinds. Pending work is visible before the release. | Kept by hand, so it drifts from the tags. | Unreleased as the first row; kinds of work as the first cut. |
| Notes from typed commits (release-please, semantic-release, changesets, git-cliff) | Notes and the next version derive from typed titles, so no second document is kept; git-cliff does it offline. | It repeats what was typed; untyped titles become "other". | Types as typed, the author's breaking mark, no kinds under half typed: the digest's rules (`docs/features/change-briefing.md:29-34`). |
| Git itself (`git describe`, `git log a..b`) | Every commit has a nearest earlier tag; no infrastructure. | Command recall, no overview, no meaning. | The nearest earlier tag on the first-parent line as a release's start. |

New in Atlas's combination: the same local read joined to recorded concepts, with their absence
said plainly, offline and with no second document to keep.

### Alternatives

| Way | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| Status quo: a hosted page, `git tag`, `git log a..b` | the list and the titles | leaves Atlas; needs the host or command recall | none | the page needs a network | loses: it is the trip, and it never names a concept |
| `Release` as one more Period choice with previous and next | one release's digest | nothing is gathered; a release is found by stepping | smallest | holds | loses: answers "this release", not "which releases" |
| A new `/releases` route and rail entry | a place of its own | a second destination showing the same digest | a route needs a decision record (`.claude/rules/git.md:29`) | holds | loses for now: Later 6 |
| An MCP read tool first, no screen | an agent drafts notes by concept | the person sees nothing; the agent's shell already lists tags | a public contract (`AGENTS.md:63`) | holds | loses for now: Later 2 |
| **By release inside Changes: a release list beside the digest that exists** | Unreleased, every release, any span, and the concepts whose files changed | one press from the screen that already reads this repository | one new bounded read; digest and concept matching reused | reads local refs, writes and sends nothing | chosen |

**What changes for someone who uses Changes today.** One two-way control, **By date | By
release**, joins the period bar. By date stays the default and behaves as before, so decision
4ee43750 holds. The slice is read-only: Atlas never creates, moves, deletes or fetches a tag.

**Decided, owner delegated to the lead, 2026-11-27.** (1) The first version lists one repository,
the one Changes reads; gathering every connected repository is Later 6. (2) The first slice is
read-only; drafting notes, creating a tag and pushing stay later slices, each with its own
decision. (3) A pre-release is its own row with the pre-release mark, and a final release counts
the changes of its betas (rule 4 below). (4) The Korean catalogue says "release" as
`README.ko.md` spells it, the standard spelling.

### What a release is

1. One release per tagged commit; several tags on one commit are one release with every name.
2. Lightweight and annotated tags are alike. The date is the tagged commit's, because a
   lightweight tag records none of its own.
3. A tag name is the text before its version number (`v`, `web@`, `api/v`, or nothing) and the
   version; tags sharing that text form one sequence. A name without a version is listed alone.
4. A release starts at the nearest earlier tag of its sequence on the first-parent line behind it.
   One without a pre-release suffix skips the pre-releases of its own version. With no earlier
   tag it starts at the first commit.
5. It holds the first-parent changes after its start up to its tag, counted as Changes counts: in
   a monorepo, every change on the branch in the span, not one package's files.
6. Unreleased is the changes on the read branch after the newest release on it.
7. Order is position on the read branch, newest first. A tag outside that line is listed at its
   date, drawn off the line and counted when selected.

## Flow

1. When the person opens Changes on a repository, Atlas shows **By date | By release** in the
   period bar with By date selected; nothing else changed.
2. When they press By release, Atlas lists every tag name with its date at once, Unreleased first,
   then fills counts and kinds newest first while input stays free. It selects Unreleased when it
   holds a change, otherwise the newest release, and reads that digest.
3. When they select another release (pointer, arrow keys, Home, End, or typing in Find a release),
   the span mark moves to it and the pane shows its digest since its start.
4. When they choose under Since, which offers every earlier release on the same line and the
   first commit, the span mark stretches to it and the digest covers the whole span.
5. When they press a concept, the map opens on it; coming back restores release, Since and scroll.
6. When the evidence is missing, Atlas says so and guesses nothing: no recorded concept names a
   changed file, `concepts.none`; no ontology folder, no strip; under half the titles typed, no
   kinds bar.
7. When a tag or the branch moves during a read, Atlas shows `changeBriefing.stale` with Refresh
   and keeps the selection by tag name.
8. When they press a change and then Read commit, Originals opens it for the span (Commits and
   Files, compared between the two releases); Back to summary returns to the same release and row.
9. When they press By date, the period, dates and selection they left are back.

## States

"No Git" in a web cell reads: Out of scope, a browser cannot run Git; the existing
`gitBriefing.webBody` card shows with Get the app, and no By release control is drawn.

| State | Web | macOS app |
|---|---|---|
| No repository chosen | no Git | the existing entry with Choose Git repository; By release appears once a repository is read |
| Empty: no tags | no Git | `empty.title` and `empty.body` on the shared empty stage; `empty.readAgain` |
| Loading, and first run | no Git | the list takes its width at once and `reading` shows only after 150 ms; then rows show name and date, counts and bars arrive newest first with `counting` under the list; selecting and typing work throughout |
| Release selected | no Git | heading and Since stay while the waiting mark is centred in the pane; then the digest and the `concepts.title` strip; press a row, a concept or a change |
| Unreleased holds nothing; one tag | no Git | its row shows 0, the pane says `nothingUnreleased` and the newest release is selected on arrival; with one tag Since offers only `since.firstCommit` |
| No concept touched; no ontology folder | no Git | `concepts.none`; the strip is not drawn |
| Tag off the branch | no Git | its row beside the line with `mark.offBranch`; the pane leads with `offBranch` |
| Partial | no Git | over 2,000 changes: `partial.size`; beyond the counted depth: rows without counts and `partial.depth`; shallow clone: `partial.shallow`; unreadable names: `partial.names` |
| Error | no Git | `changeBriefing.readError` with Try again; `changeBriefing.sourceUnavailable` with Choose Git repository; `changeBriefing.stale` with Refresh; release and Since are kept |
| Find matches nothing | no Git | `find.none`; the typed text stays in the field |
| Pane under 640 px beside the list | no Git | the list becomes one `choose` Select above the pane |
| Windows | no Git | where Changes reads there today; unknown for tags until criterion 4 runs on Windows CI |
| Offline | the same card | the same as online: nothing is fetched |
| Largest measured: 5,000 tags, 30,000 commits | no Git | names in 0.13 s, counts in 0.22 s; 40 rows drawn, `more` draws the next 40 |

## Layout, shape and motion

The list is 320 px beside the pane while the pane keeps 640 px, measured on the slot, not the
window. It is drawn as the branch: one vertical line with a mark per release, rows of one height.

| What | Shape | Its words |
|---|---|---|
| Release | a filled disc on the line, in three sizes by which number changed (major, minor, patch; a name without a version takes the smallest) | tag names in the mono face, date |
| Pre-release | a ring | `mark.preRelease` |
| Unreleased | the line's open, dashed top end, no disc | `unreleased` |
| Tag off the branch | a disc beside the line on a short stub | `mark.offBranch` |
| How much a release holds | a bar, its length the square root of the count against the largest, split into kinds as group bars are (`docs/features/change-briefing.md:61-64`) | the count |
| The span being read | the line thickened from the start mark to the selected mark | the Since value |

Colour is never the only channel: fill against ring, on against beside the line, dashed against
solid, thickness, and a word on every mark. The accent marks the selected row only. The pane, top
to bottom: tag names and date, Since, the headline with kinds, the timeline over the span's days,
the `concepts.title` strip (name and change count per chip, most first, twelve then
`concepts.more`, each opening the map), Worth a look, the groups. "What was read" gains
`basis.tags`, `basis.range` and `basis.concepts`.

| What moves | Why | Clock | Reduced motion |
|---|---|---|---|
| The span mark sliding or stretching | which changes are in view | `--motion-settle` on `transform`; a new target continues from where the mark is | placed at once |
| Counts and bars arriving | the read is progressing | each bar grows from zero once over `--motion-settle`, newest first | drawn at once |
| The pane changing release | new content in the same place | cross-fade over `--motion-fast`; numbers do not count up | swapped at once |

Nothing loops, and at rest nothing is drawn or read.

## Read contract and safety

Two reads join `src-tauri/src/git/briefing.rs` and `src/shared/lib/git/tauri-change-briefing.ts`,
each in the project-bound and the picked form the existing commands have.

- **The release list** takes what `git_change_briefing` takes without dates and returns each
  release's names, tagged commit, date and position on the branch, its count and kinds once
  counted, a snapshot and the partial reasons. **A span** takes that snapshot and two commit
  hashes the list issued and returns the `ChangeBriefing` shape, so the digest, Originals and
  patches work unchanged.
- **Root and names.** Rust resolves the root from the recorded binding or the picker grant, never
  from a path the page sends. A tag name is display text: it never returns to Git as an argument,
  is cut at 256 characters, loses control characters, and is not listed when it is not UTF-8.
- **Hardening as today** (`src-tauri/src/git/briefing.rs:125-136`): no hooks, lazy fetch,
  protocol, replace objects or external diff; no fetch, no write, no ref change; nothing stored.
- **Bounds**: 10,000 tags; names and dates in one read; counts by a newest-first walk of up to
  100,000 first-parent changes in steps of 20,000 or 8 MiB, each returned before the next starts;
  a span keeps the 2,000-change, 8 MiB and 20,000-path limits.

## Copy

The words are in `messages/{en,ko,ja,zh}/releases.json`, written with this spec. The
`changeBriefing`, `changeDigest` and `gitBriefing` keys named above are unchanged.

| Key | Where it appears | English |
|---|---|---|
| `releases.byDate` / `.byRelease` / `.grouping` | Period bar control and its label | By date / By release / Read changes by date or by release |
| `.list` / `.choose` / `.unreleased` | List name, narrow Select, first row | Releases / Release / Unreleased |
| `.row.count` / `.row.name` / `.row.uncounted` | Row, and its spoken name | {count} changes / {release}, {date}: {count} changes / {release}, {date}: not counted yet |
| `.mark.preRelease` / `.mark.offBranch` | Beside a mark | Pre-release / Not on {branch} |
| `.find.label` / `.find.none` | Above the list | Find a release / No release name contains {query}. |
| `.prefix.label` / `.prefix.all` | Chooser, with two or more sequences | Tags starting with / All tags |
| `.since.label` / `.since.firstCommit` / `.since.option` | Pane head | Since / The first commit / {release} · {date} |
| `.more` / `.reading` / `.counting` | List | Show {count} more / Reading the tags of this repository… / Counting the changes in older releases… |
| `.concepts.title` / `.concepts.chip` / `.concepts.more` | Pane strip | Recorded concepts whose files changed / {concept}: {count} changes / Show {count} more concepts |
| `.concepts.none` | Pane strip | No recorded concept names a file that changed in this release. |
| `.nothingUnreleased` | Pane | Nothing was merged into {branch} after {release}. |
| `.empty.title` / `.empty.readAgain` | Empty stage | This repository has no tags / Read again |
| `.empty.body` | Empty stage | Atlas lists one release for each Git tag in the copy of this repository on this computer, and this copy has none. If the tags are on the remote, run git fetch in the repository, then press Read again. |
| `.partial.size` | Pane | Only the newest {count} changes of this release were read. Choose a later release under Since to read a shorter span in full. |
| `.partial.depth` | Under the list | Releases older than the newest {count} changes on {branch} are listed without counts. Select one and Atlas counts it. |
| `.partial.shallow` | Under the list | This copy of the repository is a shallow clone that holds only part of its history, so older releases are missing or incomplete. Fetch the full history in the repository, then press Read again. |
| `.partial.names` | Under the list | {count} tags are not listed, because their names are not text Atlas can show. |
| `.offBranch` | Pane | This tag is not on {branch}. Its changes are counted back to the nearest earlier tag in its own history. |
| `.basis.tags` | What was read | Tags are read from the copy of this repository on this computer. Atlas does not fetch, so a tag that exists only on the remote is not listed. |
| `.basis.range` | What was read | A release holds the changes merged into {branch} after the previous tag whose name starts the same way, up to its own tag. A release that is not a pre-release also counts the changes of its own pre-releases. |
| `.basis.concepts` | What was read | Concepts are matched by the code paths their documents name today, not by how the documents stood when the release was tagged. |

## Edge cases

- **Zero, one, most**: no tags is the empty stage; one tag is two rows; 72 here; 5,000 generated.
  This repository's first tag holds 4,301 changes, so `partial.size` shows on real data.
- **First run and offline**: nothing is stored and nothing is fetched, so every read is the same.
- **Hangul**: a tag named in Hangul is listed as written; Find compares in one Unicode form and
  filters while a syllable is still being composed without clearing the field.
- **Moved, renamed, unreadable**: a moved code folder is `changeBriefing.sourceUnavailable`; a tag
  deleted or renamed between reads moves the selection to the newest release.
- **Two edits at once**: a tag made in a terminal while the list is open appears on the next read;
  an answer for a release no longer selected is dropped.
- **Names and order**: a moving tag such as `latest` is one more name on the release it points
  at; a tag on a tree or a file is not a release and is not listed; position decides the order,
  so a tag placed late on an old commit shows dates out of order.
- **Monorepo**: with two or more sequences `prefix.label` appears; `prefix.all` interleaves them.

## Out of scope

- **Creating, moving, deleting or pushing a tag, and publishing a release**: they write to a code
  folder Atlas may only read (`.claude/rules/surfaces.md:42`) or leave the machine. Later 7.
- **Fetching tags**: Changes makes no network request; the person runs `git fetch`.
- **Files and concepts on every row** (Later 1): they need every release's paths, 19 MB here
  against the 8 MiB bound, so rows carry name, date, count and kinds.
- **Drafting notes** (Later 3), **an MCP tool** (Later 2), **the author's own notes** (Later 5),
  **every connected repository** (Later 6).
- **One package's files in a monorepo**: Atlas does not know which folder a tag prefix owns.
- **Concepts as they stood at the tag**: the anchors are today's.
- **Pull requests in Originals for a release**: that inventory selects by update time in dates
  (`docs/features/change-briefing.md:171`).

Build: the two reads and their tests, a release model beside `change-digest.ts`, the list and
strip under `src/views/change-briefing/ui/`, `docs/features/change-briefing.md`,
`docs/FEATURES.md:199`, then `/ontology-sync`. Not a one-way change by `AGENTS.md:63`: no route,
no public contract, nothing sent, nothing an agent writes.

## Acceptance criteria

1. **The capture, first.** Given this repository and two more the owner names, when the probe
   runs before any screen is drawn, then the pull request states per repository the tags, their
   sequences, tags off the branch, the largest release and how many of the newest 12 releases
   touch a recorded concept, with the owner's line on where he last looked for a release. Under a
   third touching one, the strip still ships and Later 4 moves ahead of Later 2. Checked: the
   probe's output in the pull request.
2. **The list follows the rules.** Given a fixture with lightweight and annotated tags, two tags
   on one commit, a beta before its final, `web@` and `api@` sequences, a tag off the branch and
   a name without a version, then order, merged names, marks and starts match "What a release
   is", and every count equals `git rev-list --count --first-parent` for its span. Checked:
   `src-tauri/src/git/releases/tests.rs`, `src/views/change-briefing/model/release-list.test.ts`.
3. **Concepts are named or their absence is.** Given a vault where one capability's `path:` names
   a file changed between two tags, then the strip names that concept with its change count and
   opens the map on it; a release touching none shows `concepts.none`; a repository picked alone
   draws no strip. Checked: `tests/e2e/changes-releases.spec.ts`.
4. **A read cannot be steered and changes nothing.** Given tags named `--output=x` and `-h`, a
   name of 800 characters, one with a newline and one that is not UTF-8, then none reaches Git as
   an argument, a span for a hash the list did not issue is refused, and refs and `git status`
   are identical before and after. Checked: `src-tauri/src/git/releases/tests.rs`.
5. **It stays usable at 5,000 tags.** Given the generated repository, then names are on screen
   before any count, a release can be selected while counts fill, at most 40 rows are drawn until
   `more`, and 60 idle seconds make no read and no DOM change. Checked:
   `tests/e2e/changes-releases.spec.ts`.
6. **Shape and motion say it, and the web says why.** Given the static export in headless
   Chromium with GPU compositing, when the selection and Since change, then no frame interval is
   above 50 ms (`expectSmoothMotion`) and reduced motion places the mark at once; in a greyscale
   capture release, pre-release, Unreleased and off-branch rows still differ; on the web no By
   release control is drawn. Checked: `tests/e2e/changes-releases-motion.spec.ts`, `pnpm ui:look`
   at 1040, 1512 and 1920, `tests/e2e/web-surface-smoke.spec.ts`.
7. **The walk, which is the recovery proof.** On the owner's Mac, in a rebuilt installed app on
   this repository: v2.4.0 shows 58 changes and 142 with Since v2.2.0 (Git, 2026-11-27), and he
   answers without leaving Atlas what is unreleased now, which concepts changed between v2.3.0
   and v2.5.0, and what one release he names held. For one working week he notes each visit to a
   hosted releases page, `git tag` or `git log a..b` and why: no note says "to see what a release
   held". Checked: the recording and the notes in the pull request.

## Risks

1. **The strip is empty on most releases, so this is a title list a hosted page already gives.**
   Measured: 9 of the last 12 patch releases. Design: the view stands on Unreleased, kinds and
   groups without concepts, `concepts.none` says it plainly, and Since widens to spans where
   concepts appear (7 from v2.6.0 to v2.7.0). Probe: criterion 1.
2. **The list is not the releases he knows**: tags made by CI and never fetched, or on release
   branches. Design: `basis.tags` and the empty stage name the fetch; tags off the branch are
   listed and marked. Probe: in criterion 7 he compares the list with the hosted page once.
3. **He meant managing as acting, and a read-only list is half.** Design: Unreleased first is the
   reading half of cutting a release; Later 3 and 7 name the rest. Probe: criterion 7's notes; if
   he opens By release only before tagging, Later 3 is next.

## Later

1. The release each change went out in (By date) and the releases that changed one concept (its panel). Next when the notes say "which version has this".
2. An MCP read tool for releases and their changed concepts. A public contract: a decision record, `mcp/README.md`, `docs/ontology/capabilities/mcp-tool-server.md`, the vault README and the tool inventory (`.claude/rules/git.md:33`), and a server that reads tags of the code folder, not only the vault. Next when criterion 1 finds a third of releases touching a concept.
3. Release notes as Markdown: first a copy of the digest built without a model, then an agent's draft from titles and concept names, never diff hunks, which needs a decision on what an agent may write. Next by risk 3.
4. Wider anchors (cited lines, folders) so more changes reach a concept. Next by criterion 1.
5. The author's notes beside the measured digest: tag messages and `CHANGELOG.md` sections. Next when a walk shows him opening the changelog file.
6. Every connected repository in one list, and a route of its own if By release outgrows Changes. Next when he asks for a second repository beside the first.
7. Creating a tag, then pushing it. A tag writes to the code folder, so the read-only source grant needs a decision; a push leaves the machine, so it needs an explicit action, a statement of what is sent and a local record. Next only when the owner asks after using slices 1 and 3.
8. One package's files for a monorepo sequence. Next when a monorepo owner walks the view.

## Owner question

None. The four questions of the first draft (one repository or all, read-only first, how
pre-releases count, the Korean word) are decided under "Problem and alternatives". Each reverses
by a Later line or a one-word catalogue change; nothing here spends money, publishes or sends.

## Revisions

- 2026-11-27: first draft.
- 2026-11-27: the owner delegated the open questions to the lead, who decided them: one
  repository, read-only first, pre-releases as their own rows counted into their final release,
  and the Korean word as `README.ko.md` spells it. The Owner question is now None.
