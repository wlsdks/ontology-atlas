---
title: Explain a period of Git and pull-request work
doc_type: spec
status: current
area: git
date: 2026-10-25
decisions: [b1a09b49-2a38-4d3a-b913-c59186a58761]
---

# Explain a period of Git and pull-request work

## Person and moment

An owner delegates hundreds of daily commits to agents and cannot reconstruct what happened one commit at a time.
They requested daily/weekly/monthly/yearly/custom catch-up inside Atlas, accepted Changes, then found its overview difficult.
Their latest 2026-10-25 steering asks for analysis of commit records and PR descriptions without requiring ontology.
Evidence: owner task and decisions [7b6e7bc7](../records/decisions/2026-10-25-source-change-briefing-7b6e7bc7-9091-498f-b3c1-cc192cccae8f.md),
[390e91c6](../records/decisions/2026-10-25-briefing-area-first-overview-390e91c6-2985-4a1c-ac5e-2e50b1e81ebe.md).
Outcome: explain the work and find reasons to investigate through inspectable sources.

## Today

- Changes requires a vault/project and ranks path activity/current capability matches:
  `src/views/change-briefing/ui/ChangeBriefingPage.tsx:46`, `src/views/change-briefing/ui/BriefingOverview.tsx:30`.
- Native history returns subjects/times/paths, not bodies; limits are 2,000 commits, 8 MiB and 20,000 path records:
  `src-tauri/src/git/briefing.rs:18`, `src-tauri/src/git/briefing.rs:389`. Identity checks and patches exist:
  `src-tauri/src/git/briefing.rs:143`, `src/shared/lib/git/tauri-change-briefing.ts:36`.
- The source picker grants reads without vault writes (`src-tauri/src/source_access.rs:3`); briefing still requires a project binding.
  The full `capabilities/vault-git-history` concept excludes source repository history and remote operations.
- [PR #2925](https://github.com/wlsdks/ontology-atlas/pull/2925) describes map work, checks and a remaining first-frame failure;
  [PR #2934](https://github.com/wlsdks/ontology-atlas/pull/2934) describes release metadata. Mutable author text is not runtime proof.
- Native text-model requests support cancellation/receipts but require `vaultPath` (`src/shared/lib/llm-connection/tauri-llm.ts:59`).
  Lead's `/tmp/atlas-briefing-file-nav/models-live.png` shows saved Ollama `localhost:11434`, `atlas-qwen3.8:27b`, responding on 2026-10-25.
  The first two-PR probe took 226 seconds and failed explanation acceptance: verbose lists, misleading translations,
  fixed failures listed as unresolved, and an unsupported claim about both PRs (`/tmp/atlas-briefing-file-nav/local-probe-answer.txt`).
  A second, constrained local request took 41.1 seconds for two short items and retained the performance failure
  (`/tmp/atlas-briefing-file-nav/local-short-answer.txt`); title-only excerpts still did not establish every clause.
  Connection and bounded synthesis are observed; general usefulness remains unproved. Source-only receipts/collection are new.
- Generic ACP read-only mode is not packet-only isolation (`src/features/acp-session/model/runtime-wiring/runtime-gate.ts:1`).

## Problem and alternatives

Rank: (1) explain recorded changes, reasons and unresolved limits; (2) reach supporting text/code; (3) add optional ontology context.
The first restores the lost ability: organizing paths cannot supply reasons. Author descriptions may be wrong.
The product direction requires evidence and uncertainty, not ontology grouping for every task (`docs/PRODUCT-DIRECTION.md:24`).

| Option | Value/usability | Cost, feasibility, local-first fit | Decision |
|---|---|---|---|
| Keep path/capability overview | Finds code; reader still reconstructs reasons | Lowest cost; local and available | Fails observed explanation need |
| Commit/PR transcript with headings | Exposes author records but requires individual reading | Small collection cost; little inference risk | Retain as evidence |
| Source-linked synthesis with optional PR read | Connects work, reasons and limits | New bounded collection/validation; explicit requests | First slice |

Retain overview-to-focused-evidence and calendar. Replace capability/file-count ranking as the explanation entry;
paths, grouping context and patches remain reachable under Read sources. The former starting view is the user cost.
The old falsifier is active: finding a file has not restored understanding. Lead records the changed priority.
Route: observed/explain/substantial-investment; review/record required; truth/transfer affected, writes/correction unchanged.
Lenses: moment, evidence, boundaries, smallest-slice, spec. Keep `decisions: [b1a09b49-2a38-4d3a-b913-c59186a58761]` for the lead.

## Flow

1. A cold native launch without a vault shows a visible Git and PR briefing entry beside the folder choices.
   It opens Changes directly. The shell permits Changes without a vault; all graph/vault destinations retain their guard.
   The app-owned Agents destination is also reachable without a vault so Models can be configured; its MCP/workspace
   actions keep their existing missing-folder guards. The no-vault rail offers only Changes and Agents, plus home/folder selection.
   Models has a visible return-to-briefing link. Repository, period and dates survive the round trip in session memory.
   When the person enters Changes, Atlas offers a native Git-folder picker without a vault/project requirement.
   An existing granted connection may prefill it, never broaden access. No ontology is created; start at the current week.
2. When they choose day/week/month/year/custom, Atlas retains local timezone, inclusive dates and explicit custom apply.
   Read full commit messages and touched paths from pinned HEAD's first-parent history, using committer dates, not PR dates.
   No local Git fetch, hooks, checkout, commits or writes; existing endpoint/patch qualifications remain.
3. When public GitHub remotes are available and PR lookup has not been attempted, lead with Read GitHub PR descriptions. Keep an explicit commit-message-only explanation alternative and disclose that reasons, author checks and limits may be missing. After reading PRs, promote explanation creation; unavailable or empty PR reads keep the explicitly limited commit-only alternative. Multiple remotes keep the PR action disabled until a repository is selected.
   If a retry fails or returns unavailable after PR descriptions were collected for the same repository and period, retain those versioned descriptions and any explanation using them. Disclose the failed refresh without claiming the retained records were refreshed. A successful empty result still replaces the old set; PR-original retention is now governed by [Reopen previously read PR originals](2026-10-26-reuse-read-pr-originals.md).
   Recognized GitHub rate-limit responses stop remaining network requests and preserve unchecked coverage. Show only normalized rate-limit/reset metadata, never raw response headers or error bodies. Keep previously collected versions on rate-limited refresh. When GitHub provides a future retry time, disable PR reading until then; enable it afterwards without sending automatically. Local sources and explicit commit-only explanation remain usable. Unknown retry times keep a later manual retry available.
   When they choose Read GitHub PR descriptions, the inline destination and outbound identifiers precede the action.
   Read public github.com only through fixed API requests; no new login/token. Multiple candidate remotes require a choice.
   Remote URLs, PR numbers and commit associations identify candidates; source text never supplies a network URL or command.
   Accept only same-repository merged PRs whose locally available merge SHA is introduced between a selected first-parent
   commit and its parent. An older ancestor or number mention is insufficient; unknown association remains unknown.
   Support #2925's wrapper: its merge SHA is the second parent of `1003757fd`. Local evidence never depends on PR availability.
4. When sources are ready, Atlas shows the exact text preview, connected model/address and byte/record counts beside Create explanation.
   Use the existing local Models connection; no API-key setup or Codex-subscription claim. One click sends one text-only request:
   complete included messages, matched PR descriptions, source IDs and coverage metadata.
   Exclude code, ontology, app-added absolute paths, chat history, credentials and tool/MCP definitions.
   Authored source text remains faithful even when its authors mention paths; preview exposes that text. No automatic sends on arrival or changes.
5. When the model answers, Atlas shows a short overview and 1-6 themes: what changed, why, author-reported checks and remaining limits.
   The overview reuses attributed theme claims, never invents an all-PR/whole-period conclusion. Per theme, use a short title,
   one sentence each for what/why, at most two check claims and brief unresolved limits; leave branch/test inventories in originals.
   Group supported work, not file counts or guessed capabilities. Each factual clause cites an exact source passage;
   inferred connections are labelled. Missing reasons/checks/limits stay explicit; adverse evidence appears beside the overview.
   Distinguish fixed failures from still-open limits. Use the interface's existing terms for actions such as returning or expanding.
   Every packet source is cited or listed as unexplained; unexplained sources make the account partial.
   This is proposed interpretation, with no graph acceptance or independent behavior/test verdict.
6. When a citation is selected, Atlas opens the original commit body or fetched PR text inside the focused evidence reader.
   Show commit SHA or PR updatedAt/fetchedAt/digest; PR text may differ from merge time. Related paths open existing code comparisons.
   Back restores theme focus/scroll; previous/next file remains. Current ontology links are optional context after evidence.
7. When the agent is wrong or evidence is missing, Read sources exposes the cited original without writing or accepting anything.
   Unknown IDs, invented quotations, missing attribution/coverage fields, tool-bearing output and malformed answers reject the result.
   Structural/source-link validation cannot prove semantic correctness. Retry is explicit; no automatic repair model call.
8. When stopped or scope/root/HEAD/PR digest changes, Atlas cancels work and rejects late results.
   Preserve inputs and old sources under their original identity; mark old explanations stale and require refresh.
   Never display an old answer as a new repository/period/packet/provider/model/locale result.

Bounds: keep local 2,000-commit/8-MiB/20,000-path limits. PR lookup stops at 40 descriptions, 80 requests or 2 MiB;
show failures/unchecked commits. Analyse at most 200 commits, 40 PRs and 128 KiB UTF-8, reduced to the model's supported context.
Keep whole records in history order; count oversized/incomplete omissions. Never cut off PR limitations and imply complete reading.
Account for every collected commit, including excluded/unexplained records. One generation per click, 240-second timeout, bounded output.

Transfer: IDs go to GitHub only on Read PRs; previewed text goes to the selected model only on Create explanation.
Native transport executes no returned tools, preserves keychain/endpoint rules and treats all source instructions as untrusted data.
Source-only sessions need app-owned receipts, not vault grants or repository writes: host/model/packet digest/count/time/outcome,
without source text. Refuse sending if recording fails; receipts cover Atlas requests, not provider downstream activity.

## States

Keys use `gitBriefing`; reuse existing `changeBriefing` calendar/retry/refresh/file controls and web `navRail.getApp`.
No synthetic history is presented as native evidence on the web.

| State | Web | macOS app |
|---|---|---|
| First run / no ontology | `webTitle`, `webBody`; get app | Visible `title` entry on launch chooser; `sourcePrompt`, `chooseRepository` in Changes |
| Model recovery without ontology | `webBody`; get app | `openFolder` opens an ontology folder; standalone exit remains available. |
| Connection audit | `webBody`; get app | `sourceAudit`; no-vault connection checks are recorded in Atlas app data on this device without repository text. |
| Model selection | `webBody`; get app | `chooseModel` opens Models; `back` returns with repository/dates. |
| Moved, replaced, unreadable or denied folder | `webBody`; get app | `sourceUnavailable`; choose again, keep dates |
| No Git history | `webBody`; get app | `noHistory`; choose another/retry |
| Loading / read error | `webBody`; get app | `loading` / `readError`; stop/retry |
| Empty period / invalid dates | `webBody`; get app | `empty` / `changeBriefing.invalidRange`; adjust dates |
| Sources ready / PR not requested | `webBody`; get app | `evidenceReady`, `prNotRequested`; sources/PRs/analyse |
| Multiple remotes / PR reading | `webBody`; get app | `remoteSelection` / `prLoading`; choose/stop |
| No matched PR / association unproved | `webBody`; get app | `noPr` / `prUnlinked`; explain local evidence |
| Unsupported/private / offline/rate-limited | `webBody`; get app | `prUnsupported` / `prUnavailable`; local sources/retry |
| GitHub rate limit / known or unknown retry time | `webBody`; get app | `prRateLimited`, `prRetryAt` / `prRetryUnknown`; local sources and explanation stay usable, no automatic retry |
| Failed PR refresh with collected descriptions | `webBody`; get app | `prRefreshFailed`; retain versioned originals and explanation, retry |
| Partial Git/PR/analysis | `webBody`; get app | `partialHistory` / `prPartial` / `partialAnalysis`, `coverage`; narrow/read omissions |
| Model absent or ACP-only / too-small context | `webBody`; get app | `modelUnavailable` / `modelLimit`; model settings/sources |
| Analysing / stopped / timeout | `webBody`; get app | `analyzing` / `cancelled` / `analysisFailed`; stop/retry/sources |
| Untranslated answer | `webBody`; get app | `languageMismatch`; keep sources and dates, retry. |
| Output length failure | `webBody`; get app | `incompleteAnalysis`; keep sources and dates, narrow the dates and retry. |
| Invalid / insufficient / receipt failure | `webBody`; get app | `invalidAnalysis` / `noExplanation` / `auditFailed`; sources/retry. Rejected answers remain in screen memory for inspection. |
| Ready / wrong explanation | `webBody`; get app | `proposed`, `attribution`, `limitsHeading`; original source |
| Source reader / incomplete original | `webBody`; get app | `sourceHeading` / `sourceUnavailableInline`; other source/back |
| Stale snapshot | `webBody`; get app | `stale`; refresh, keep dates/old attribution |
| Largest measured period | `webBody`; get app | `coverage`; overview/source, 28 commits/566 paths baseline |

Original commit and fetched PR records remain readable without generating an explanation, including records excluded from model input. Preview presents complete records by title rather than a JSON wall. Repository, PR records and accepted explanation survive the Models round trip in tab memory, keyed by repository, immutable source snapshot and period. Model results remain session-only; bounded app-owned PR-original copies are governed by [Reopen previously read PR originals](2026-10-26-reuse-read-pr-originals.md).

## Copy

Exact strings: `messages/en/gitBriefing.json`, `messages/ko/gitBriefing.json`. Generated descriptions use the interface language;
quotations retain their original language. Keys below are namespace-relative; retained controls reuse `changeBriefing`.

| Key | Where it appears | English |
|---|---|---|
| `prUnchecked` | Original commit coverage | PR lookup incomplete |
| `includedSource` / `excludedSource` / `unexplainedSource` | Original list coverage | Cited in explanation / Not sent to the model / Sent, but not explained |
| `rejectedResponse` | Invalid answer disclosure | Inspect the rejected response |
| `rejectedResponseNote` | Invalid answer disclosure | This response was not accepted as an explanation. It is kept only in this screen memory and is not saved to disk. |
| `moreSources` | Original records pagination | Read {count} more sources |
| `sourceNumber` | Citation control | Source {number} |
| `notRecorded` | Compact missing fields | Not explained: {fields} |
| `reasonLabel` / `checksLabel` / `limitsLabel` | Missing fields | Reason / Checks / Remaining limits |
| `recordingGaps` | Shared missing-data note | Check the original records for items missing from this explanation. An omitted explanation does not mean no problems remain. |
| `overviewPrompt` | Briefing hierarchy | Catch up on this period |
| `overviewIntro` | Briefing hierarchy | Bring together the changes, reasons and remaining problems recorded in commits and PRs. |
| `overviewReady` | Briefing hierarchy | Main changes in this period |
| `changeRepository` | Briefing hierarchy | Change repository |
| `sourceCount` | Briefing hierarchy | {count} commit messages read |
| `prepare` | Briefing hierarchy | Preview explanation sources |
| `preparing` | Briefing hierarchy | Checking the model and preparing your source preview… |
| `sendPacket` | Briefing hierarchy | Create explanation from these sources |
| `cancelling` | Briefing hierarchy | Stopping… Your sources and dates are kept. |
| `readPrHelp` | Briefing hierarchy | PR descriptions can add the reasons and checks missing from merge messages. |
| `readPeriodCode` | Briefing hierarchy | Read code changes for the whole period |
| `prCount` | Briefing hierarchy | {count} PR descriptions read |
| `claimsNote` | Briefing hierarchy | Based on author records · open a citation to check the original. |
| `prTransferDetails` | PR transfer disclosure | What goes to GitHub |
| `prCancelled` | Stopped PR read | PR reading stopped. Local sources and dates are kept. |
| `title` | Page | Git and PR briefing |
| `sourcePrompt` | First run | Choose a Git repository to catch up on its commits and PR descriptions. An ontology is optional. |
| `chooseRepository` | Repository control | Choose Git repository |
| `webTitle` | Web limit | Git and PR briefing needs the installed app |
| `webBody` | Web limit | Choose a repository folder in the installed app to read local Git history and create an explanation with your connected model. |
| `sourceUnavailable` | Folder failure | This repository is unavailable or its folder permission expired. Choose it again; your dates are kept. |
| `noHistory` | History absence | This folder has no readable Git history. Choose another repository or retry after its first commit. |
| `loading` | Local read | Reading the selected repository and period… |
| `readError` | Local read failure | Could not read Git history. Your repository and dates are kept; try again. |
| `empty` | Period | No commits were found in this period. Choose another period. |
| `evidenceReady` | Sources ready | The local history is ready. Read its sources or create an explanation. |
| `scope` | Read basis | Current branch, first-parent commits, using the shown local dates. Merged branch commits are not counted separately; uncommitted changes are excluded. |
| `partialHistory` | Coverage | Some Git history could not be read within the limit. Counts cover returned evidence; narrow the dates to read more. |
| `readPrs` | PR action | Read GitHub PR descriptions |
| `prTransfer` | PR action | GitHub receives {repository} and the selected commit IDs or PR numbers. Commit messages and file contents are not uploaded by this read. |
| `prLoading` | PR read | Reading PR descriptions from GitHub… |
| `prNotRequested` | PR coverage | PR descriptions have not been requested. You can explain the local commit messages or read PR descriptions first. |
| `prUnsupported` | PR coverage | PR reading currently supports public github.com repositories. Local commit messages remain available. |
| `prRefreshFailed` | Failed refresh with retained PR originals | Could not refresh PR descriptions. Previously read versions and your explanation are kept; they have not been refreshed. Retry when ready. |
| `prRateLimited` | PR rate-limit recovery | GitHub has temporarily limited PR requests. Your local commit messages remain available. |
| `prRetryAt` | PR rate-limit recovery | GitHub asks you to retry after {time}. Atlas will not retry automatically. |
| `prRetryUnknown` | PR rate-limit recovery | GitHub did not provide a usable retry time. Try again later. |
| `prUnavailable` | PR failure | Could not read these PR descriptions. Access, network or rate limits may be the cause; keep the local sources or retry. |
| `noPr` | PR coverage | No matching merged PR was found for the commits checked. This does not prove that the repository has no PRs. |
| `prPartial` | PR coverage | PR lookup is incomplete. Only the descriptions read so far are available; some commits remain unchecked. |
| `prUnlinked` | Source association | This PR could not be tied to the selected history. Its description is excluded from the explanation. |
| `prVersion` | PR reader | PR #{number} · description updated {updatedAt} · read {fetchedAt} |
| `analyse` | Analysis action | Create explanation |
| `chooseModel` | Analysis action | Choose model |
| `transfer` | Analysis action | {model} at {destination} will receive the previewed commit messages, matched PR descriptions, source IDs and period. Code contents and ontology documents are excluded. |
| `packet` | Analysis action | Analysis includes {commits} commits and {prs} PR descriptions · {bytes} bytes. |
| `previewPacket` | Analysis action | Review text to send |
| `modelUnavailable` | Model absence | No connected text model is available. Check Models in Settings, or keep reading the sources. |
| `modelLimit` | Model limit | This model cannot accept the selected text. Keep your sources and narrow the dates or choose another connected model. |
| `analyzing` | Analysis | Creating an explanation from the shown sources… |
| `stop` | In-flight action | Stop |
| `cancelled` | Stopped | Stopped. Sources and dates are kept. Text already sent to the model cannot be recalled. |
| `analysisFailed` | Failure/timeout | The model did not return an explanation. Sources and dates are kept; try again. |
| `invalidAnalysis` | Rejected answer | The explanation could not be matched to its sources. Read the sources or try again. |
| `noExplanation` | Insufficient descriptions | The included descriptions do not support a useful explanation. Read the sources or choose another period. |
| `auditFailed` | Transfer record failure | The transfer record could not be completed, so this result is not shown. This request may have been sent. Check disk space and recording-folder access before retrying. |
| `stale` | Snapshot | The repository or source descriptions changed. Refresh the sources before creating a new explanation. |
| `partialAnalysis` | Coverage | This explanation covers only part of the collected sources. Narrow the dates to include more. |
| `coverage` | Overview | {included} of {collected} collected commits included · {prs} matched PR descriptions. |
| `proposed` | Overview | Proposed explanation |
| `attribution` | Overview | Based on commit and PR descriptions. Atlas has not independently verified their behavior or test claims. |
| `changesHeading` | Theme | What changed |
| `reasonHeading` | Theme | Why it changed |
| `checksOriginal` | Expanded validation | Author validation is quoted directly from the cited records. |
| `checksHeading` | Theme | Checks the authors report |
| `limitsHeading` | Overview/theme | Limits recorded by the author |
| `reported` | Claim | Reported by the author |
| `inferred` | Claim | Inferred from the cited descriptions |
| `reasonMissing` | Theme | The included descriptions do not state a reason. |
| `checksMissing` | Theme | The included descriptions do not state which checks ran. |
| `limitsMissing` | Theme | The included descriptions do not state remaining limits. This is not evidence that none remain. |
| `readSources` | Overview/recovery | Read sources |
| `sourceHeading` | Evidence reader | Source evidence |
| `sourceCitation` | Citation action | Read source {source} |
| `back` | Evidence reader | Back to explanation |
| `excluded` | Coverage | {count} collected source records were not included in this explanation. |
| `sourceVersion` | Commit reader | Commit {hash} · source snapshot {snapshot} |
| `sourceUnavailableInline` | Evidence reader | This source text is unavailable or incomplete. It cannot support an explanation; other sources remain readable. |
| `optionalOntology` | Optional context | Related ontology context |
| `ontologyNote` | Optional context | These are current recorded concepts. They do not determine the briefing or verify historical behavior. |
| `prSnapshotNote` | PR reader | This is the PR description as fetched, which may differ from what it said when merged. |
| `remoteSelection` | Multiple remotes | Choose the public GitHub repository whose PR descriptions you want to read. |
| `unexplained` | Coverage | {count} included source records were not explained. Read them alongside this partial explanation. |

| `prFirst` | Unrequested public PR source action | Read PR descriptions first |
| `analyseCommits` | No PR description in the selected sources | Explain commit messages only |
| `commitOnlyNote` | Commit-only explanation limitation | Commit messages alone may lack reasons, author-reported checks and remaining limits. |

## Edge cases

- Empty, root/single commit and the observed 28-commit/566-path week; 2,001 commits, 41 PRs and 128-KiB overflow are synthetic probes.
- Hangul text/paths, preserved date drafts, Monday weeks, DST/leap years, detached HEAD, reverts and nonmonotonic dates retain their semantics.
- Empty PR body differs from unavailable, unrequested, not found, unlinked and truncated. A 404 cannot prove absence/private status.
- Working-file edits are excluded; branch/root replacement invalidates reads. Changed PR text becomes stale on explicit refresh, not polling.
- Offline Git and the connected local model remain usable; missing Git objects never trigger a fetch.

## Out of scope

- Graph writes, accepted meaning, independent behavior/test verification and risk scores: descriptions cannot establish these.
- Private/enterprise/other PR services and new auth: retain local evidence without inventing a credential adapter.
- ACP/subscription analysis: generic read-only mode does not prove text-only execution; current local Models supplies the first path.
- Code in model input, all-branch rollups, schedules, persisted briefings and notifications: explicit period explanation comes first.

## Acceptance criteria

1. Given a cold real installed-app launch with no vault, the visible briefing entry reaches Changes without creating/opening
   ontology. Choosing a repository and period, opening Models and returning retains that repository and period; other vault
   destinations stay guarded. With the existing local model, when the owner reads 2026-10-19..25
   with PRs and creates an explanation, then map work/reasons, #2925's reported 53/57 ms first-frame failures against 50 ms and
   #2934's release-metadata work are findable before opening individual commits. Require native walkthrough and source-linked answer;
   connection success/file counts fail this recovery proof. Do not claim comprehension without the owner's response.
2. Given a directly picked repository, when reading or changing identity, native integration fixtures prove exact grant/HEAD scope,
   full bodies, first-parent/date semantics, wrapper merges and stale rejection; source/index/branches/remotes remain unchanged.
   Preserve existing patch/file-navigation proofs.
3. Given public/private/offline/rate-limited/empty PRs and unrelated number mentions, PR fixtures prove same-repository integration
   membership, #2925 wrapper support, mutable-body stamps and absence-versus-unavailability; only approved IDs go to GitHub.
4. Given the connected local model and source commands/URLs/forged instructions, native transport probes prove one text request,
   preview equality, no tool/MCP execution or source/ontology write, local receipt, timeout/cancellation and late-answer rejection.
   Model/host changes update the disclosed destination; receipt failure prevents sending.
5. Given sparse/missing/oversized/contradictory descriptions, fixtures reject bad citations/quotes and false coverage. Live review must
   retain #2925's open frame failure, keep its corrected check failure out of unresolved limits, and never extend its ontology claim
   to #2934. Long branch/test inventories and misleading action translations fail explanation utility; valid source IDs alone cannot pass.
6. Given zero/one/28-commit and synthetic oversized inputs, collection/packet tests account for included/excluded/unexplained records,
   never summarize truncated PRs as complete, and retain Hangul/date inputs plus offline-local-model originals.
7. Given overview/citation/error/stale states, focused e2e, routed UI audit and actual macOS 2560/1920 plus narrow/zoom captures prove
   in-Atlas originals/patches, immediate keyboard actions, focus/scroll return and truthful web degradation.
8. Given completed code and all locales, `pnpm checks:changed -- --run` completes every recommendation and installed proof uses
   current source. This spec-only task establishes none of the proposed runtime/security/explanation-quality proof.

## Risks

1. A polished account erases failures or presents claims as facts: visible limits, exact citations and the live #2925 adverse case.
2. PR text belongs to other history or changes after merge: local integration proof, fetched versions and explicit unlinked states.
3. Large periods or model failures create plausible partial stories: separate collection/analysis coverage, bounded requests,
   preserved originals and measured local-model usefulness before declaring completion.

## Later

1. ACP-only readers: a proven tool-disabled profile when a text-model connection is unavailable.
2. Private/other PR services: when inaccessible real repositories block usefulness and a read-only credential path is approved.
3. Saved catch-up/richer ontology context: when repeated reading shows these, rather than explanation quality, are the burden.

## Owner question

None — authorized Git/PR-first explanation has a public repository and responsive local model.
Repository/period/model selection is reversible; source-only receipts and PR collection need implementation/proof, not new approval.

The bounded packet carries collected/included/excluded counts and PR lookup status/counts. The original list distinguishes cited, sent-but-unexplained and omitted records. PR reading remains available after explanation success; a fresh fetched description version invalidates the displayed explanation. Native text generation requests a strict JSON schema, then the renderer separately validates citation membership. Schema compliance does not establish semantic correctness.

Packet IDs are compact references scoped to the pinned source snapshot. Full commit SHA and PR digest remain in the source reader metadata. Titles already present in complete original text are not duplicated in the model packet. Whole-record omission and coverage accounting remain unchanged.

After a real 28-commit run exhausted its output allowance, the explanation is bounded to three themes, one 80-character sentence per claim, and one reported check and unresolved limit per theme. An announced change is not a test result: checks require a recorded test command, result or measured validation. The output ceiling is 2,200 tokens within the existing reserved context; incomplete responses still fail closed. The first 1800-token truncated response remains adverse evidence.

Wide displays show the three main changes side by side. Unexplained reasons/checks/limits are named in each card footer, with one shared uncertainty note; known limits stay visible and populated checks remain expandable. Citation controls read Source 1/2/3 within each claim instead of exposing global passage ordinals. Exact source and passage navigation is unchanged.

A model choosing null or an empty list does not prove source absence. Compact footers therefore mark fields as not explained, with original records still reachable. A real PR run returned English in a Korean interface and omitted a recorded reason; the native prompt now names the full output language after the schema, and Korean claims without Hangul are rejected. This coarse language check is not a semantic correctness test. Where source limits include measurements and a target, the prompt requires both.

A public-PR snapshot probe misclassified 22/22 browser cases as desktop verification. Author check content is therefore displayed as exact cited source passages, with a source link; model check paraphrases are not rendered. Populated unresolved limits precede expandable check records. The language check applies to translated change/reason claims, while original quoted validation retains its source language. This does not independently verify the author claims.

An installed-app run mislabeled completed fixes as remaining issues. Checks and limits now require cited passages under recognized author markup (Checks/Validation/Verification/Tests/Test plan, or Limits/Limitations/Remaining/Known issues/Open issues/Unresolved/Caveats). Unsupported classifications are omitted and keep the result partial. Both fields render exact recognized source excerpts, retaining measurements and targets. Unrecognized conventions remain unexplained; author records are observations at their source version, not a current-health assertion.
