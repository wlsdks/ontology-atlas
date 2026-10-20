---
title: Harness at a glance
doc_type: spec
status: draft
area: harness
date: 2026-10-20
decisions: []
---

# Harness at a glance

## Person and moment

The owner, a solo developer who runs Claude Code and Codex on this repository daily (first tier).
On 2026-10-20 he walked the installed app's Harness tabs at 1512x949 and said, in Korean: on
Structure, "somehow too complex and dizzying"; on Coverage, "no refined feel either, so on either
of the two pages I don't know what to do"; on Guides, "I can't tell the two sides (left/right)
apart ... overall it looks complex". Uncommitted captures `02-h`, `03-cov`, `04-guides`, `05-arch`
(`.png`) in `/private/tmp/claude-501/-Users-jinan-orca-workspaces-ontology-atlas-main-3/881a25d1-fbae-4d3e-92be-6a4829ef861d/scratchpad/look/`.
The moment: he opens Harness to learn at once where agents are told, blocked and watched, which
domain has a hole, and what to do next. Of three options (two unrecorded) he chose one screen, At
a glance, and approved its sketch. Unobserved: a person learning agents, one who wants none.

## Today

Source read 2026-10-20. `pnpm po:route` (pass brief): `review · door=one-way · risk=meaning ·
reviewers=reviewer · lenses=moment,evidence,boundaries,smallest-slice`.

- **Tabs.** Structure, Coverage, Guides, Architecture (`src/views/architecture/lib/harness-view-state.ts:6`);
  the app arrives on Structure, a browser on Architecture (`:11`, `:50-52`); `?view=sensors` opens
  Coverage (`:14-16`); with no reading only Structure and Architecture show
  (`src/views/architecture/ui/HarnessPage.tsx:149-151`, `:193-200`).
- **Structure** (`02-h`): "fills 12 of the 13 places" (`HarnessPage.tsx:204-211`) from
  `buildHarnessAnatomy` (`model/harness-anatomy.ts:301-346`): always-read 5, path-attached 13,
  skills 11, briefs 7, servers 2, pre-tool hooks 5, deny/ask 23, exclusion files none, `.githooks/`
  6, check scripts 67, discovered tests 1906, workflows 9, and "hooks that watch" 3, every non-pre-tool
  event (`:281`): one each of PostToolUse, SessionStart, UserPromptSubmit (`.claude/settings.json`,
  `.codex/hooks.json`). "Hand to an agent" copies an English report (`HarnessAnatomyView.tsx:232-240`).
- **Coverage** (`03-cov`): cards 0/4, 1/4, 1/4 (`HarnessCoverageView.tsx:534-611`); the vault's 4
  domains (`list_kinds`): Human workbench 2 · None · None, Agent access 4 · 2 · 3, Meaning layer and
  Code evidence 1 · 2 · 2, each with an English description under a Korean name (`:686-688`); detail
  under the row (`:227-317`); a reach strip 74 / 19 / 833 (`:759`); a counting disclosure (`:762-790`).
- **Counting.** Coverage files every wired hook under Gated (`src/entities/agent-files/model/coverage-collect.ts:79-96`),
  Structure only pre-tool ones (`harness-anatomy.ts:73-75`), and the two count a mirrored guard
  differently (`HarnessPage.tsx:314`). Root `AGENTS.md`/`CLAUDE.md`, permissions and exclusion files
  are no coverage declaration (`coverage-collect.ts:45-138`). "Reaches every domain" takes a scoped
  declaration only if it reaches every domain, pathless ones included, so one pathless domain keeps
  every scoped one out (`coverage-matrix.ts:68-69`). `paths-ignore:` is read as a scope (`coverage-scopes.ts:116`).
- **Guides** (`04-guides`): two alike panes headed only by `.claude/agents/design-guardian.md` and
  `.agents/agents/design-guardian.md` (`HarnessGuideDetail.tsx:312-314`, `:341-345`); lines the other
  lacks are brightened (`:356-366`); nothing folds. The Codex trust note is here (`HarnessGuidesView.tsx:366-373`).
- **In-app agent.** Its session runs in the ontology folder (`src/features/acp-session/model/use-acp-session.ts:997`),
  its prompt says "Keep your work inside this folder" and sends it to the vault tools (`:287`,
  `:294`), and the client auto-allows reads only inside the vault (`acp-client.ts:448-484`). A
  reading re-runs only from Failed (`HarnessPage.tsx:366-369`).
- **Links in.** Analysis brief gap lines open `?view=coverage` (`BriefTab.tsx:44-46`), the rest
  `?view=guides` (`:47-48`). No vault node covers this screen. `docs/features/harness.md:132-139`: a
  blank is "never advice"; `:23-26`: `?view=structure` does not redirect.

## Problem and alternatives

Two tabs ask the same three questions, by harness part and by domain, file a hook in different
columns, and offer no next step; "12 of 13" reads as the score `b9dba267` forbids. That is the
cause; the noise is its symptom. Ranked by value against cost: **1. At a glance**, the arrival on
every visit (first); **2. Guides compare**, used only on a pair, needs a line-aligned diff and a
review; **3. Guides list density**, needs its own walk after 2.

| Option | Value | Usability | Feasibility | Local-first | Verdict |
|---|---|---|---|---|---|
| Status quo, four tabs | every fact kept | owner cannot tell what to do (observed) | free | holds | the failure |
| Restyle both tabs | calmer pages | two cuts, two counts, no action remain | medium | holds | treats the symptom |
| Gap list, no table | fastest read | a gap loses where files do exist | small | holds | owner approved the table |
| At a glance | one cut, one count, one action | sketch approved | medium | Atlas sends nothing | chosen |

The hand-off copies the request; the in-app agent lost for now, being told to stay in the
ontology folder, with a card for every read outside it (Later 2 names the probe).

| Place | On At a glance |
|---|---|
| Always-read documents | Every-domain row, Told |
| Path-attached documents | Domain cells by declared path, Told |
| Context hooks (SessionStart, UserPromptSubmit) | Domain cells when the script names a domain path, else every-domain row; Told |
| Pre-tool hooks; `.githooks/` files | Domain cells when the script names a domain path, else every-domain row; Gated |
| Deny and ask rules; exclusion files | Every-domain row, Gated: one entry with file and count; one entry per exclusion file |
| PostToolUse and every other hook event | Domain cells or every-domain row, Watched |
| Check scripts; workflows | Domain cells by named path or `paths:` filter (`paths-ignore:` is no path), else every-domain row; Watched |
| Discovered tests | A count inside a domain's Watched panel, never a cell count |
| Skills, sub-agent briefs, MCP servers | Not shown: called by name, they declare no path and cannot say which domain has a hole; Guides lists every file |
| Agent loop and model | One sentence in the counting hint |

Lost, since none says which domain has a hole (each has a Later trigger): "N of 13"; Structure's
English "Hand to an agent" report (`harness-brief.ts`), replaced by the gap request; per-turn and
deepest-chain bytes (per-file size against its cap stays in Guides, `HarnessGuideDetail.tsx:92-134`);
the allow/ask/deny split; copyable fill addresses; the taxonomy sources; the reach strip; the
diagram/text toggle. The missing-hook-script warning stays.

For the lead's record: it overturns `b9dba267`'s falsifier "an empty cell read as a fault" (a gap
is named, counted and handed over) and keeps "no score"; `docs/features/harness.md:132-139` is
rewritten in the same change; `e35a25fe`'s falsifier figures (12 of 13 places, 120 guides, 87
checks, 112 coverage declarations) are restated, as "12 of 13" leaves and the column rule moves the
count. Dissent: a hand-off invites filling rightly empty cells. Falsifier: the owner deletes an
agent-written gap file as unneeded. Keeps `8a2effcf` (evidence beside the work), `8e69bcb5`,
`3a63ada4`, `e26f2d5b`; reverses `harness.md:23-26`. Atlas writes nothing.

## Flow

1. When the owner opens Harness in the app with one connected source, Atlas reads its harness
   files and opens At a glance: gap line, the copy action and "Read it again" above a table of
   the vault's domains (display names) by Told, Gated, Watched; each cell a count or an amber dot
   with "None"; the last row "Reaches every domain" holds the files that declare no path.
2. When he presses a cell, Atlas opens its panel beside the table (after the row below 1280px): the
   domain's description, then each file making the cell by kind, with path, declaring text and the
   tools that read it, a `.codex` hook marked as running only once a person trusts it; a gap shows
   the empty sentence, the domain's recorded paths, the every-domain count and, for Watched,
   discovered tests. Close or Escape closes it and returns focus.
3. When he presses "Copy the request for your agent", Atlas copies the request (one sentence, the
   folder, each gap as slug, column and recorded paths, the rules) and says to paste it into the
   coding agent he runs in this repository; "See the request" shows the same text. Nothing leaves.
4. When his agent works, it shows each file and wiring edit and waits for his yes, as the request
   asks. When it is wrong (a `paths:` that misses the domain, a block nobody needs), he declines; if
   he allowed it, after "Read it again" the cell still reads None beside the domain's recorded paths.
5. When he presses "Read it again", Atlas reads the source again; the open panel closes and the gap
   line and cells update.
6. When the clipboard refuses, Atlas says so and points to "See the request" to copy by hand.
7. When a domain records no path, its row reads "No recorded path" and is no gap; when the reading
   fails, Atlas says why with "Read it again", never zeros. `?view=overview` is the address;
   `?view=structure`, `?view=coverage` and `?view=sensors` are rewritten to it.

## States

| State | Web | macOS app |
|---|---|---|
| Browser | Tabs At a glance · Architecture, arrival Architecture; `harness.browserOnly`, `harness.browserOnlyBody`; next: `harness.browserAction` → `/download/` | Out of scope — the app always has the bridge |
| No source connected | Out of scope — a browser never reads; it stays on Browser | Tabs At a glance · Architecture; example, `harness.noSource`, `harness.noSourceBody`; next: `harness.connectSourceAction` |
| Reading | Out of scope — no reading in a browser | Nothing for 1s, then `harness.loadingTitle` with stages; next: wait |
| Failed | Out of scope — no reading in a browser | `harness.failed` and its reason with the path; next: `harness.retry` |
| No domains, or none with a path | Out of scope — no reading in a browser | `harness.coverageNoAreasTitle`, `harness.coverageNoAreasBody`; next: the Guides tab |
| No harness files | Out of scope — no reading in a browser | Every cell a gap, gap line, `harness.emptyBody`; next: `harness.overviewHandoff` |
| Partial | Out of scope — no reading in a browser | `harness.overviewGapCount`, `harness.overviewGapMeaning`, `harness.overviewCellHint`; next: a cell, `harness.overviewHandoff` with `harness.overviewHandoffHint`, `harness.retry` |
| All filled | Out of scope — no reading in a browser | `harness.overviewNoGaps`, no copy action; next: a cell or `harness.retry` |
| Domain without path | Out of scope — no reading in a browser | Row `harness.overviewNoPath`, panel `harness.overviewNoPathBody`; next: open the domain on the map |
| Cell open | Out of scope — no reading in a browser | `harness.overviewPanelTitle`, files (`.codex` hooks with `harness.hookApprovalGate`) or `harness.coverageEmpty{Told,Gated,Watched}` with `harness.overviewEverywhereApplies`; next: `harness.coverageCloseNames` or Escape |
| Request copied | Out of scope — no reading in a browser | `harness.overviewHandoffCopied`; next: paste into his agent, or `harness.overviewRequestShow` |
| Copy refused | Out of scope — no reading in a browser | `harness.overviewHandoffCopyFailed`, the action stays; next: `harness.overviewRequestShow` |
| Missing hook script | Out of scope — no reading in a browser | Amber `harness.anatomySilentGuards` under the table; next: Guides |
| Largest measured vault (8 domains) | Out of scope — no reading in a browser | Rows scroll in the work area under fixed column heads; the gap line stays above |

## Copy

All keys sit under `harness`; ko, ja and zh strings go to the lead with this spec and land in
`messages/{ko,ja,zh}/harness.json` with the build (`docs/` stays English). Other keys keep their
words; `hookApprovalGate` and its hint are reused as the trust mark. No message contains `<` or `>`,
which the message parser reads as a tag.

| Key | Where it appears | English |
|---|---|---|
| `views.overview` | Tab | At a glance |
| `overviewGapCount` | Gap line, title size | {count, plural, one {# gap} other {# gaps}} |
| `overviewGapMeaning` | Under it | A gap is a cell where no file names that domain's paths. What reaches every domain still applies there. |
| `overviewNoGaps` | Gap line when none | No gaps: each of the {domains, plural, one {# domain} other {# domains}} with a recorded path has a file in all three columns. |
| `overviewHandoff` | Action | Copy the request for your agent |
| `overviewHandoffHint` | Under the action | Copies a request to judge and fill these gaps. Paste it into the coding agent you run in this repository; Atlas sends nothing. |
| `overviewHandoffCopied` | After copying | Copied. Paste it into your coding agent's chat in this repository. |
| `overviewHandoffCopyFailed` | Clipboard refused | Could not copy. Open "See the request" and copy the text by hand. |
| `overviewRequestShow` | Disclosure under the action | See the request |
| `overviewCellHint` | Under the table | Press a cell to open the files that make it beside the table. |
| `overviewNoPath` | Row without a path | No recorded path |
| `overviewNoPathBody` | Its panel | No capability in this domain records an implementation path, so no file can name it. It is not counted as a gap. |
| `overviewPanelTitle` | Panel head | {domain} · {column} |
| `overviewEverywhereApplies` | Gap panel | Also applies here: {count, plural, one {# file} other {# files}} that reach every domain. |
| `overviewPermissions` | Every-domain Gated panel | {count, plural, one {# deny or ask rule} other {# deny or ask rules}} in {config} |
| `overviewLoopNote` | Counting hint | Which model runs, what it reads first and when it stops belong to the agent tool, so files cannot show them. |
| `coverageColumnToldHint` (changed) | Column hint | Guides whose declared path reaches a path the ontology records for this domain: a nested AGENTS.md for its folder, a .claude rule whose paths: match, or a hook that adds context when a session starts or a prompt is sent and whose script names those paths. A file is here because its declared path reaches the domain, never because a tool probably reads it. |
| `coverageColumnGatedHint` (changed) | Column hint | Hook scripts that run just before a tool call, and files under .githooks/, whose text names this domain's paths. The script exists; whether it has ever stopped anything is not in the files. |
| `coverageColumnWatchedHint` (changed) | Column hint | Hooks that run after a tool call or at other events, package.json lint, typecheck and test scripts, and CI jobs whose paths: filter names this domain's paths; paths-ignore is not a path. A check that has never failed cannot tell safe code from a blind check. |
| `overviewRequestGapLine` | One per gap in `{gaps}` | - {slug} · {column}: none · paths: {paths} |
| `overviewRequestEverywhere` | `{everywhere}` | Told {told} · Gated {gated} · Watched {watched} |
| `overviewRequest` | Copied text and "See the request" | Below |

```
Look at the {count, plural, one {# gap} other {# gaps}} Ontology Atlas found in this repository's agent harness and fill only the ones that need it. Before writing any file, show me its path and full text and wait for my yes.
Folder: {folder}
A gap means no harness file declares a path inside that domain. It does not mean nothing runs there: what reaches every domain still applies ({everywhere}).
{gaps}
For each gap, first decide whether this domain needs its own guide, block or check. If not, say why in one line and write nothing. If it does, propose the smallest file that names only that domain's paths: for Told, a .claude/rules/NAME.md with paths: or a FOLDER/AGENTS.md; for Gated, a PreToolUse hook script or a .githooks/ script that filters on those paths; for Watched, a package.json check that takes those paths or a workflow with paths:. A new hook script also needs its wiring entry under hooks in .claude/settings.json or in .codex/hooks.json; show that edit too, and do not change `permissions`. A Codex hook runs only after I trust it in /hooks, so tell me when you add one. A declared path fills the cell only when it contains one of the listed paths or sits inside one; paths-ignore does not count. Ask before putting a copy under .codex/ or .agents/.
```

## Edge cases

- **Zero** domains, or none with a path: No domains; no gap line or action. **One** domain with a
  path: one row; the every-domain row holds only path-less files (`coverage-matrix.ts:69`).
- **A file whose paths reach every domain** fills each of their cells; only a file that declares no
  path, or a glob with no literal folder (`**/*.tsx`), sits in the every-domain row. Promoting it
  instead would leave every cell None after the agent writes a correct file (`src/AGENTS.md` when
  all domains live under `src/`). `.cursorrules` (ignored in agent mode) and `.cursorindexingignore`
  (indexing only) are not counted.
- **Largest measured**: 8 domains (`b9dba267`); here 12 paths in one domain, 67 scripts, 1906
  discovered tests. Panels scroll; the request lists every path. No larger vault measured.
- **First run**, or several connected sources: No source connected (its body says Atlas does not pick).
- **Hangul**: rows use `display_ko`; the panel quotes the domain's description as the vault wrote it
  (English here); the request carries slugs and paths only; a Hangul source path is copied
  verbatim. The screen has no text input.
- **Moved, renamed or unreadable source**: Failed with its reason; "Read it again" recovers once
  the folder is back. **Offline**: reading and copying are local.
- **Two edits at once**: reading while his agent writes shows the disk at that moment; read again
  later. A vault edit that changes domains re-reads by itself (`use-harness-report.ts:116`).
- **Mirrored hooks** in `.claude/hooks/` and `.codex/hooks/` count and list as two files (Later 3).

## Out of scope

- Guides compare and list density, a different moment (Later 1, 5); opening the in-app agent
  (Later 2); reading again by itself after a write (Later 6).
- Removing the Analysis Guidance tab: another spec; its `?tab=harness` targets `?view=overview`.
- Atlas writing harness files (`e35a25fe`); any score, percentage or level (`b9dba267`); reading on
  Windows (`harness.failedUnsupported` unchanged) or dot folders in a browser; the Architecture tab.

## Acceptance criteria

1. Given the app with a reading, when Harness opens, the tabs read At a glance · Guides ·
   Architecture with At a glance selected; `?view=structure`, `?view=coverage` and `?view=sensors`
   are rewritten to `?view=overview` and open it; with no reading the tabs are At a glance ·
   Architecture. `src/views/architecture/lib/harness-view-state.test.ts`, `HarnessPage.test.tsx`.
2. Given four domains, one without a path, and a rule whose `paths:` reaches the other three, the
   rule fills each of their Told cells and not the every-domain row, a root `AGENTS.md` sits in the
   every-domain row, each empty cell shows the amber dot and None, the gap count
   equals those cells, the pathless row reads "No recorded path" uncounted, and `overviewNoGaps`
   counts three domains. New `src/views/architecture/model/harness-overview.test.ts`.
3. Given PreToolUse, PostToolUse, SessionStart and UserPromptSubmit hook groups and a root
   `AGENTS.md`, `candidateScopeDeclarations` files them Gated, Watched, Told, Told and Told; a
   workflow whose only filter is `paths-ignore:` declares no path. New
   `src/entities/agent-files/model/coverage-collect.test.ts`; `coverage-scopes.test.ts`.
4. Given 1512x949, when a cell is pressed, its panel sits right of the table and lists each file
   with declaring text and tools, a `.codex` hook with the trust mark; Escape closes it and focus
   returns to the cell; at 1024px the panel follows the row. `tests/e2e/harness/harness-tab.spec.ts`.
5. Given gaps, pressing the action puts `overviewRequest` on the clipboard: per gap slug, column
   and paths and no display name, the wiring sentence, "do not change `permissions`"; nothing is
   sent; a refused clipboard shows the failure and "See the request" the same text. `HarnessPage.test.tsx`.
6. Recovery, installed-app walk at 1512x949, two runs, each agent answer quoted in the PR. On this
   repository either judgement passes, and a gap judged unneeded stays None with nothing written. On
   a fixture where a gap really needs a rule, he allows the file, reads again, and the cell shows 1.
7. First glance, installed-app walk: without pressing anything the owner names the domain with a
   hole and what the action will do. His words and the capture go in the PR.

## Risks

- **The agent fills cells that should stay empty**, and the owner learns to accept noise. The request
  makes it judge first and allows "write nothing"; walk 6 records each answer; the record keeps the falsifier.
- **A correct-looking file leaves the cell None**: the join needs a declared path that contains or
  sits inside a recorded path (`coverage-scopes.ts:56`), and a glob counts only up to its first
  wildcard. The request states the rule with the paths; the gap panel shows them; walk 6 checks it.
- **His agent writes without showing the file**, for example in an auto-accept mode, so a hook
  lands unseen. The request asks for path, text and a yes first, and forbids `permissions` edits;
  Git shows every change; walk 6 records whether the agent waited.

## Later

1. Guides compare: each pane headed by the tool that reads it ("Read by Claude Code" / "Read by
   Codex") in its own tone, unchanged runs folded to "N same lines"; next once this ships.
2. Open the request in the in-app agent panel; next when an installed-app probe of the exact gap
   request, in the docs/ontology-inside-repo layout on claude-acp and codex-acp, passes: no stop on
   the folder rule, a first proposal after at most one read card, and a card for every write, hook
   wiring included. Widening the scope with a `systemPromptAppendix` needs its own decision record.
3. Count a mirrored hook once in a cell; next when a walk records a mirrored pair read as two guards.
4. Keep the open cell across "Read it again"; next when walk 6 records him reopening the same cell.
5. Guides list: fewer status tags per folder; next if his walk after 1 still says complex.
6. Read again when harness files change on disk; next when walk 6 records a stale table.
7. Reach strip (74 / 19 / 833) as a Guides line; next when a walk records a look for unnamed documents.
8. Skills, briefs, servers, per-turn bytes as a Guides line; next when a walk records a look for them here.
9. Copy one cell's request from its panel; next when he deletes gap lines before pasting.

## Owner question

None. The request asks his agent to show each file and wait for a yes because he chose to hand
the gaps over, not to give up review; dropping that sentence reverses it.
