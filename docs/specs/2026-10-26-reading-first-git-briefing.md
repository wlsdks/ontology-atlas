---
title: Read a Git and PR briefing before its controls
doc_type: spec
status: current
area: git
date: 2026-10-26
decisions: [e33872d5-45ee-4545-ba0d-e91635ebc0b5]
---

# Read a Git and PR briefing before its controls

## Person and moment

The owner delegates frequent source changes to agents and opens the installed app to understand a period's work without maintaining an ontology first.
After successive control-level adjustments, they reported that the UI was effectively unchanged, had too much text and too many disclosure chevrons, and asked for reconstruction.
They delegated the structural choice to the lead, who selected direction B: a reading-first briefing.
The current fullscreen 2560 × 1440 baseline has three small equal cards surrounded by repeated metadata, warnings, actions and disclosures.
Evidence: `/tmp/atlas-git-pr-build/196-reading-redesign-before-app.png`, its `.ax.txt`, and `reading-redesign-before-frame.json` in the same directory.
The lost ability is to start reading the period, inspect an original, and return without navigating a control-heavy page.

## Today

- The 2026-10-22 native result contains one commit message, two saved PR descriptions and three themes; it says the explanation is partial and all planned parts finished. Originals and code sit below the report (`194-real-day-result.ax.txt`, `196-reading-redesign-before-app.png`, in the capture directory above).
- The in-flight capture displays zero records sent and a past-tense partial-explanation warning before a result (`191-real-day-generating.ax.txt`). This mixes request progress with final explanation coverage.
- The inspected PR original includes a `Test plan` heading, while the resulting themes contain no checks or limits (`195-real-day-source-check.ax.txt`, `194-real-day-result.ax.txt`). This redesign does not establish or repair explanation quality.
- Explicit public-PR reading and preview-before-model behavior are governed by [b1a09b49](../records/decisions/2026-10-25-git-pr-source-first-briefing-b1a09b49-2a38-4d3a-b913-c59186a58761.md). Session Stop/Continue and separate processing/overview coverage are governed by [6b3b0cb5](../records/decisions/2026-10-26-git-pr-period-coverage-6b3b0cb5-a44f-4f5e-a240-6894c5a5ff2a.md).
- The fully read `capabilities/vault-git-history` excludes the product repository's history. Changes remains a separate source-reading job; no vault meaning is accepted here. Owner comprehension after reconstruction and performance on larger histories remain unknown.

## Problem and alternatives

Rank by returned value: (1) make the period's content the primary reading surface, (2) make originals and code immediately reachable, (3) make configuration and detailed accounting inspectable without repeating them around every result.
The cause is competing page regions and cumulative disclosures; shortening individual sentences alone has already failed the owner's task.
Product direction prioritizes inspectable explanations, uncertainty and human judgment (`docs/PRODUCT-DIRECTION.md:24`).

| Option | Value and usability | Cost, feasibility and local-first fit | Decision |
|---|---|---|---|
| A: keep the page; shorten labels and replace arrows | Small visual change; retains the same reading burden | Lowest cost; unchanged local behavior | Reject: the owner rejected this level of change |
| B: exclusive Summary / Sources / Code with a report column | One reading job at a time; originals available before generation | Moderate navigation/focus work using existing controls and Dialog | Choose |
| C: chronological activity feed | Familiar sequence; long periods still require reconstructing many items | More ordering/presentation work; unchanged source limits | Defer: does not lead with the period's explanation |

This supersedes [390e91c6](../records/decisions/2026-10-25-briefing-area-first-overview-390e91c6-2985-4a1c-ac5e-2e50b1e81ebe.md) only as the first-attention choice: its area overview remains inside Code.
Retain [7b6e7bc7](../records/decisions/2026-10-25-source-change-briefing-7b6e7bc7-9091-498f-b3c1-cc192cccae8f.md) and b1a09b49's route, local source authority, calendar and inspectable evidence boundaries.
Existing users lose simultaneous report/source/code panels and expanded inline control groups; named modes, retained selections and reversible dialogs restore each ability.
Dissent: frequent comparison gains a mode switch. Reopen if a native walkthrough loses the exact reading position or requires reconstructing the selected source.
The first slice changes presentation and navigation, preserving source selection, validation, request, storage and model contracts.

## Flow

1. When the person opens Changes, Atlas keeps repository and calendar controls in a compact top toolbar. On a wide desktop, title, repository and period occupy one band; narrow windows wrap in reading order. The exact applied range appears once. Settings stays available without a usable repository.
2. When the person selects a repository/period, Atlas reads the same local history and eligible saved PR copies. Summary, Sources and Code are visible, mutually exclusive modes. Before generation, Summary offers one short invitation, current source counts and direct access to Sources. Switching modes sends no HTTP or model request.
3. When no eligible PR description is available, Atlas offers the existing explicit PR read first, with commit-only explanation as the named alternative. When PR descriptions are ready, creating the explanation is primary. Saved copies retain visible unchecked freshness. A missing model offers model choice while originals/code remain usable.
4. When the person starts an explanation, Atlas shows a transfer preview led by commit-message/PR counts and the model/address. The initial view states request totals, excluded content, session lifetime and any additional overview transfer. Request details exposes exact bytes and sequential-part mechanics; Review text to send exposes unchanged originals. These two inspections are exclusive and reset for a new preview. Unsendable originals remain visible. The existing start action is still required. During work it shows current stage, completed parts and Stop. It does not call an active request unsent, imply full delivery, or present a final partial-summary warning before any accepted explanation exists.
5. When a supported explanation becomes available, Atlas presents one dominant reading column: thematic sections, concise change text, optional reason, recorded limits and author checks. It uses the existing short reason label, not a repeated question heading. It does not recreate three equal boxed cards or empty headings for missing fields.
6. When the person follows a citation, Atlas enters Sources at that exact passage, retaining source version and origin. Back to summary restores the originating claim and scroll position. A source opened from the list returns to the exact list row. Mode changes retain each mode's last position; initial Sources entry opens its list, and an original reader always offers Source list.
7. When the model is wrong, evidence is missing, work stops or an input changes, Atlas keeps the appropriate compact partial/stale/stopped/failed state visible beside the modes, with its recovery action. Validated parts, originals and attribution remain available. Completion never implies full coverage or verified behavior.
8. When the person opens Coverage, Atlas shows collected sources, request progress and overview evidence in separate, expanded sections of the shared Dialog. Settings uses a separate shared Dialog for model, PR read/refresh details and saved-copy management. Closing restores its opener. Existing Code navigation/comparison remains inside Code only.

The primary briefing has no chevron disclosures. Calendar previous/next buttons and native selections retain their navigation purposes.
Use one compact status region rather than repeated paragraphs; concrete failures may add the explanation required to recover. Saved-copy provenance and accepted-result partial/stale state cannot be hidden in a dialog.
Coverage retains exact collected/sent/cited/unexplained/uncertain counts and overview omissions. Active, stopped and final states use existing facts without new transport semantics.
Coverage contains the existing completed-part selector and overview passage selection. Selecting a part closes it, opens Summary and focuses that part. Use ordinary sections and Select, without nested disclosure chains.
Theme evidence may share one row and deduplicate identical passage targets. Distinct passages from the same source stay separately reachable, with claim association and source version preserved. Adjacency must not imply support for every claim.
Show author checks as compact labelled exact-source entries; their verbatim text stays in Sources, avoiding repeated long blocks in the report. Keep recorded limits visible when present. Consolidate missing-field information once per report without asserting that the original lacks such a record. No parser, prompt, inference or citation-validation change belongs here.
Only the selected mode enters the visual and accessibility reading order. Opening an original is deliberate; background completion never steals its focus or reading position.
Settings, Coverage and previews use existing Dialog focus/Escape behavior; no new overlay primitive, persisted preference or automatic request is introduced.

## States

| State | Web | macOS app |
|---|---|---|
| Browser boundary | `webTitle`, `webBody`; existing get-app entry | Out of scope — this is the browser boundary |
| No repository / first run | `webBody`; existing get-app entry | `sourcePrompt`; `chooseRepository`, or `briefingSettings` for saved copies |
| Reading history / saved copies | `webBody`; existing get-app entry | `loading` / `prSavedLoading`; dates kept, wait for local read |
| Unavailable folder / no history / read error | `webBody`; existing get-app entry | `sourceUnavailable` / `noHistory` / `readError`; choose again or retry, dates kept |
| Empty period | `webBody`; existing get-app entry | `empty`; change dates; Settings remains available |
| Local records, no PR descriptions | `webBody`; existing get-app entry | `summaryEmptyTitle`, `summaryEmptyBody`; `sourcesMode`, `readPrs` or `analyseCommits` |
| Saved PR originals reopened | `webBody`; existing get-app entry | `savedPrStatus`; Sources or `analyse`, with explicit `prRefresh` available |
| Missing model | `webBody`; existing get-app entry | `summaryModelMissing`; `chooseModel` or `sourcesMode` / `codeMode` |
| Source/model preview | `webBody`; existing get-app entry | `periodPlanTitle`, `previewSourceCount`, model/address and request scope; optional original/details inspection, close or `periodStart` |
| Active reading / overview | `webBody`; existing get-app entry | `periodProgress` / `periodSynthesizing`, `stop`; read accepted parts or originals |
| Stopping / stopped | `webBody`; existing get-app entry | `periodStopping`, then `summaryStopped`; `periodContinue`; exact progress in Coverage |
| Part / overview failure | `webBody`; existing get-app entry | `summaryFailed`, `periodPartFailed` / `periodOverviewFailed`; retry stage or read completed parts |
| Rejected / unusable response | `webBody`; existing get-app entry | Existing specific error / `periodNoOverview`; Sources or retry; `rejectedResponse` in Coverage when available |
| Accepted explanation | `webBody`; existing get-app entry | `overviewReady`, `claimsNote`; report, citations or `scopeDetails` |
| Partial accepted explanation | `webBody`; existing get-app entry | `summaryPartial`; `scopeDetails` or Sources; recoverable request action stays visible |
| Stale prior result | `webBody`; existing get-app entry | `summaryStale`; prior report and `periodNewPlan`; `periodStale` details in Coverage |
| Sources list / original | `webBody`; existing get-app entry | `sourceListTitle`, source versions; read a row, then `backSources` or `backSummary`; `sourceList` always reaches the list |
| Code reading | `webBody`; existing get-app entry | `codeMode`; existing area/file/comparison selection and return controls; other panels absent |
| Coverage open | `webBody`; existing get-app entry | `scopeTitle`, section headings; inspect counts/parts, `closeScope` |
| Settings open | `webBody`; existing get-app entry | `settingsTitle`, `settingsModel`, `settingsPrs`, existing saved-copy controls; `closeSettings` |
| PR unavailable / partial / rate limited | `webBody`; existing get-app entry | `prUnavailable` / `prPartial` / `prRateLimited` and retry time; local reading continues, retry explicit |
| Largest measured source period | `webBody`; existing get-app entry | Sources/Coverage account for recorded 28-commit/39-PR baseline; bounded lists and part selection remain usable |

Keys above use the `gitBriefing` namespace. Web neither fabricates history nor gains Git controls.
Initial/active runs show `summaryNotStarted` or current progress in Coverage. Final partial-summary state requires accepted output; local/PR collection gaps stay independently visible.

## Copy

Exact EN/KO strings are added to `messages/en/gitBriefing.json` and `messages/ko/gitBriefing.json`; this table lists English.
Existing permission, transfer, specific failure, calendar and storage strings remain at their decision point. No old key is deleted.

| Key | Where it appears | English |
|---|---|---|
| `sourceInventory` | Concise source count beside the report title | Commits {commits} · PRs {prs} |
| `rebuildSummary` | Existing summary action | Rebuild summary |
| `analyse` | Initial summary action after PR reading | Create summary |
| `analyseCommits` | Explicit commit-only alternative | Summarize commit messages only |
| `readingModes` | Accessible mode group label | Reading view |
| `summaryMode` | Mode control | Summary |
| `sourcesMode` | Mode control | Sources |
| `codeMode` | Mode control | Code |
| `summaryEmptyTitle` | Summary before generation | Read this period |
| `summaryEmptyBody` | Summary before generation | Read the originals, or create a summary. |
| `summaryModelMissing` | Summary without a local model | Choose a local model to create a summary. You can read the originals now. |
| `briefingSettings` | Toolbar button | Settings |
| `settingsTitle` | Settings dialog title | Briefing settings |
| `closeSettings` | Settings close action | Close settings |
| `settingsModel` | Settings section | Summary model |
| `settingsPrs` | Settings section | GitHub PRs |
| `scopeDetails` | Status-region button | Coverage |
| `scopeTitle` | Coverage dialog title | Sources and coverage |
| `closeScope` | Coverage close action | Close coverage |
| `collectionHeading` | Coverage section | Collected sources |
| `processingHeading` | Coverage section | Summary progress |
| `overviewEvidenceHeading` | Coverage section | Overview evidence |
| `summaryNotStarted` | Coverage before a model request | Summary not started |
| `summaryPartial` | Persistent accepted-result status | Partial summary |
| `summaryStale` | Persistent prior-result status | Summary from earlier sources or settings |
| `summaryStopped` | Persistent stopped-run status | Summary stopped |
| `summaryFailed` | Persistent failed-run status | Summary could not finish |
| `savedPrStatus` | Persistent saved-copy provenance | Saved PRs · latest GitHub content unchecked |
| `sourceListTitle` | Sources mode heading | Commit and PR originals |
| `sourceList` | Original reader navigation | Source list |
| `backSummary` | Citation reader return action | Back to summary |
| `previewSourceCount` | Preview scope | {commits, plural, one {# commit message} other {# commit messages}} · {prs, plural, one {# PR description} other {# PR descriptions}} |
| `previewModel` | Preview model label | Model |
| `previewDestination` | Preview destination label | Destination |
| `previewSourceScope` | Visible transfer scope | Source IDs and dates are included. Code and ontology documents are excluded. |
| `previewSingleRequest` | Zero/single-part workload | Model requests: {count} |
| `previewMultipleRequests` | Multipart workload ceiling | Up to {count} model requests |
| `previewOverview` | Visible additional transfer | Reads in parts, then sends up to {bytes} bytes of selected originals for the overview. |
| `previewDetails` | Exact-byte and part inspection | Request details |

## Edge cases

- Empty/single-source periods invent no report or source rows; one fitting part keeps the existing no-extra-overview behavior. The actual one-commit/two-PR/three-theme day checks the visible reconstruction.
- The recorded largest period is 28 commits plus 39 PRs, from the period-coverage spec's native baseline. Remeasure its navigation; do not claim broader semantic or runtime proof.
- First run/missing model: Sources and Code do not wait for generation, configuration or ontology. Saved-copy management works without a source and with an empty period.
- Hangul names, subjects and long paths wrap without shortening identity; translated controls stay readable. Invalid custom dates retain validation and never apply a new scope.
- A moved/renamed/replaced/unreadable folder keeps permission recovery and stale checks. Concurrent HEAD/PR/model/language changes keep run-identity rules; working-tree edits stay outside committed history.
- Offline local history, eligible saved originals and local model keep current capabilities. GitHub failure neither clears usable originals nor claims freshness.
- Dialogs, modes and background completion preserve reading position/focus. Stop, retry, stale result and failed refresh remain actionable at narrow width and enlarged text.
- A report missing checks despite an original `Test plan` remains adverse evidence. Preserve access and the omission; do not relabel it as verified or broaden extraction heuristics.

## Out of scope

- Source/model/backend/transport/storage/security changes, new providers or automatic HTTP/model requests: the reading redesign retains these boundaries.
- Reclassifying author checks/limits or independently verifying behavior: the observed semantic gap needs a separate measured slice.
- New routes, ontology construction/acceptance, persisted runs, export, notifications or background collection: none restores this reading task.
- Rebuilding Code's internal area/file/comparison controls: preserve that ability inside its exclusive mode.

## Acceptance criteria

1. Given the actual one-commit/two-PR/three-theme day, when the rebuilt app opens fullscreen at 2560 and 1920 widths, then native captures show the compact toolbar, exclusive modes and one report column, without three equal cards, repeated question headings or primary chevron disclosures. Compare with capture 196; the installed walkthrough proves this recovery.
2. Given local history without an explanation, when choosing Sources/Code before generation, then `tests/e2e/projects/git-pr-briefing.spec.ts` and the native walk prove useful original/code reading without ontology/model prerequisites or mode-triggered PR/model requests. Missing-model/empty-period states keep Settings reachable.
3. Given report citations, a long original and a source-list row beyond the first batch, when navigating to the original and back, then focused e2e/native keyboard walks restore the exact opener and position. Every deduplicated citation opens its exact passage/version; background completion leaves the active reader untouched.
4. Given initial, active, stopped, failed, partial and stale runs, when rendered, then focused e2e proves distinct progress/result states, immediate Stop/recovery and preserved valid parts, without premature final-partial warnings or unconfirmed zero-sent claims. Coverage reconciles existing facts without equating requests or citations with complete meaning.
5. Given saved PRs, failed refresh, rate limiting and a missing model, when using Settings, Coverage and preview, then existing behavior tests/native walks prove explicit PR/model actions, disclosed destination/source text, visible unchecked/stale attribution, retained originals and unchanged clear-storage scope. No background request or new grant is created.
6. Given the actual PR `Test plan` and result that omitted checks, when reading the reconstruction, then a native source audit still reaches the original and exposes the explanation gap without a health/verification claim. The redraw changes no author extraction, model prompt, source validation or accepted evidence.
7. Given every state, long Hangul/paths and the recorded 28-commit/39-PR period, when running the routed full surface audit, full responsive matrix, changed journey walk and computer-use loop, then `change-briefing-layout.spec.ts`, the relevant design audit and native captures prove readable controls, focus/Escape restoration and bounded scrolling. Web proof separately retains `webTitle` / `webBody` and its capability boundary.
8. Given implementation and locale integration, when the lead runs `pnpm checks:changed -- --run`, then every recommendation completes and the reviewed app comes from that source. This spec/catalogue change alone establishes no runtime, visual, semantic or owner-comprehension acceptance.

## Risks

1. Compactness hides gaps or makes finished requests look fully explained: keep validity/provenance visible, separate active/final state, and probe the actual adverse result plus stopped/failed/stale runs.
2. Modes or consolidated citations lose position or imply the wrong support: preserve exact passage/version and origin, then walk long-original return/background completion with keyboard and pointer.
3. The reconstruction still resembles the rejected page or shrinks reading into another small card: compare full native 2560/1920 captures against the baseline using single-column/no-primary-disclosure criteria.

## Later

1. Author-recorded checks/limits quality, when a separate audit characterizes the observed `Test plan` omission without broadening unsupported claims.
2. Source/report comparison pane, only if repeated native use shows mode switching interrupts review despite retained position.
3. Further Code-reader simplification, when its own navigation burden remains after exclusive modes restore the main briefing.

## Owner question

None — the owner delegated the structural choice; this direction is reversible presentation work preserving existing authority. Reopen only if native recovery proof fails.
